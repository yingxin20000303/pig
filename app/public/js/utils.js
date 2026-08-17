/**
 * utils.js — 纯工具函数
 *
 * 不依赖任何 DOM 或状态的通用函数，可安全地在任何模块中复用。
 */

/**
 * 生成全局唯一 ID（UUID）。
 * 优先使用原生 crypto.randomUUID，其次 getRandomValues，最后 Math.random 兜底。
 * @returns {string} UUID 字符串
 */
export function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    bytes[6] = (bytes[6] & 0x0f) | 0x40;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const hex = Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => { const r = Math.random() * 16 | 0; const v = c === 'x' ? r : (r & 0x3 | 0x8); return v.toString(16); });
}

/**
 * 清空元素的子节点（优先使用 replaceChildren，旧浏览器回退到逐个子节点移除）。
 * @param {HTMLElement | null} element 目标元素
 */
export function clearChildren(element) {
  if (element && typeof element.replaceChildren === 'function') { element.replaceChildren(); return; }
  while (element && element.firstChild) element.removeChild(element.firstChild);
}

/**
 * 将 Blob 读取为 ArrayBuffer（优先使用原生 arrayBuffer，旧浏览器回退 FileReader）。
 * @param {Blob} blob 目标 Blob
 * @returns {Promise<ArrayBuffer>} ArrayBuffer
 */
export function readBlobArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsArrayBuffer(blob);
  });
}

/**
 * 将 FormData 转为普通对象。
 * @param {FormData} formData 表单数据
 * @returns {Record<string, string>} 键值对象
 */
export function formDataToObject(formData) {
  const values = {};
  formData.forEach((value, key) => { values[key] = value; });
  return values;
}

/**
 * 将字节数格式化为可读字符串（B/KB/MB/GB）。
 * @param {number} bytes 字节数
 * @returns {string} 格式化结果，例如 "1.5 MB"
 */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}

/**
 * 返回远程目录的父目录（去掉末尾斜杠后取上一级）。
 * @param {string} directory 目录路径
 * @returns {string} 父目录路径
 */
export function parentDirectory(directory) {
  const normalized = String(directory || '').replace(/\/+$/, '') || '/';
  return normalized === '/' ? '/' : (normalized.slice(0, normalized.lastIndexOf('/')) || '/');
}

/**
 * 判断 WebSocket 是否处于已打开状态。
 * @param {WebSocket | null | undefined} socket WebSocket 实例
 * @returns {boolean} 是否打开
 */
export function socketIsOpen(socket) { return socket?.readyState === WebSocket.OPEN; }

/**
 * 判断 WebSocket 是否处于连接中状态。
 * @param {WebSocket | null | undefined} socket WebSocket 实例
 * @returns {boolean} 是否连接中
 */
export function socketIsConnecting(socket) { return socket?.readyState === WebSocket.CONNECTING; }

/**
 * 判断当前浏览器是否为 Safari（用于剪贴板等行为差异化处理）。
 * @returns {boolean} 是否 Safari
 */
export function isSafari() {
  return /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(navigator.userAgent);
}
