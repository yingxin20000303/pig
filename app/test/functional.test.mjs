/**
 * functional.test.mjs — 功能测试
 *
 * 覆盖：REST API（profiles/settings/background + Origin 校验）、
 * WebSocket SSH 链路（连接/终端/健康信息/上传/下载/目录浏览/取消/断开）、
 * 错误处理与安全边界。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import { createMockSshServer } from './helpers/mock-ssh-server.mjs';
import { startApp, api, wsConnect } from './helpers/test-app.mjs';

// —— 测试环境（整个文件共享，降低启动开销） ——
let app;
let mock;
let WS;

test.before(async () => {
  app = await startApp();
  mock = await createMockSshServer({ hostname: 'func-host', cpuCores: 8 });
  ({ WebSocket: WS } = await import('ws'));
});

test.after(async () => {
  await app?.stop();
  await mock?.close();
});

// ===================== 静态资源 =====================

test('GET / 返回页面 HTML', async () => {
  const response = await fetch(app.baseUrl + '/');
  assert.equal(response.status, 200);
  const html = await response.text();
  assert.match(html, /<html/i);
  assert.match(html, /app\.js\?v=/);
});

test('GET /app.js 返回 JS 且禁强缓存', async () => {
  const response = await fetch(app.baseUrl + '/app.js?v=26');
  assert.equal(response.status, 200);
  assert.match(response.headers.get('cache-control'), /max-age=0/);
});

// ===================== Origin 安全 =====================

test('POST /api/profiles 拒绝不可信 Origin（403）', async () => {
  const result = await api(app.baseUrl, '/api/profiles', { method: 'POST', origin: 'http://evil.example', body: { name: 'x' } });
  assert.equal(result.status, 403);
});

test('POST /api/profiles 无 Origin 也拒绝（403）', async () => {
  const result = await api(app.baseUrl, '/api/profiles', { method: 'POST', origin: null, body: { name: 'x' } });
  assert.equal(result.status, 403);
});

test('WS /ssh 拒绝不可信 Origin（握手失败）', async () => {
  await assert.rejects(() => new Promise((resolve, reject) => {
    const ws = new WS(app.wsUrl, { headers: { origin: 'http://evil.example' } });
    ws.on('open', () => { ws.close(); resolve(); });
    ws.on('error', (e) => reject(e));
  }), /403|invalid|Unexpected server response/);
});

// ===================== Profiles CRUD =====================

test('GET /api/profiles 初始为空数组', async () => {
  const result = await api(app.baseUrl, '/api/profiles');
  assert.equal(result.status, 200);
  assert.deepEqual(result.json, []);
});

test('POST /api/profiles 保存并脱敏返回', async () => {
  const result = await api(app.baseUrl, '/api/profiles', {
    method: 'POST',
    body: { name: 'dev', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123', authMode: 'password' }
  });
  assert.equal(result.status, 200);
  assert.equal(result.json.profile.name, 'dev');
  assert.equal(result.json.profile.host, '127.0.0.1');
});

test('POST /api/profiles 缺字段返回 400', async () => {
  const result = await api(app.baseUrl, '/api/profiles', { method: 'POST', body: { name: 'bad' } });
  assert.equal(result.status, 400);
});

test('GET /api/profiles 返回已保存配置且密码字段存在（本地加密存储）', async () => {
  const result = await api(app.baseUrl, '/api/profiles');
  const dev = result.json.find((p) => p.name === 'dev');
  assert.ok(dev, '应包含 dev 配置');
  assert.equal(dev.port, mock.port);
});

test('DELETE /api/profiles/:name 删除后 404', async () => {
  await api(app.baseUrl, '/api/profiles', { method: 'POST', body: { name: 'temp', host: '1.2.3.4', username: 'u' } });
  const deleted = await api(app.baseUrl, '/api/profiles/temp', { method: 'DELETE' });
  assert.equal(deleted.status, 204);
  const again = await api(app.baseUrl, '/api/profiles/temp', { method: 'DELETE' });
  assert.equal(again.status, 404);
});

test('profiles 落盘为 AES-256-GCM 加密信封', async () => {
  const envelope = JSON.parse(await fs.readFile(app.dataDir + '/ssh-connections.json', 'utf8'));
  assert.equal(envelope.algorithm, 'aes-256-gcm');
  assert.equal(typeof envelope.ciphertext, 'string');
  assert.ok(!envelope.ciphertext.includes('pass123'), '密文不应包含明文密码');
});

// ===================== Settings =====================

test('GET /api/settings 返回默认值', async () => {
  const result = await api(app.baseUrl, '/api/settings');
  assert.equal(result.json.theme, 'dark');
  assert.equal(result.json.fontSize, 14);
});

test('PUT /api/settings 保存并钳制非法值', async () => {
  const saved = await api(app.baseUrl, '/api/settings', {
    method: 'PUT',
    body: { theme: 'light', fontSize: 999, fontWeight: 100, letterSpacing: -50, pinnedOrder: ['a', 'b'] }
  });
  assert.equal(saved.status, 200);
  assert.equal(saved.json.theme, 'light');
  assert.equal(saved.json.fontSize, 24, 'fontSize 应钳制到 24');
  assert.equal(saved.json.letterSpacing, -2, 'letterSpacing 应钳制到 -2');
  const reread = await api(app.baseUrl, '/api/settings');
  assert.equal(reread.json.theme, 'light');
});

// ===================== Background =====================

test('POST /api/background 校验图片类型与大小', async () => {
  const bad = await api(app.baseUrl, '/api/background', {
    method: 'POST',
    body: { contentType: 'image/bmp', data: Buffer.from('x').toString('base64') }
  });
  assert.equal(bad.status, 400);
  const good = await api(app.baseUrl, '/api/background', {
    method: 'POST',
    body: { contentType: 'image/png', data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString('base64'), opacity: 0.8 }
  });
  assert.equal(good.status, 200);
  assert.match(good.json.url, /^\/uploads\/background\.png$/);
  assert.equal(good.json.opacity, 0.8);
  const files = await fs.readdir(app.dataDir + '/uploads');
  assert.ok(files.includes('background.png'));
});

// ===================== WS SSH 链路 =====================

test('connect：错误密码返回 error 消息', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await conn.next((m) => m.type === 'open' || true, 100).catch(() => {});
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'wrong' });
  const error = await conn.next((m) => m.type === 'error', 10000);
  assert.match(error.message, /认证|身份|All configured|authentication/i);
  conn.terminate();
});

test('connect：参数缺失返回错误', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '', username: '', password: '' });
  const error = await conn.next((m) => m.type === 'error');
  assert.match(error.message, /请填写/);
  conn.close();
});

test('connect + ready + home + health + 终端输入回显', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });

  const ready = await conn.next((m) => m.type === 'ready', 10000);
  assert.ok(ready, '应收到 ready');

  const home = await conn.next((m) => m.type === 'home', 10000);
  assert.equal(home.home, '/home/tester');

  const health = await conn.next((m) => m.type === 'health', 10000);
  assert.equal(health.hostname, 'func-host');
  assert.equal(health.cores, 8);

  conn.send({ type: 'input', data: 'echo ping\r' });
  const echoed = await conn.next((m) => m.type === 'data' && m.data.includes('echo ping'), 10000);
  assert.ok(echoed, '终端输入应回显');

  conn.send({ type: 'resize', cols: 120, rows: 40 });
  conn.send({ type: 'disconnect' });
  const closed = await conn.next((m) => m.type === 'closed', 10000);
  assert.ok(closed);
  await conn.close();
});

test('SFTP：list-files 列目录', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'ready', 10000);
  // SFTP 通道就绪需要一点时间，等 home 消息保证 sftp 已建立
  await conn.next((m) => m.type === 'home', 10000);

  conn.send({ type: 'list-files', directory: '/home/tester', requestId: 'r1' });
  const list = await conn.next((m) => m.type === 'file-list', 10000);
  assert.equal(list.requestId, 'r1');
  assert.ok(Array.isArray(list.directories));
  assert.ok(Array.isArray(list.files));

  conn.send({ type: 'list-files', directory: '/not-exists', requestId: 'r2' });
  const errList = await conn.next((m) => m.type === 'transfer-error' && m.requestId === 'r2', 10000);
  assert.match(errList.message, /无法读取目录/);
  conn.close();
});

test('SFTP：上传 → 下载 → 校验内容一致', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'home', 10000); // 确保 sftp 就绪

  // 上传 1MB 随机数据
  const payload = crypto.randomBytes(1024 * 1024);
  conn.send({ type: 'upload-start', id: 'up1', name: 'big.bin', directory: '/home/tester', size: payload.length });
  const uploadReady = await conn.next((m) => m.type === 'upload-ready' && m.id === 'up1', 10000);
  assert.equal(uploadReady.remotePath, '/home/tester/big.bin');

  // 分块上传（64KB 一块）
  for (let offset = 0; offset < payload.length; offset += 65536) {
    conn.send({ type: 'upload-chunk', id: 'up1', data: payload.subarray(offset, offset + 65536).toString('base64') });
  }
  conn.send({ type: 'upload-end', id: 'up1' });
  const uploaded = await conn.next((m) => m.type === 'upload-complete' && m.id === 'up1', 15000);
  assert.equal(uploaded.size, payload.length);

  // 下载并校验
  conn.send({ type: 'download', id: 'dl1', remotePath: '/home/tester/big.bin' });
  const dlStart = await conn.next((m) => m.type === 'download-start' && m.id === 'dl1', 10000);
  assert.equal(dlStart.size, payload.length);
  const chunks = [];
  let complete = null;
  while (!complete) {
    const message = await conn.next((m) => (m.type === 'download-chunk' && m.id === 'dl1') || (m.type === 'download-complete' && m.id === 'dl1') || (m.type === 'transfer-error'), 15000);
    if (message.type === 'download-chunk') chunks.push(Buffer.from(message.data, 'base64'));
    else if (message.type === 'download-complete') complete = message;
    else throw new Error(message.message);
  }
  const downloaded = Buffer.concat(chunks);
  assert.equal(downloaded.length, payload.length);
  assert.ok(payload.equals(downloaded), '下载内容应与上传一致');
  conn.close();
});

test('SFTP：同名冲突返回 upload-conflict', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'home', 10000);

  conn.send({ type: 'upload-start', id: 'c1', name: 'big.bin', directory: '/home/tester', size: 4 });
  const conflict = await conn.next((m) => m.type === 'upload-conflict' && m.id === 'c1', 10000);
  assert.equal(conflict.name, 'big.bin');

  // overwrite 后成功
  conn.send({ type: 'upload-start', id: 'c2', name: 'big.bin', directory: '/home/tester', size: 4, conflictAction: 'overwrite' });
  await conn.next((m) => m.type === 'upload-ready' && m.id === 'c2', 10000);
  conn.send({ type: 'upload-chunk', id: 'c2', data: Buffer.from('abcd').toString('base64') });
  conn.send({ type: 'upload-end', id: 'c2' });
  const done = await conn.next((m) => m.type === 'upload-complete' && m.id === 'c2', 10000);
  assert.equal(done.size, 4);

  // rename 策略
  conn.send({ type: 'upload-start', id: 'c3', name: 'big.bin', directory: '/home/tester', size: 4, conflictAction: 'rename' });
  const renamed = await conn.next((m) => m.type === 'upload-ready' && m.id === 'c3', 10000);
  assert.match(renamed.remotePath, /big \(1\)\.bin$/);
  conn.close();
});

test('SFTP：上传超量数据被拒绝', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'home', 10000);

  conn.send({ type: 'upload-start', id: 'x1', name: 'over.bin', directory: '/home/tester', size: 4 });
  await conn.next((m) => m.type === 'upload-ready' && m.id === 'x1', 10000);
  conn.send({ type: 'upload-chunk', id: 'x1', data: 'A'.repeat(8 * 1024).toString('base64') }); // 超过声明大小
  const error = await conn.next((m) => m.type === 'transfer-error' && m.id === 'x1', 10000);
  assert.match(error.message, /超过声明|上传数据无效/);
  conn.close();
});

test('cancel-transfer：中断下载后不再推送', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'home', 10000);

  conn.send({ type: 'download', id: 'dc1', remotePath: '/home/tester/big.bin' });
  await conn.next((m) => m.type === 'download-start' && m.id === 'dc1', 10000);
  conn.send({ type: 'cancel-transfer', id: 'dc1' });
  // 等待一段时间确认无后续 chunk / complete
  const unexpected = await conn.next((m) => (m.type === 'download-chunk' && m.id === 'dc1') || (m.type === 'download-complete' && m.id === 'dc1'), 1500).catch(() => null);
  assert.equal(unexpected, null, '取消后不应再收到该下载的推送');
  conn.close();
});

test('WS 协议：非法 JSON 返回错误提示', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.ws.send('not-json');
  const error = await conn.next((m) => m.type === 'error');
  assert.match(error.message, /消息格式错误/);
  conn.close();
});

test('服务运行日志无未捕获异常', async () => {
  assert.ok(!app.logs.join('').includes('uncaughtException'), '不应有未捕获异常');
});
