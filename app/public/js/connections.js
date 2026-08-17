/**
 * connections.js — WebSocket 连接与消息处理
 *
 * 负责 SSH 终端连接的建立/重连、远程消息分发（输出/健康/文件列表/下载/上传），
 * 以及文件上传的分块发送逻辑。
 */
import { generateUUID, formatBytes, readBlobArrayBuffer, socketIsOpen, socketIsConnecting } from './utils.js?v=26';
import {
  sessions,
  activeSessionId,
  authMode,
  transfers,
  pickerRequests,
  browserDownloadQueue,
  browserDownloadActive,
  setBrowserDownloadActive
} from './state.js?v=26';
import {
  updateTransfer,
  renderFileList,
  showDirectoryInput,
  openUploadConflict
} from './transfers.js?v=26';
import { refreshActiveStatus, refreshConnectionHealth, fitSession, activeSession, updateSessionTabsOverflow } from './sessions.js?v=26';

/**
 * 安排会话的自动重连（指数退避，上限 30s / 100 次）。
 * @param {object} session 会话对象
 */
export function scheduleReconnect(session) {
  if (session.manuallyClosed || !session.connection || session.reconnectTimer) return;
  if (session.reconnectAttempts >= 100) {
    session.terminal.writeln('\r\n\x1b[31m自动重连已达到 100 次上限，请按回车手动重试或关闭会话。\x1b[0m');
    return;
  }
  const delay = Math.min(30000, 1000 * 2 ** session.reconnectAttempts);
  session.reconnectAttempts += 1;
  session.reconnectTimer = setTimeout(() => {
    session.reconnectTimer = undefined;
    if (!session.manuallyClosed && !session.connected) establishConnection(session, session.connection);
  }, delay);
}

/**
 * 建立（或重建）会话的 WebSocket 连接并绑定消息处理。
 * @param {object} session 会话对象
 * @param {object} values 连接参数（host/port/username/authMode/password/privateKey 等）
 */
export function establishConnection(session, values) {
  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = undefined;
  session.manuallyClosed = false;
  const mode = values.authMode || authMode;
  session.connection = { ...values, authMode: mode, password: mode === 'password' ? values.password : '', privateKey: mode === 'key' ? values.privateKey : '' };
  session.connected = false;
  session.tab.querySelector('.tab-label').textContent = values.name || values.host;
  updateSessionTabsOverflow();
  session.terminal.clear();
  const protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
  session.socket = new WebSocket(`${protocol}//${location.host}/ssh`);
  refreshActiveStatus();
  session.socket.addEventListener('open', () => session.socket.send(JSON.stringify({ type: 'connect', ...session.connection })));
  session.socket.addEventListener('message', async ({ data }) => {
    let message;
    try { message = JSON.parse(data); } catch { return; }
    if (message.type === 'data') session.terminal.write(message.data);
    if (message.type === 'ready') {
      session.connected = true;
      session.connectedAt = Date.now();
      session.health = undefined;
      session.home = undefined;
      session.reconnectAttempts = 0;
      if (session.id === activeSessionId) { refreshActiveStatus(); fitSession(session); session.terminal.focus(); }
    }
    if (message.type === 'home') session.home = message.home;
    if (message.type === 'health') {
      session.health = message;
      if (session.id === activeSessionId) refreshConnectionHealth();
    }
    if (message.type === 'file-list') renderFileList(session, message);
    if (message.type === 'download-start') {
      const download = session.downloads.get(message.id) || {};
      session.downloads.set(message.id, { ...download, name: message.name, size: Number(message.size), chunks: [], writeChain: Promise.resolve(), writablePromise: undefined, writtenBytes: 0 });
      updateTransfer(message.id, { direction: 'download', name: message.name, size: message.size, transferred: 0 });
    }
    if (message.type === 'download-chunk') {
      const download = session.downloads.get(message.id);
      if (!download) return;
      const bytes = Uint8Array.from(atob(message.data), (character) => character.charCodeAt(0));
      if (download.saveHandle) {
        // Chrome File System Access API：边下载边流式写入，避免大文件全部驻留内存
        download.writtenBytes = (download.writtenBytes || 0) + bytes.length;
        if (!download.writablePromise) {
          download.writablePromise = download.saveHandle.createWritable().catch(() => null);
        }
        download.writeChain = download.writeChain.then(() => download.writablePromise).then((writable) => writable?.write(bytes)).catch(() => {});
      } else {
        // 无 saveHandle（Safari 等）：立即解码存储，避免 base64 与解码后双份驻留内存
        download.chunks.push(bytes);
      }
      updateTransfer(message.id, { transferred: message.transferred, size: message.size });
    }
    if (message.type === 'download-complete') {
      const download = session.downloads.get(message.id);
      if (!download) return;
      try {
        if (download.saveHandle) {
          await download.writeChain;
          const writable = await download.writablePromise;
          if (!writable) throw new Error('无法打开文件写入流。');
          await writable.close();
          if (download.writtenBytes !== Number(download.size)) {
            updateTransfer(message.id, { error: `下载文件未保存：文件大小校验失败，应为 ${formatBytes(download.size)}，实际为 ${formatBytes(download.writtenBytes)}。` });
            return;
          }
          session.downloads.delete(message.id);
          updateTransfer(message.id, { done: true, saveLocation: '已保存到您选择的位置' });
        } else {
          const blob = new Blob(download.chunks);
          if (blob.size !== Number(download.size)) {
            session.downloads.delete(message.id);
            updateTransfer(message.id, { error: `下载文件未保存：文件大小校验失败，应为 ${formatBytes(download.size)}，实际为 ${formatBytes(blob.size)}。` });
            return;
          }
          // 走浏览器下载队列串行触发，避免多文件并发下载被浏览器拦截
          queueBrowserDownload(blob, download.name);
          session.downloads.delete(message.id);
          updateTransfer(message.id, { done: true, saveLocation: undefined });
        }
      } catch (error) {
        session.downloads.delete(message.id);
        updateTransfer(message.id, { error: `下载文件未保存：${error.message}` });
      }
    }
    if (message.type === 'upload-ready') {
      if (message.name) updateTransfer(message.id, { name: message.name });
      void startUpload(session, message.id);
    }
    if (message.type === 'upload-conflict') openUploadConflict(session, message);
    if (message.type === 'upload-progress') updateTransfer(message.id, { transferred: message.transferred, size: message.size });
    if (message.type === 'upload-complete') updateTransfer(message.id, { done: true, transferred: message.size });
    if (message.type === 'transfer-error') {
      const upload = session.uploads.get(message.id);
      if (message.operation === 'list-files') {
        const picker = message.picker === 'upload' ? 'upload' : 'download';
        const request = pickerRequests.get(picker);
        if (request && request.requestId === message.requestId && request.sessionId === session.id) showDirectoryInput(`${message.message}，请输入要读取的远程目录。`, picker);
      } else if (upload) {
        session.uploads.delete(message.id);
        updateTransfer(message.id, { direction: 'upload', error: message.message });
      } else updateTransfer(message.id || generateUUID(), { direction: message.direction || 'upload', name: transfers.get(message.id)?.name || '文件传输', error: message.message });
    }
    if (message.type === 'error') session.terminal.writeln(`\r\n\x1b[31m${message.message}\x1b[0m`);
    if (message.type === 'closed') {
      session.connected = false;
      if (session.id === activeSessionId) refreshActiveStatus();
      scheduleReconnect(session);
    }
  });
  session.socket.addEventListener('close', () => { session.connected = false; session.health = undefined; if (session.id === activeSessionId) refreshActiveStatus(); scheduleReconnect(session); });
  session.socket.addEventListener('error', () => { session.connected = false; session.health = undefined; if (session.id === activeSessionId) refreshActiveStatus(); scheduleReconnect(session); });
}

/**
 * 手动重连会话（未连接时关闭旧 socket 并重新建立）。
 * @param {object} session 会话对象
 */
export function reconnectSession(session) {
  if (session.connected || socketIsConnecting(session.socket)) return;
  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = undefined;
  session.socket.close?.();
  establishConnection(session, session.connection);
}

/**
 * 分块发送本地文件到远程（每块 48KB，分段构造 binary string 优化性能）。
 * @param {object} session 会话对象
 * @param {string} id 上传任务 id
 * @returns {Promise<void>}
 */
export async function startUpload(session, id) {
  const upload = session.uploads.get(id);
  const file = upload?.file;
  if (!file || !socketIsOpen(session.socket)) return;
  const chunkSize = 48 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
    const bytes = new Uint8Array(await readBlobArrayBuffer(file.slice(offset, offset + chunkSize)));
    if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
    // 分段构造 binary string：逐字节拼接对大文件是 O(n²) 的字符串操作，
    // 分段 String.fromCharCode 利用引擎优化，避免大文件上传卡顿。
    let binary = '';
    const SEGMENT = 8192;
    for (let index = 0; index < bytes.length; index += SEGMENT) {
      binary += String.fromCharCode(...bytes.subarray(index, index + SEGMENT));
    }
    session.socket.send(JSON.stringify({ type: 'upload-chunk', id, data: btoa(binary) }));
  }
  if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
  session.uploads.delete(id);
  session.socket.send(JSON.stringify({ type: 'upload-end', id }));
}

/**
 * 浏览器下载队列处理：串行触发下载，间隔 800ms 避免浏览器拦截。
 * @returns {Promise<void>}
 */
async function processBrowserDownloadQueue() {
  if (browserDownloadActive) return;
  setBrowserDownloadActive(true);
  while (browserDownloadQueue.length) {
    const { blob, name } = browserDownloadQueue.shift();
    try {
      const url = URL.createObjectURL(blob);
      const link = Object.assign(document.createElement('a'), { href: url, download: name });
      document.body.append(link);
      link.click();
      link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (error) {
      console.error('触发浏览器下载失败：', error);
    }
    await new Promise((resolve) => setTimeout(resolve, 800));
  }
  setBrowserDownloadActive(false);
}

/**
 * 将文件加入浏览器下载队列（串行下载）。
 * @param {Blob} blob 文件数据
 * @param {string} name 下载文件名
 */
export function queueBrowserDownload(blob, name) {
  browserDownloadQueue.push({ blob, name });
  void processBrowserDownloadQueue();
}
