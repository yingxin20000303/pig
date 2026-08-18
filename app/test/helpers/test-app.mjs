/**
 * test-app.mjs — 以隔离环境启动真实 server.js 的测试宿主
 *
 * 数据文件全部指向临时目录，端口随机，避免污染真实用户数据。
 */
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const appDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

/**
 * 启动隔离的 WebSSH 服务实例。
 * @returns {Promise<{ baseUrl: string, wsUrl: string, origin: string, dataDir: string, stop: () => Promise<void>, logs: string[] }>}
 */
export async function startApp() {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'webssh-test-'));
  const env = {
    ...process.env,
    PORT: '0', // 随机端口；server.js 读取 listeningPort，但 config.port=0 传入 listen
    WEBSSH_HOST: '127.0.0.1',
    WEBSSH_UPLOADS_PATH: path.join(dataDir, 'uploads'),
    WEBSSH_PROFILES_PATH: path.join(dataDir, 'ssh-connections.json'),
    WEBSSH_BACKGROUND_PATH: path.join(dataDir, 'background.json'),
    WEBSSH_SETTINGS_PATH: path.join(dataDir, 'settings.json'),
    WEBSSH_TRANSFER_HISTORY_PATH: path.join(dataDir, 'transfer-history.json')
  };
  const child = spawn(process.execPath, ['server.js'], { cwd: appDir, env, stdio: ['ignore', 'pipe', 'pipe'] });
  const logs = [];
  child.stdout.on('data', (d) => logs.push(d.toString()));
  child.stderr.on('data', (d) => logs.push(d.toString()));

  // 轮询直到 HTTP 就绪并解析实际端口（从启动日志中提取）
  const baseUrl = await new Promise((resolve, reject) => {
    const started = Date.now();
    const timer = setInterval(async () => {
      const output = logs.join('');
      const match = output.match(/http:\/\/127\.0\.0\.1:(\d+)/);
      if (match) {
        clearInterval(timer);
        resolve(`http://127.0.0.1:${match[1]}`);
      } else if (Date.now() - started > 15000) {
        clearInterval(timer);
        reject(new Error(`服务启动超时。日志：\n${output}`));
      } else if (child.exitCode !== null) {
        clearInterval(timer);
        reject(new Error(`服务提前退出（code=${child.exitCode}）。日志：\n${output}`));
      }
    }, 100);
  });

  return {
    baseUrl,
    wsUrl: baseUrl.replace('http', 'ws') + '/ssh',
    origin: baseUrl,
    dataDir,
    logs,
    stop: () => new Promise((resolve) => {
      child.on('exit', () => resolve());
      child.kill('SIGTERM');
      setTimeout(() => { try { child.kill('SIGKILL'); } catch { /* 已退出 */ } resolve(); }, 3000);
    })
  };
}

/**
 * 发送带可信 Origin 的 JSON 请求。
 * @param {string} baseUrl 基地址
 * @param {string} apiPath 路径
 * @param {object} [options] { method, body, origin, headers }
 */
export async function api(baseUrl, apiPath, options = {}) {
  const method = options.method || 'GET';
  const headers = { ...(options.headers || {}) };
  if (options.origin !== null) headers.origin = options.origin === undefined ? baseUrl : options.origin;
  if (options.body !== undefined) headers['content-type'] = 'application/json';
  const response = await fetch(baseUrl + apiPath, {
    method,
    headers,
    body: options.body === undefined ? undefined : JSON.stringify(options.body)
  });
  const text = await response.text();
  let json = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* 非 JSON */ }
  return { status: response.status, json, text };
}

/**
 * 建立 WebSocket 连接并返回消息收发辅助。
 * @param {string} wsUrl WebSocket 地址
 * @param {string} origin Origin 头
 * @param {object} [transport] 预置的 WebSocket 实现类（便于注入）
 */
export function wsConnect(wsUrl, origin, transport) {
  const WS = transport;
  const ws = new WS(wsUrl, { headers: { origin } });
  const pending = [];
  const waiters = [];
  ws.on('message', (raw) => {
    const message = JSON.parse(raw.toString());
    // 先尝试交给满足条件的等待者
    const index = waiters.findIndex((w) => !w.predicate || w.predicate(message));
    if (index >= 0) {
      const [waiter] = waiters.splice(index, 1);
      clearTimeout(waiter.timer);
      waiter.resolve(message);
    } else {
      pending.push(message);
    }
  });
  let closedInfo = null;
  ws.on('close', (code, reason) => { closedInfo = { code, reason: reason.toString() }; });
  ws.on('error', () => { /* 由 close 体现 */ });

  return {
    ws,
    /** 等待下一条满足条件（或任意）消息 */
    next(predicate, timeoutMs = 8000) {
      const index = predicate ? pending.findIndex(predicate) : pending.length ? 0 : -1;
      if (index >= 0) return Promise.resolve(pending.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = {
          predicate,
          resolve,
          timer: setTimeout(() => {
            const i = waiters.indexOf(waiter);
            if (i >= 0) waiters.splice(i, 1);
            reject(new Error(`等待消息超时（${timeoutMs}ms），积压 ${pending.length} 条：${pending.slice(0, 3).map((m) => m.type).join(',')}`));
          }, timeoutMs)
        };
        waiters.push(waiter);
      });
    },
    send(message) { ws.send(JSON.stringify(message)); },
    get closed() { return closedInfo; },
    close() { return new Promise((resolve) => { if (ws.readyState === 1) { ws.on('close', resolve); ws.close(1000); } else resolve(); }); },
    /** 强制断开（不握手） */
    terminate() { ws.terminate(); }
  };
}
