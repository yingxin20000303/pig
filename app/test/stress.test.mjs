/**
 * stress.test.mjs — 压力测试
 *
 * 覆盖：并发 SSH 会话、并发上传/下载、HTTP 静态资源吞吐、
 * 大消息边界、异常断连风暴。验证服务在负载下的稳定性与资源回收。
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { createMockSshServer } from './helpers/mock-ssh-server.mjs';
import { startApp, wsConnect } from './helpers/test-app.mjs';

let app;
let mock;
let WS;

test.before(async () => {
  app = await startApp();
  mock = await createMockSshServer({ hostname: 'stress-host' });
  ({ WebSocket: WS } = await import('ws'));
});

test.after(async () => {
  await app?.stop();
  await mock?.close();
});

/** 建立一条完成 SSH 握手的会话 */
async function openSession() {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
  await conn.next((m) => m.type === 'ready', 10000);
  return conn;
}

/** 上传一段数据到 mock 服务器并等待完成 */
async function upload(conn, id, name, directory, payload) {
  conn.send({ type: 'upload-start', id, name, directory, size: payload.length });
  await conn.next((m) => m.type === 'upload-ready' && m.id === id, 10000);
  for (let offset = 0; offset < payload.length; offset += 65536) {
    conn.send({ type: 'upload-chunk', id, data: payload.subarray(offset, offset + 65536).toString('base64') });
  }
  conn.send({ type: 'upload-end', id });
  return conn.next((m) => m.type === 'upload-complete' && m.id === id, 20000);
}

test('压力：20 个并发 SSH 会话同时输入输出', async () => {
  const count = 20;
  const conns = await Promise.all(Array.from({ length: count }, () => openSession()));
  const results = await Promise.all(conns.map(async (conn, i) => {
    conn.send({ type: 'input', data: `cmd-${i}\r` });
    const echoed = await conn.next((m) => m.type === 'data' && m.data.includes(`cmd-${i}`), 10000);
    return !!echoed;
  }));
  assert.equal(results.filter(Boolean).length, count);
  await Promise.all(conns.map((c) => c.close()));
});

test('压力：8 个会话各自上传 2MB 文件（共 16MB）', async () => {
  const count = 8;
  const size = 2 * 1024 * 1024;
  const conns = await Promise.all(Array.from({ length: count }, () => openSession()));
  const done = await Promise.all(conns.map((conn, i) =>
    upload(conn, `up-${i}`, `stress-${i}.bin`, '/home/tester', Buffer.alloc(size, 0x61 + i))
  ));
  assert.equal(done.length, count);
  done.forEach((d, i) => assert.equal(d.size, size, `会话 ${i} 上传大小不符`));
  await Promise.all(conns.map((c) => c.close()));
});

test('压力：单会话连续 5 次上传下载循环', async () => {
  const conn = await openSession();
  const payload = crypto.randomBytes(256 * 1024);
  for (let round = 0; round < 5; round++) {
    await upload(conn, `loop-${round}`, `loop-${round}.bin`, '/home/tester', payload);
    conn.send({ type: 'download', id: `dl-${round}`, remotePath: `/home/tester/loop-${round}.bin` });
    await conn.next((m) => m.type === 'download-start' && m.id === `dl-${round}`, 10000);
    const complete = await conn.next((m) => m.type === 'download-complete' && m.id === `dl-${round}`, 20000);
    assert.ok(complete);
  }
  await conn.close();
});

test('压力：HTTP 静态资源 300 次并发请求', async () => {
  const count = 300;
  const paths = ['/', '/app.js?v=26', '/js/sessions.js?v=26', '/style.css', '/icon.png'];
  const results = await Promise.all(
    Array.from({ length: count }, (_, i) => fetch(app.baseUrl + paths[i % paths.length]).then((r) => r.status))
  );
  const ok = results.filter((s) => s === 200).length;
  assert.equal(ok, count, `应全部 200，实际失败 ${count - ok}`);
});

test('压力：WS 消息洪水（500 条快速消息）不崩服务', async () => {
  const conn = await openSession();
  for (let i = 0; i < 500; i++) conn.send({ type: 'input', data: `flood-${i}\n` });
  // 等待任一回显，证明服务仍在响应
  const echoed = await conn.next((m) => m.type === 'data' && m.data.includes('flood-499'), 15000);
  assert.ok(echoed);
  await conn.close();
});

test('边界：超大消息（>1MB）触发 1009 关闭', async () => {
  const conn = wsConnect(app.wsUrl, app.origin, WS);
  await new Promise((r) => conn.ws.on('open', r));
  const huge = 'x'.repeat(1024 * 1024 + 100);
  conn.ws.send(JSON.stringify({ type: 'input', data: huge }));
  // 服务端应关闭连接（1009）
  await new Promise((resolve) => conn.ws.on('close', resolve));
  assert.equal(conn.closed.code, 1009);
});

test('风暴：30 次建连后立即强断（半开连接回收）', async () => {
  for (let i = 0; i < 30; i++) {
    const conn = wsConnect(app.wsUrl, app.origin, WS);
    await new Promise((r) => conn.ws.on('open', r));
    if (i % 2 === 0) conn.send({ type: 'connect', host: '127.0.0.1', port: mock.port, username: 'tester', password: 'pass123' });
    conn.terminate();
  }
  // 风暴后服务应仍可正常服务
  const conn = await openSession();
  conn.send({ type: 'input', data: 'alive\r' });
  const echoed = await conn.next((m) => m.type === 'data' && m.data.includes('alive'), 10000);
  assert.ok(echoed, '风暴后服务应正常响应');
  await conn.close();
});

test('稳定性：全部压力后无未捕获异常、进程存活', async () => {
  assert.ok(!app.logs.join('').includes('uncaughtException'), '不应有未捕获异常');
  assert.ok(!app.logs.join('').includes('unhandledRejection'), '不应有未处理的 Promise 拒绝');
});
