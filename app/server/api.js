/**
 * api.js — REST API 路由
 *
 * 提供连接配置（profiles）、偏好设置（settings）、背景图（background）
 * 的增删改查接口，以及关闭服务、客户端日志上报等辅助接口。
 * 通过 applyApiRoutes 将全部路由挂载到 Express 应用上。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import express from 'express';
import { uploadsDir, backgroundPath, settingsPath } from './config.js';
import {
  publicProfile,
  readProfiles,
  writeProfiles,
  queueProfilesMutation,
  clampOpacity,
  readBackground,
  clampSetting,
  readSettings,
  validateBackgroundImage,
  readTransferHistory,
  writeTransferHistory
} from './store.js';
import { isTrustedMutationOrigin } from './security.js';

/**
 * 将全部 REST API 路由挂载到 Express 应用。
 * @param {import('express').Express} app Express 应用实例
 * @param {object} deps 依赖注入
 * @param {() => void} deps.shutdownServer 关闭 HTTP 服务器（终止 WS 与进程）的回调
 */
export function applyApiRoutes(app, deps) {
  const { shutdownServer } = deps;

  // 对会修改服务器状态的请求统一做来源（Origin）校验，防止 CSRF
  app.use('/api', (request, response, next) => {
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method)) return next();
    if (isTrustedMutationOrigin(request)) return next();
    response.status(403).json({ message: '请求来源不受信任。' });
  });

  app.get('/api/transfer-history', async (_request, response) => {
    try {
      response.json(await readTransferHistory());
    } catch {
      response.status(500).json({ message: '无法读取传输历史。' });
    }
  });

  app.put('/api/transfer-history', express.json({ limit: '1mb' }), async (request, response) => {
    try {
      response.json(await writeTransferHistory(request.body));
    } catch {
      response.status(500).json({ message: '无法保存传输历史。' });
    }
  });

  // —— 连接配置（profiles）——

  /** GET /api/profiles — 获取全部连接配置（已脱敏） */
  app.get('/api/profiles', async (_request, response) => {
    try {
      response.json((await readProfiles()).map(publicProfile));
    } catch {
      response.status(500).json({ message: '无法读取连接配置。' });
    }
  });

  /** POST /api/profiles — 新建或按名称覆盖连接配置 */
  app.post('/api/profiles', express.json({ limit: '64kb' }), async (request, response) => {
    const profile = publicProfile(request.body ?? {});
    if (!profile.name || !profile.host || !profile.username || !Number.isInteger(profile.port) || profile.port < 1 || profile.port > 65535) {
      return response.status(400).json({ message: '请填写有效的连接名称、主机、端口和用户名。' });
    }
    try {
      await queueProfilesMutation(async () => {
        const profiles = await readProfiles();
        const index = profiles.findIndex((item) => item.name === profile.name);
        if (index >= 0) profiles[index] = profile;
        else profiles.push(profile);
        await writeProfiles(profiles);
      });
      response.json({ profile });
    } catch {
      response.status(500).json({ message: '无法保存连接配置。' });
    }
  });

  /** DELETE /api/profiles/:name — 按名称删除连接配置 */
  app.delete('/api/profiles/:name', async (request, response) => {
    try {
      const removed = await queueProfilesMutation(async () => {
        const profiles = await readProfiles();
        const remaining = profiles.filter((profile) => profile.name !== request.params.name);
        if (remaining.length === profiles.length) return false;
        await writeProfiles(remaining);
        return true;
      });
      if (!removed) return response.status(404).json({ message: '连接配置不存在。' });
      response.status(204).end();
    } catch {
      response.status(500).json({ message: '无法删除连接配置。' });
    }
  });

  // —— 背景图（background）——

  /** GET /api/background — 获取背景设置 */
  app.get('/api/background', async (_request, response) => {
    try {
      response.json(await readBackground());
    } catch {
      response.status(500).json({ message: '无法读取背景设置。' });
    }
  });

  /** POST /api/background — 上传背景图（base64）并保存设置 */
  app.post('/api/background', express.json({ limit: '16mb' }), async (request, response) => {
    try {
      const body = request.body ?? {};
      const current = await readBackground();
      let url = current.url;
      const { data, contentType } = body;
      if (data) {
        const valid = validateBackgroundImage(contentType, data);
        if (!valid) return response.status(400).json({ message: '仅支持 PNG、JPEG、WebP 或 GIF 图片，且大小必须在 8MB 以内。' });
        await fs.mkdir(uploadsDir, { recursive: true });
        await fs.writeFile(path.join(uploadsDir, `background.${valid.extension}`), valid.buffer);
        url = `/uploads/background.${valid.extension}`;
      }
      const opacity = clampOpacity(body.opacity);
      await fs.writeFile(backgroundPath, `${JSON.stringify({ url, opacity }, null, 2)}\n`, 'utf8');
      response.json({ url, opacity });
    } catch {
      response.status(500).json({ message: '无法保存背景设置。' });
    }
  });

  /** DELETE /api/background — 清除背景图与设置 */
  app.delete('/api/background', async (_request, response) => {
    try {
      const current = await readBackground();
      if (current.url) {
        const filename = path.basename(current.url);
        await fs.rm(path.join(uploadsDir, filename), { force: true }).catch(() => {});
      }
      await fs.rm(backgroundPath, { force: true }).catch(() => {});
      response.json({ url: null, opacity: 0.5 });
    } catch {
      response.status(500).json({ message: '无法清除背景设置。' });
    }
  });

  // —— 偏好设置（settings）——

  /** GET /api/settings — 获取偏好设置 */
  app.get('/api/settings', async (_request, response) => {
    try {
      response.json(await readSettings());
    } catch {
      response.status(500).json({ message: '无法读取偏好设置。' });
    }
  });

  /** PUT /api/settings — 保存偏好设置 */
  app.put('/api/settings', express.json({ limit: '16kb' }), async (request, response) => {
    try {
      const current = await readSettings();
      const body = request.body ?? {};
      const updated = { ...current };
      for (const key of Object.keys({ theme: 1, fontSize: 1, fontWeight: 1, letterSpacing: 1, fontColor: 1, pinnedOrder: 1 })) {
        if (body[key] !== undefined) updated[key] = clampSetting(key, body[key]);
      }
      await fs.writeFile(settingsPath, `${JSON.stringify(updated, null, 2)}\n`, 'utf8');
      response.json(updated);
    } catch {
      response.status(500).json({ message: '无法保存偏好设置。' });
    }
  });

  // —— 辅助接口 ——

  /** POST /api/log-client-error — 上报前端运行时错误（前端错误兜底） */
  app.post('/api/log-client-error', express.json({ limit: '16kb' }), (request, response) => {
    const message = typeof request.body?.message === 'string' ? request.body.message.slice(0, 2000) : '(无消息)';
    console.error(`[${new Date().toISOString()}] [client] 页面错误：${message}`);
    response.status(204).end();
  });

  /** POST /api/shutdown — 优雅关闭服务（受来源校验保护） */
  app.post('/api/shutdown', (_request, response) => {
    response.status(202).json({ ok: true });
    if (shutdownServer) setTimeout(shutdownServer, 100);
  });
}
