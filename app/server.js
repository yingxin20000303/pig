/**
 * server.js — 应用入口
 *
 * 组装 Express 静态资源、REST API 路由与 WebSocket 服务，
 * 并负责进程级错误兜底与 HTTP 服务启动。
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import http from 'node:http';
import express from 'express';
import { port, host, publicDir, uploadsDir } from './server/config.js';
import { logServerError } from './server/logger.js';
import { applyApiRoutes } from './server/api.js';
import { createWebSocketServer } from './server/ws.js';

// 确保上传目录存在（用于背景图等静态资源）
await fs.mkdir(uploadsDir, { recursive: true }).catch(() => {});

const app = express();

// —— 静态资源 ——
app.use('/uploads', express.static(uploadsDir, {
  setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=0'); }
}));
app.use(express.static(publicDir, {
  setHeaders: (res) => { res.setHeader('Cache-Control', 'public, max-age=0'); }
}));

// SPA 回退：非 API 的 HTML 请求返回 index.html
app.use((request, response, next) => {
  if (request.method !== 'GET' || request.path.startsWith('/api')) return next();
  if (request.accepts('html')) {
    response.sendFile(path.join(publicDir, 'index.html'));
    return;
  }
  next();
});

// —— REST API ——
applyApiRoutes(app, {
  shutdownServer: () => {
    wss.clients.forEach((client) => client.terminate());
    wss.close(() => server.close(() => process.exit(0)));
  }
});

// —— HTTP + WebSocket ——
const server = http.createServer(app);
const wss = createWebSocketServer(server);

// —— 进程级错误兜底 ——
process.on('uncaughtException', (error) => {
  logServerError('uncaughtException', error);
});
process.on('unhandledRejection', (reason) => {
  logServerError('unhandledRejection', reason);
});

// —— 启动 ——
server.listen(port, host, () => {
  const address = server.address();
  const listeningPort = typeof address === 'object' && address ? address.port : port;
  console.log(`WebSSH 正在监听 http://${host}:${listeningPort}`);
});

export { server };
