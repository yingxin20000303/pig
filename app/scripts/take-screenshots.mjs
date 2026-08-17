#!/usr/bin/env node
/**
 * take-screenshots.mjs — 用 Playwright(Chromium 无头) 截取 WebSSH 最新界面截图
 *
 * 用法：node scripts/take-screenshots.mjs [baseUrl]
 * 默认启动隔离实例（临时数据目录），不污染真实用户数据。
 * 输出：docs/screenshots/*.png（覆盖旧图）
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startApp } from '../test/helpers/test-app.mjs';
import { createMockSshServer } from '../test/helpers/mock-ssh-server.mjs';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const outDir = path.join(root, '..', 'docs', 'screenshots');
const customBase = process.argv[2];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function main() {
  await fs.mkdir(outDir, { recursive: true });
  const app = customBase ? null : await startApp();
  const baseUrl = customBase || app.baseUrl;
  // mock SSH 服务器：供上传/下载窗口截图建立真实会话
  const mock = await createMockSshServer({ hostname: 'demo-host' });
  console.log(`目标服务：${baseUrl}${app ? '（隔离实例）' : ''}，mock SSH 端口 ${mock.port}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 }, deviceScaleFactor: 2 });

  // 预写演示 profiles（截图 09 需要：页面加载时 GET 到列表才会显示“保存连接”区块）
  const demoProfiles = [
    { name: '生产服务器', host: '203.0.113.10', port: 22, username: 'root', authMode: 'password' },
    { name: '开发机', host: '192.168.1.20', port: 22, username: 'dev', authMode: 'key' },
    { name: 'NAS', host: '192.168.1.5', port: 2222, username: 'admin', authMode: 'password' }
  ];
  for (const profile of demoProfiles) {
    await fetch(`${baseUrl}/api/profiles`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', origin: baseUrl },
      body: JSON.stringify(profile)
    });
  }

  page.on('console', (msg) => {
    if (msg.type() === 'error') console.log('[page error]', msg.text().slice(0, 200));
  });
  page.on('pageerror', (err) => console.log('[pageerror]', err.message.slice(0, 200)));

  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForSelector('#terminal-empty-state', { timeout: 10000 });
  await sleep(600);

  async function shot(name) {
    await page.screenshot({ path: path.join(outDir, name) });
    const size = (await fs.stat(path.join(outDir, name))).size;
    console.log(`✓ ${name} (${Math.round(size / 1024)}KB)`);
  }

  // 01 主界面（空状态）
  await shot('01-home.png');

  // 02 新建连接（密码模式）
  await page.click('#new-session-button');
  await page.waitForSelector('#connection-form', { timeout: 5000 });
  await sleep(400);
  await shot('02-new-connection.png');

  // 03 私钥模式
  await page.click('[data-mode="key"]');
  await sleep(300);
  await shot('03-new-connection-key.png');
  await page.click('[data-mode="password"]');
  await page.click('#close-drawer-button');
  await sleep(300);

  // 04 字体设置菜单
  await page.click('#terminal-settings-button');
  await page.waitForSelector('#terminal-settings-menu:not([hidden])');
  await sleep(300);
  await shot('04-font-settings.png');
  await page.click('#terminal-settings-button');
  await sleep(300);

  // 05 背景设置菜单
  await page.click('#background-settings-button');
  await page.waitForSelector('#background-settings-menu:not([hidden])');
  await sleep(300);
  await shot('05-background-settings.png');
  await page.click('#background-settings-button');
  await sleep(300);

  // —— 建立真实 SSH 会话（mock 服务器），供上传/下载窗口截图 ——
  await page.click('#new-session-button');
  await page.waitForSelector('#connection-form');
  // 诊断：确认表单可见性与认证模式状态
  const formState = await page.evaluate(() => ({
    drawerHidden: document.querySelector('#connection-drawer').getAttribute('aria-hidden'),
    passwordVisible: !document.querySelector('#password-fields').hidden,
    keyVisible: !document.querySelector('#key-fields').hidden,
    fontMenuHidden: document.querySelector('#terminal-settings-menu').hidden,
    bgMenuHidden: document.querySelector('#background-settings-menu').hidden
  }));
  console.log('表单状态:', JSON.stringify(formState));
  await page.fill('#connection-form [name="name"]', 'demo');
  await page.fill('#connection-form [name="host"]', '127.0.0.1');
  await page.fill('#connection-form [name="port"]', String(mock.port));
  await page.fill('#connection-form [name="username"]', 'tester');
  await page.fill('#connection-form [name="password"]', 'pass123');
  const preConnect = await page.evaluate(() => {
    const form = document.querySelector('#connection-form');
    const data = {};
    new FormData(form).forEach((v, k) => { data[k] = v; });
    return { valid: form.reportValidity(), data };
  });
  console.log('提交前表单:', JSON.stringify(preConnect));
  await page.click('#connect-button');
  // 等待会话就绪（状态变为已连接 + 终端出现）
  try {
    await page.waitForFunction(() => {
      const status = document.querySelector('#status');
      return status && !status.textContent.includes('未连接');
    }, null, { timeout: 15000 });
  } catch (error) {
    const statusText = await page.textContent('#status').catch(() => '?');
    console.log(`会话状态等待超时，当前 #status="${statusText}"`);
    throw error;
  }
  await sleep(800);

  // 06 上传窗口
  await page.click('#upload-button');
  await page.waitForSelector('#upload-picker:not([hidden])');
  await sleep(400);
  await shot('06-upload-picker.png');
  await page.click('#close-upload-picker-button');
  await sleep(300);

  // 07 下载窗口
  await page.click('#download-button');
  await page.waitForSelector('#file-picker:not([hidden])');
  await sleep(400);
  await shot('07-download-picker.png');
  await page.click('#close-file-picker-button');
  await sleep(300);
  // 断开会话（关闭标签的 .tab-close 按钮，无确认弹窗）
  await page.click('#session-tabs .session-tab .tab-close');
  await sleep(400);

  // 08 浅色主题
  await page.click('#theme-button');
  await sleep(500);
  await shot('08-light-theme.png');
  await page.click('#theme-button');
  await sleep(400);

  // 09 保存连接列表：重新加载页面（此前已通过 API 写入演示 profiles），
  // 让前端初始化时 GET 到数据后再打开抽屉
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForSelector('#terminal-empty-state');
  await sleep(600);
  await page.click('#new-session-button');
  await page.waitForSelector('#saved-connections-section:not([hidden])');
  await sleep(400);
  await shot('09-saved-connections.png');
  await page.click('#close-drawer-button');
  await sleep(400);

  // main.png 主界面
  await shot('main.png');

  await browser.close();
  await app?.stop();
  await mock.close();
  console.log('全部截图完成');
}

main().catch(async (error) => {
  console.error('截图失败：', error.message);
  process.exit(1);
});
