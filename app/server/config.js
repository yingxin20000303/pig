/**
 * config.js — 应用常量与运行时配置
 *
 * 集中管理端口、路径、文件大小限制等配置项，便于统一调整与维护。
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/** 当前模块所在目录（server/），用于推导应用根目录 */
const moduleDir = path.dirname(fileURLToPath(import.meta.url));

/** 应用根目录（app/），即 server/ 的上一级 */
export const APP_ROOT = path.resolve(moduleDir, '..');

/** 监听端口（环境变量 PORT 覆盖，默认 1314） */
export const port = process.env.PORT === undefined ? 1314 : Number(process.env.PORT);

/** 监听地址（环境变量 WEBSSH_HOST 覆盖，默认仅本机回环） */
export const host = process.env.WEBSSH_HOST || '127.0.0.1';

/** 前端静态资源目录 */
export const publicDir = path.join(APP_ROOT, 'public');

/** 本地上传目录（含背景图），通过 /uploads 静态暴露 */
export const uploadsDir = process.env.WEBSSH_UPLOADS_PATH || path.join(publicDir, 'uploads');

/** 连接配置文件路径（加密存储） */
export const profilesPath = process.env.WEBSSH_PROFILES_PATH || path.join(APP_ROOT, 'ssh-connections.json');

/** 连接配置加密密钥文件路径 */
export const profilesKeyPath = process.env.WEBSSH_PROFILES_KEY_PATH || `${profilesPath}.key`;

/** 背景设置文件路径 */
export const backgroundPath = process.env.WEBSSH_BACKGROUND_PATH || path.join(APP_ROOT, 'background.json');

/** 偏好设置文件路径 */
export const settingsPath = process.env.WEBSSH_SETTINGS_PATH || path.join(APP_ROOT, 'settings.json');

/** 文件传输历史路径 */
export const transferHistoryPath = process.env.WEBSSH_TRANSFER_HISTORY_PATH || path.join(APP_ROOT, 'transfer-history.json');

/** 连接配置允许保存的字段白名单（防止冗余/未知字段入库） */
export const profileFields = ['name', 'host', 'port', 'username', 'authMode', 'password', 'privateKey', 'passphrase', 'pinned'];

/** 连接配置加密格式版本号 */
export const PROFILE_ENCRYPTION_VERSION = 1;

/** 默认背景设置 */
export const DEFAULT_BACKGROUND = { url: null, opacity: 0.5 };

/** 背景图支持的 MIME 类型 → 扩展名映射 */
export const BACKGROUND_CONTENT_TYPES = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif' };

/** 背景图最大体积（8MB） */
export const MAX_BACKGROUND_SIZE = 8 * 1024 * 1024;

/** 默认偏好设置 */
export const DEFAULT_SETTINGS = {
  theme: 'dark',
  fontSize: 14,
  fontWeight: 400,
  letterSpacing: 0,
  fontColor: null,
  pinnedOrder: []
};

/** 偏好设置数值型字段的允许范围（用于钳制非法输入） */
export const SETTINGS_CLAMPS = { fontSize: [10, 24], fontWeight: [100, 900], letterSpacing: [-2, 8] };

/** 单个 WebSocket 消息最大体积（1MB），防止超大消息拖垮进程 */
export const MAX_MESSAGE_SIZE = 1024 * 1024;
