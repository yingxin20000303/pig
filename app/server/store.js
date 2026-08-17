/**
 * store.js — 数据持久化层
 *
 * 负责连接配置（profiles）、偏好设置（settings）、背景设置（background）
 * 三类 JSON 数据文件的读取、加密、原子写入与串行队列化写入。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { logServerError } from './logger.js';
import {
  profilesPath,
  profilesKeyPath,
  settingsPath,
  backgroundPath,
  profileFields,
  PROFILE_ENCRYPTION_VERSION,
  DEFAULT_BACKGROUND,
  BACKGROUND_CONTENT_TYPES,
  MAX_BACKGROUND_SIZE,
  DEFAULT_SETTINGS,
  SETTINGS_CLAMPS
} from './config.js';

/** 连接配置加密密钥（Promise 缓存，避免重复读取） */
let profilesKeyPromise;

/** profiles 写队列与变更队列（保证串行化，防止并发覆盖） */
let profilesWriteChain = Promise.resolve();
let profilesMutationChain = Promise.resolve();

/**
 * 将连接配置归一化为对外安全的公开结构。
 * 去除无关字段、规范化类型，但保留密码/私钥/口令等敏感字段（用于落盘）。
 * @param {object} profile 原始连接配置
 * @returns {object} 归一化后的连接配置
 */
export function publicProfile(profile) {
  const normalized = Object.fromEntries(profileFields.map((field) => [field, profile[field] ?? '']));
  normalized.name = String(normalized.name).trim();
  normalized.host = String(normalized.host).trim();
  normalized.username = String(normalized.username).trim();
  normalized.port = Number(normalized.port) || 22;
  normalized.authMode = normalized.authMode === 'key' ? 'key' : 'password';
  normalized.password = normalized.authMode === 'password' ? String(normalized.password) : '';
  normalized.privateKey = normalized.authMode === 'key' ? String(normalized.privateKey) : '';
  normalized.passphrase = normalized.authMode === 'key' ? String(normalized.passphrase) : '';
  normalized.pinned = normalized.pinned === true || normalized.pinned === 'true';
  return normalized;
}

/**
 * 解码环境变量 WEBSSH_PROFILES_KEY（支持 base64 或 64 位十六进制）。
 * @param {string} value 原始密钥字符串
 * @returns {Buffer} 32 字节密钥
 */
function decodeProfilesKey(value) {
  const source = String(value || '').trim();
  const key = /^[0-9a-f]{64}$/i.test(source) ? Buffer.from(source, 'hex') : Buffer.from(source, 'base64');
  if (key.length !== 32) throw new Error('WEBSSH_PROFILES_KEY 必须是 32 字节的 Base64 或 64 位十六进制密钥。');
  return key;
}

/**
 * 获取连接配置加密密钥：优先环境变量，否则读取/生成密钥文件。
 * @returns {Promise<Buffer>} 32 字节 AES 密钥
 */
async function getProfilesKey() {
  if (profilesKeyPromise) return profilesKeyPromise;
  profilesKeyPromise = (async () => {
    if (process.env.WEBSSH_PROFILES_KEY) return decodeProfilesKey(process.env.WEBSSH_PROFILES_KEY);
    await fs.mkdir(path.dirname(profilesKeyPath), { recursive: true });
    try {
      await fs.writeFile(profilesKeyPath, crypto.randomBytes(32), { flag: 'wx', mode: 0o600 });
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
    }
    const key = await fs.readFile(profilesKeyPath);
    if (key.length !== 32) throw new Error('连接配置密钥文件无效，请恢复备份或设置 WEBSSH_PROFILES_KEY。');
    await fs.chmod(profilesKeyPath, 0o600).catch(() => {});
    return key;
  })();
  return profilesKeyPromise;
}

/**
 * 使用 AES-256-GCM 加密连接配置，输出 JSON 信封。
 * @param {Array<object>} profiles 连接配置数组
 * @param {Buffer} key 32 字节 AES 密钥
 * @returns {string} 序列化的加密信封 JSON
 */
function encryptProfiles(profiles, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(profiles.map(publicProfile)), 'utf8');
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return JSON.stringify({
    version: PROFILE_ENCRYPTION_VERSION,
    algorithm: 'aes-256-gcm',
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    ciphertext: ciphertext.toString('base64')
  }, null, 2) + '\n';
}

/**
 * 解密连接配置加密信封。
 * @param {object} envelope 加密信封对象
 * @param {Buffer} key 32 字节 AES 密钥
 * @returns {Array<object>} 解密并归一化的连接配置数组
 */
function decryptProfiles(envelope, key) {
  if (envelope?.version !== PROFILE_ENCRYPTION_VERSION || envelope.algorithm !== 'aes-256-gcm') {
    throw new Error('不支持的连接配置加密格式。');
  }
  const iv = Buffer.from(String(envelope.iv || ''), 'base64');
  const tag = Buffer.from(String(envelope.tag || ''), 'base64');
  const ciphertext = Buffer.from(String(envelope.ciphertext || ''), 'base64');
  if (iv.length !== 12 || tag.length !== 16 || !ciphertext.length) throw new Error('连接配置加密数据无效。');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const profiles = JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8'));
  if (!Array.isArray(profiles)) throw new Error('连接配置内容无效。');
  return profiles.map(publicProfile);
}

/**
 * 原子写入文件：写入临时文件后重命名，避免写入中断损坏数据。
 * @param {string} filePath 目标文件路径
 * @param {string} content 写入内容
 * @param {number} [mode=0o600] 文件权限
 */
export async function writeFileAtomically(filePath, content, mode = 0o600) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = path.join(path.dirname(filePath), `.${path.basename(filePath)}.${process.pid}.${crypto.randomBytes(6).toString('hex')}.tmp`);
  try {
    await fs.writeFile(temporaryPath, content, { encoding: 'utf8', mode });
    await fs.rename(temporaryPath, filePath);
    await fs.chmod(filePath, mode).catch(() => {});
  } catch (error) {
    await fs.rm(temporaryPath, { force: true }).catch(() => {});
    throw error;
  }
}

/**
 * 将写操作加入 profiles 串行写队列。
 * @param {() => Promise<unknown>} operation 写操作
 * @returns {Promise<unknown>} 操作结果
 */
export function queueProfilesWrite(operation) {
  const pending = profilesWriteChain.then(operation, operation);
  profilesWriteChain = pending.catch(() => {});
  return pending;
}

/**
 * 将读-改-写操作加入 profiles 变更队列，保证并发修改不互相覆盖。
 * @param {() => Promise<unknown>} operation 变更操作
 * @returns {Promise<unknown>} 操作结果
 */
export function queueProfilesMutation(operation) {
  const pending = profilesMutationChain.then(operation, operation);
  profilesMutationChain = pending.catch(() => {});
  return pending;
}

/**
 * 读取连接配置（兼容旧版明文数组，读取后自动迁移为加密存储）。
 * @returns {Promise<Array<object>>} 连接配置数组
 */
export async function readProfiles() {
  try {
    const parsed = JSON.parse(await fs.readFile(profilesPath, 'utf8'));
    if (Array.isArray(parsed)) {
      const profiles = parsed.map(publicProfile);
      await writeProfiles(profiles);
      return profiles;
    }
    return decryptProfiles(parsed, await getProfilesKey());
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}

/**
 * 将连接配置加密后原子写入磁盘（走写队列）。
 * @param {Array<object>} profiles 连接配置数组
 */
export async function writeProfiles(profiles) {
  return queueProfilesWrite(async () => {
    const key = await getProfilesKey();
    await writeFileAtomically(profilesPath, encryptProfiles(profiles, key));
  });
}

/**
 * 将透明度钳制到 [0, 1] 范围内。
 * @param {unknown} value 原始值
 * @returns {number} 钳制后的透明度
 */
export function clampOpacity(value) {
  const opacity = Number(value);
  return Number.isFinite(opacity) ? Math.min(1, Math.max(0, opacity)) : DEFAULT_BACKGROUND.opacity;
}

/**
 * 读取背景设置。
 * @returns {Promise<{ url: string | null, opacity: number }>} 背景设置
 */
export async function readBackground() {
  try {
    const saved = JSON.parse(await fs.readFile(backgroundPath, 'utf8'));
    return {
      url: typeof saved.url === 'string' && saved.url ? saved.url : null,
      opacity: clampOpacity(saved.opacity)
    };
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_BACKGROUND };
    throw error;
  }
}

/**
 * 将偏好设置字段钳制到合法范围/类型。
 * @param {string} key 字段名
 * @param {unknown} value 原始值
 * @returns {unknown} 钳制后的值
 */
export function clampSetting(key, value) {
  if (key === 'theme') return value === 'light' ? 'light' : 'dark';
  if (key === 'fontColor') return (typeof value === 'string' && value) || null;
  if (key === 'pinnedOrder') return Array.isArray(value) ? value.filter((v) => typeof v === 'string') : [];
  const range = SETTINGS_CLAMPS[key];
  if (range) { const n = Number(value); return Number.isFinite(n) ? Math.min(range[1], Math.max(range[0], n)) : DEFAULT_SETTINGS[key]; }
  return DEFAULT_SETTINGS[key];
}

/**
 * 读取偏好设置（自动补全缺失字段并钳制非法值）。
 * @returns {Promise<object>} 偏好设置对象
 */
export async function readSettings() {
  try {
    const saved = JSON.parse(await fs.readFile(settingsPath, 'utf8'));
    const result = { ...DEFAULT_SETTINGS };
    for (const key of Object.keys(DEFAULT_SETTINGS)) result[key] = clampSetting(key, saved[key]);
    return result;
  } catch (error) {
    if (error.code === 'ENOENT') return { ...DEFAULT_SETTINGS };
    throw error;
  }
}

/**
 * 校验背景图片数据并返回可用类型扩展名。
 * @param {string} contentType 图片 MIME 类型
 * @param {string} data base64 编码的图片数据
 * @returns {{ buffer: Buffer, extension: string } | null} 合法时返回数据与扩展名
 */
export function validateBackgroundImage(contentType, data) {
  const extension = BACKGROUND_CONTENT_TYPES[String(contentType || '')];
  if (!extension) return null;
  let buffer;
  try {
    buffer = Buffer.from(String(data), 'base64');
  } catch {
    return null;
  }
  if (!buffer.length || buffer.length > MAX_BACKGROUND_SIZE) return null;
  return { buffer, extension };
}
