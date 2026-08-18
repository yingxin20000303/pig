/**
 * transfers.js — 文件传输（上传/下载）管理
 *
 * 负责远程文件选择器的打开/关闭与列表渲染、上传冲突处理、
 * 传输任务进度条（transferPanel）的展示与自动关闭，
 * 以及上传/下载相关控件的事件绑定。
 */
import { generateUUID, formatBytes, clearChildren, socketIsOpen, parentDirectory } from './utils.js?v=26';
import {
  sessions,
  transfers,
  pickerRequests,
  uploadConflictCloseTimer,
  setUploadConflictCloseTimer
} from './state.js?v=26';
import {
  filePicker,
  filePickerBackdrop,
  filePickerDirectoryInput,
  filePickerDirectoryForm,
  filePickerList,
  filePickerParentButton,
  filePickerSelectionCount,
  closeFilePickerButton,
  downloadSelectedButton,
  uploadPicker,
  uploadPickerBackdrop,
  closeUploadPickerButton,
  uploadDirectoryInput,
  uploadDirectoryForm,
  uploadPickerList,
  uploadPickerParentButton,
  uploadDirectoryError,
  uploadSelectedButton,
  uploadInput,
  uploadButton,
  downloadButton,
  uploadConflictDialog,
  uploadConflictBackdrop,
  uploadConflictMessage,
  uploadConflictOverwriteButton,
  uploadConflictRenameButton,
  uploadConflictCancelButton,
  transferPanel,
  transferHistoryButton,
  transferHistoryBackdrop,
  transferHistoryDialog,
  transferHistoryList,
  closeTransferHistoryButton,
  transferHistorySearch,
  clearTransferHistoryButton
} from './dom.js?v=26';

const TRANSFER_HISTORY_CACHE_KEY = 'webssh-transfer-history';
let transferHistory = [];
let transferHistorySaveTimer;
import { activeSession } from './sessions.js?v=26';

/** 下载文件选择器中已勾选的文件集合 */
const selectedDownloadFiles = new Map();

/**
 * 显示文件选择器的加载占位状态。
 * @param {HTMLInputElement} input 目录输入框
 * @param {HTMLElement} list 列表容器
 */
function showPickerLoading(input, list) {
  input.placeholder = '正在读取目录…';
  clearChildren(list);
  const loading = document.createElement('div');
  loading.className = 'file-picker-empty';
  loading.textContent = '正在读取目录…';
  list.append(loading);
}

/**
 * 更新下载选择计数与按钮可用状态。
 */
function updateDownloadSelection() {
  const count = selectedDownloadFiles.size;
  filePickerSelectionCount.textContent = count ? `已选择 ${count} 个文件` : '未选择文件';
  downloadSelectedButton.disabled = count === 0;
}

/**
 * 向服务端请求刷新远程目录列表。
 * @param {object} session 会话对象
 * @param {'upload' | 'download'} picker 选择器类型
 * @param {string} directory 目录路径
 */
export function refreshPickerList(session, picker, directory) {
  if (!session?.connected || !socketIsOpen(session.socket) || !directory) return;
  if (picker === 'download') {
    selectedDownloadFiles.clear();
    updateDownloadSelection();
  }
  const input = picker === 'upload' ? uploadDirectoryInput : filePickerDirectoryInput;
  const list = picker === 'upload' ? uploadPickerList : filePickerList;
  const requestId = generateUUID();
  pickerRequests.set(picker, { requestId, sessionId: session.id, directory });
  showPickerLoading(input, list);
  session.socket.send(JSON.stringify({ type: 'list-files', picker, directory, requestId }));
}

/**
 * 刷新下载选择器目录列表。
 * @param {object} session 会话对象
 * @param {string} directory 目录路径
 */
export function refreshDownloadPickerList(session, directory) { refreshPickerList(session, 'download', directory); }

/**
 * 刷新上传选择器目录列表。
 * @param {object} session 会话对象
 * @param {string} directory 目录路径
 */
export function refreshUploadPickerList(session, directory) { refreshPickerList(session, 'upload', directory); }

/**
 * 打开下载文件选择器（默认进入用户主目录）。
 */
export function openFilePicker() {
  filePicker.hidden = false;
  filePickerBackdrop.hidden = false;
  const session = activeSession();
  if (session?.home) {
    filePickerDirectoryInput.value = session.home;
    refreshDownloadPickerList(session, session.home);
  }
}

/**
 * 关闭下载文件选择器并清空勾选。
 */
export function closeFilePicker() {
  pickerRequests.delete('download');
  filePicker.hidden = true;
  filePickerBackdrop.hidden = true;
  selectedDownloadFiles.clear();
  updateDownloadSelection();
}

/**
 * 设置/清除上传目录的错误提示。
 * @param {string} [message=''] 错误消息（空则清除）
 */
export function setUploadDirectoryError(message = '') {
  uploadDirectoryError.textContent = message;
  uploadDirectoryError.hidden = !message;
  uploadDirectoryError.classList.toggle('visible', Boolean(message));
  uploadDirectoryInput.setAttribute('aria-invalid', String(Boolean(message)));
}

/**
 * 打开上传文件选择器。
 * @param {boolean} [fillHome=true] 是否自动填充主目录
 */
export function openUploadPicker(fillHome = true) {
  uploadPicker.hidden = false;
  uploadPickerBackdrop.hidden = false;
  const session = activeSession();
  if (fillHome && session?.home) uploadDirectoryInput.value = session.home;
  setUploadDirectoryError();
  if (session?.home && uploadDirectoryInput.value.trim()) refreshUploadPickerList(session, uploadDirectoryInput.value.trim());
  uploadDirectoryInput.focus();
}

/**
 * 关闭上传文件选择器并清理状态。
 */
export function closeUploadPicker() { pickerRequests.delete('upload'); uploadPicker.hidden = true; uploadPickerBackdrop.hidden = true; setUploadDirectoryError(); clearChildren(uploadPickerList); }

/**
 * 打开上传同名冲突确认对话框。
 * @param {object} session 会话对象
 * @param {object} message 冲突消息（含 id、name、remotePath）
 */
export function openUploadConflict(session, message) {
  if (uploadConflictCloseTimer) { clearTimeout(uploadConflictCloseTimer); setUploadConflictCloseTimer(null); }
  uploadConflictDialog.dataset.sessionId = session.id;
  uploadConflictDialog.dataset.transferId = message.id;
  clearChildren(uploadConflictMessage);
  const name = document.createElement('strong');
  name.textContent = message.name;
  const path = document.createElement('span');
  path.textContent = message.remotePath;
  uploadConflictMessage.append(name, path);
  uploadConflictBackdrop.hidden = false;
  uploadConflictDialog.hidden = false;
  void uploadConflictDialog.offsetHeight;
  uploadConflictBackdrop.classList.add('visible');
  uploadConflictDialog.classList.add('visible');
  uploadConflictOverwriteButton.focus();
}

/**
 * 关闭上传冲突对话框（延迟隐藏，带过渡动画）。
 */
export function closeUploadConflict() {
  uploadConflictDialog.classList.remove('visible');
  uploadConflictBackdrop.classList.remove('visible');
  setUploadConflictCloseTimer(setTimeout(() => {
    setUploadConflictCloseTimer(null);
    uploadConflictDialog.hidden = true;
    uploadConflictBackdrop.hidden = true;
    delete uploadConflictDialog.dataset.sessionId;
    delete uploadConflictDialog.dataset.transferId;
  }, 180));
}

/**
 * 处理上传冲突选择（overwrite / rename / cancel）。
 * @param {'overwrite' | 'rename' | 'cancel'} action 冲突处理方式
 */
export function resolveUploadConflict(action) {
  const session = sessions.get(uploadConflictDialog.dataset.sessionId);
  const id = uploadConflictDialog.dataset.transferId;
  const upload = session?.uploads.get(id);
  closeUploadConflict();
  if (!upload) return;
  if (action === 'cancel') {
    session.uploads.delete(id);
    const element = transferPanel.querySelector(`[data-transfer-id="${id}"]`);
    removeTransfer(id, element);
    return;
  }
  if (session.connected && socketIsOpen(session.socket)) {
    session.socket.send(JSON.stringify({ type: 'upload-start', id, name: upload.file.name, size: upload.file.size, directory: upload.directory, conflictAction: action }));
  }
}

/**
 * 在目录输入框显示提示消息（如目录读取失败）。
 * @param {string} message 提示消息
 * @param {'upload' | 'download'} [picker='download'] 选择器类型
 */
export function showDirectoryInput(message, picker = 'download') {
  const input = picker === 'upload' ? uploadDirectoryInput : filePickerDirectoryInput;
  const list = picker === 'upload' ? uploadPickerList : filePickerList;
  input.placeholder = message;
  clearChildren(list);
  input.focus();
}

/**
 * 创建目录条目按钮（双击进入）。
 * @param {object} session 会话对象
 * @param {object} directory 目录信息
 * @param {'upload' | 'download'} picker 选择器类型
 * @returns {HTMLButtonElement} 目录按钮
 */
function createDirectoryItem(session, directory, picker) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'file-picker-item directory-picker-item';
  button.innerHTML = '<span></span><span>目录</span>';
  button.querySelector('span').textContent = directory.name;
  button.addEventListener('dblclick', () => {
    const input = picker === 'upload' ? uploadDirectoryInput : filePickerDirectoryInput;
    input.value = directory.path;
    if (picker === 'upload') setUploadDirectoryError();
    refreshPickerList(session, picker, directory.path);
  });
  return button;
}

/**
 * 渲染服务端返回的远程文件列表。
 * @param {object} session 会话对象
 * @param {object} message 文件列表消息
 */
export function renderFileList(session, message) {
  const picker = message.picker === 'upload' ? 'upload' : 'download';
  const request = pickerRequests.get(picker);
  const pickerOpen = picker === 'upload' ? !uploadPicker.hidden : !filePicker.hidden;
  if (!pickerOpen || !request || request.requestId !== message.requestId || request.sessionId !== session.id) return;
  const input = picker === 'upload' ? uploadDirectoryInput : filePickerDirectoryInput;
  const list = picker === 'upload' ? uploadPickerList : filePickerList;
  const directories = Array.isArray(message.directories) ? message.directories : [];
  const files = Array.isArray(message.files) ? message.files : [];
  input.value = message.path;
  input.placeholder = picker === 'upload' ? '例如 /home/user' : '输入远程目录，例如 /home/user';
  clearChildren(list);
  directories.forEach((directory) => list.append(createDirectoryItem(session, directory, picker)));
  if (picker === 'upload') {
    if (!directories.length) list.innerHTML = '<div class="file-picker-empty">当前目录没有可进入的子目录</div>';
    return;
  }
  if (!directories.length && !files.length) { list.innerHTML = '<div class="file-picker-empty">当前目录没有可下载的文件或可进入的目录</div>'; return; }
  files.forEach((file) => {
    const label = document.createElement('label');
    label.className = 'file-picker-item file-picker-file-item';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = selectedDownloadFiles.has(file.path);
    const name = document.createElement('span');
    name.textContent = file.name;
    const size = document.createElement('span');
    size.textContent = formatBytes(file.size);
    checkbox.addEventListener('change', () => {
      if (checkbox.checked) selectedDownloadFiles.set(file.path, file);
      else selectedDownloadFiles.delete(file.path);
      label.classList.toggle('selected', checkbox.checked);
      updateDownloadSelection();
    });
    label.classList.toggle('selected', checkbox.checked);
    label.append(checkbox, name, size);
    list.append(label);
  });
  updateDownloadSelection();
}

/**
 * 移除传输任务（取消进行中的传输并清理 DOM）。
 * @param {string} id 传输任务 id
 * @param {HTMLElement | null} element 任务 DOM 元素
 */
export function removeTransfer(id, element) {
  const task = transfers.get(id);
  clearInterval(task?.dismissTimer);
  if (task && !task.done && !task.error) {
    for (const session of sessions.values()) {
      if (session.downloads.has(id) || session.uploads.has(id)) {
        if (socketIsOpen(session.socket)) session.socket.send(JSON.stringify({ type: 'cancel-transfer', id }));
        const download = session.downloads.get(id);
        if (download) {
          download.cancelled = true;
          void download.writable?.abort().catch(() => {});
        }
        session.downloads.delete(id);
        session.uploads.delete(id);
        break;
      }
    }
  }
  transfers.delete(id);
  element?.remove();
}

/**
 * 更新传输任务状态并刷新进度条 UI。
 * @param {string} id 传输任务 id
 * @param {object} details 需要合并到任务的状态字段
 */
function renderTransferHistory() {
  clearChildren(transferHistoryList);
  const query = transferHistorySearch.value.trim().toLocaleLowerCase();
  const visibleHistory = query
    ? transferHistory.filter((item) => [item.name, item.location, item.direction === 'upload' ? '上传' : '下载'].some((value) => String(value || '').toLocaleLowerCase().includes(query)))
    : transferHistory;
  if (!visibleHistory.length) {
    const empty = document.createElement('p');
    empty.className = 'transfer-history-empty';
    empty.textContent = query ? '没有匹配的传输记录' : '暂无传输记录';
    transferHistoryList.append(empty);
    return;
  }
  visibleHistory.forEach((item) => {
    const row = document.createElement('article');
    row.className = 'transfer-history-item';
    const badge = document.createElement('span');
    badge.className = `transfer-history-badge ${item.direction}`;
    badge.innerHTML = item.direction === 'upload'
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg><span>上传</span>'
      : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg><span>下载</span>';
    const title = document.createElement('strong');
    title.textContent = item.name;
    const meta = document.createElement('span');
    meta.className = 'transfer-history-meta';
    const time = new Date(item.completedAt).toLocaleString('zh-CN', { hour12: false });
    meta.textContent = `${formatBytes(item.size)} · 耗时 ${formatTransferDuration(item.durationMs)} · ${time}`;
    const details = document.createElement('div');
    details.className = 'transfer-history-details';
    const location = document.createElement('small');
    location.className = 'transfer-history-location';
    location.textContent = item.direction === 'upload' ? `上传至：${item.location}` : `下载到：${item.location}`;
    location.title = location.textContent;
    const server = document.createElement('small');
    server.className = 'transfer-history-server';
    server.textContent = item.direction === 'upload' ? `上传服务器：${item.server || '服务器未知'}` : `下载服务器：${item.server || '服务器未知'}`;
    server.title = server.textContent;
    details.append(location, server);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'transfer-history-delete icon-button';
    remove.setAttribute('aria-label', `删除 ${item.name} 的传输记录`);
    remove.title = '删除记录';
    remove.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4h8v2"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v5M14 11v5"/></svg>';
    remove.addEventListener('click', () => {
      transferHistory = transferHistory.filter((entry) => entry.id !== item.id);
      renderTransferHistory();
      scheduleTransferHistorySave();
    });
    row.append(badge, title, meta, details, remove);
    transferHistoryList.append(row);
  });
}

function persistTransferHistoryLocally() {
  try { localStorage.setItem(TRANSFER_HISTORY_CACHE_KEY, JSON.stringify(transferHistory)); } catch { /* 本地存储不可用不影响传输 */ }
}

function scheduleTransferHistorySave() {
  persistTransferHistoryLocally();
  clearTimeout(transferHistorySaveTimer);
  transferHistorySaveTimer = setTimeout(async () => {
    try {
      const response = await fetch('/api/transfer-history', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(transferHistory) });
      if (!response.ok) throw new Error('save-failed');
    } catch { /* 本地备份已保存，服务恢复后下次变更会自动同步 */ }
  }, 100);
}

function formatTransferDuration(durationMs) {
  const seconds = Math.max(0, Math.round((Number(durationMs) || 0) / 1000));
  if (seconds < 60) return `${seconds} 秒`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes} 分 ${seconds % 60} 秒`;
}

function addTransferHistory(task) {
  if (!task?.done || task.error || task.historyRecorded) return;
  task.historyRecorded = true;
  transferHistory.unshift({
    id: task.id,
    direction: task.direction,
    name: task.name || '未命名文件',
    size: Number(task.size) || 0,
    location: task.location || (task.direction === 'upload' ? '远程位置未知' : '浏览器默认下载目录'),
    server: task.server || '服务器未知',
    durationMs: Math.max(0, Date.now() - (task.startedAt || Date.now())),
    completedAt: new Date().toISOString()
  });
  transferHistory = transferHistory.slice(0, 200);
  renderTransferHistory();
  scheduleTransferHistorySave();
}

async function loadTransferHistory() {
  try {
    const cached = JSON.parse(localStorage.getItem(TRANSFER_HISTORY_CACHE_KEY) || '[]');
    if (Array.isArray(cached)) transferHistory = cached;
  } catch { /* 本地存储不可用时继续读取服务端记录 */ }
  renderTransferHistory();
  try {
    const response = await fetch('/api/transfer-history');
    if (!response.ok) return;
    const history = await response.json();
    if (!Array.isArray(history)) return;
    const entries = new Map([...transferHistory, ...history].map((item) => [item.id, item]));
    transferHistory = [...entries.values()].sort((a, b) => new Date(b.completedAt) - new Date(a.completedAt)).slice(0, 200);
    persistTransferHistoryLocally();
    renderTransferHistory();
  } catch { /* 本地备份仍可正常使用 */ }
}

function closeTransferHistory() {
  transferHistoryBackdrop.hidden = true;
  transferHistoryDialog.hidden = true;
  transferHistoryButton.setAttribute('aria-expanded', 'false');
}

export function updateTransfer(id, details) {
  const previousTask = transfers.get(id);
  const task = { ...previousTask, ...details, id, startedAt: previousTask?.startedAt || Date.now() };
  transfers.set(id, task);
  if (task.done) addTransferHistory(task);
  let element = transferPanel.querySelector(`[data-transfer-id="${id}"]`);
  if (!element) {
    element = document.createElement('div');
    element.className = 'transfer-task';
    element.dataset.transferId = id;
    element.innerHTML = '<div class="transfer-task-header"><span class="transfer-task-icon" aria-hidden="true"></span><div class="transfer-task-details"><span class="transfer-task-name"></span><span class="transfer-task-meta"></span></div><button class="transfer-task-close" type="button" aria-label="关闭传输进度" title="关闭"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div><div class="transfer-task-progress"><span></span></div>';
    element.querySelector('.transfer-task-close').addEventListener('click', () => removeTransfer(id, element));
    transferPanel.append(element);
  }
  const percent = task.size ? Math.min(100, Math.round((task.transferred || 0) / task.size * 100)) : 0;
  element.classList.toggle('error', Boolean(task.error));
  element.classList.toggle('completed', Boolean(task.done));
  const transferIcon = element.querySelector('.transfer-task-icon');
  transferIcon.innerHTML = task.error
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>'
    : task.done
      ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 13l4 4L19 7"/></svg>'
      : task.direction === 'upload'
        ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 15V4"/><path d="m7 9 5-5 5 5"/><path d="M5 20h14"/></svg>'
        : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4v11"/><path d="m7 10 5 5 5-5"/><path d="M5 20h14"/></svg>';
  transferIcon.setAttribute('aria-label', task.error ? '传输失败' : task.done ? '传输完成' : task.direction === 'upload' ? '正在上传' : '正在下载');
  element.querySelector('.transfer-task-name').textContent = task.name;
  const remainingSeconds = task.dismissDeadline ? Math.max(0, Math.ceil((task.dismissDeadline - Date.now()) / 1000)) : 0;
  const completedMessage = task.direction === 'download'
    ? `下载完成 · 100% · ${task.saveLocation || '保存位置由浏览器下载设置决定'}`
    : `上传完成 · ${formatBytes(task.size || task.transferred || 0)} · 100%`;
  const inFinalizing = task.direction === 'download' && task.finalizing && !task.done;
  element.querySelector('.transfer-task-meta').textContent = task.error || (task.done ? `${completedMessage} · ${remainingSeconds} 秒后关闭` : inFinalizing ? `正在保存并合并文件 · 100% · 请勿关闭` : `${task.direction === 'upload' ? '正在上传' : '正在下载'} · ${percent}% · ${formatBytes(task.transferred || 0)}/${formatBytes(task.size || 0)}`);
  element.querySelector('.transfer-task-progress > span').style.width = `${task.done || inFinalizing ? 100 : percent}%`;
  if (task.done && !task.dismissTimer) {
    task.dismissDeadline = Date.now() + 6000;
    task.dismissTimer = setInterval(() => {
      if (Date.now() >= task.dismissDeadline) return removeTransfer(id, element);
      updateTransfer(id, {});
    }, 250);
    updateTransfer(id, {});
  }
}

/**
 * 绑定上传/下载相关控件的事件（由入口模块初始化时调用）。
 */
export function bindTransferEvents() {
  void loadTransferHistory();
  transferHistoryButton.addEventListener('click', () => {
    renderTransferHistory();
    transferHistoryBackdrop.hidden = false;
    transferHistoryDialog.hidden = false;
    transferHistoryButton.setAttribute('aria-expanded', 'true');
  });
  closeTransferHistoryButton.addEventListener('click', closeTransferHistory);
  transferHistoryBackdrop.addEventListener('click', closeTransferHistory);
  transferHistorySearch.addEventListener('input', renderTransferHistory);
  clearTransferHistoryButton.addEventListener('click', () => {
    if (!transferHistory.length) return;
    transferHistory = [];
    renderTransferHistory();
    scheduleTransferHistorySave();
  });

  // —— 上传 ——
  uploadButton.addEventListener('click', () => {
    if (!activeSession()?.connected) return activeSession()?.terminal.writeln('\r\n\x1b[31m请先连接 SSH 会话。\x1b[0m');
    setUploadDirectoryError();
    openUploadPicker();
  });
  uploadDirectoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const session = activeSession();
    const directory = uploadDirectoryInput.value.trim();
    if (!session?.connected || !socketIsOpen(session.socket)) return;
    if (!directory) return showDirectoryInput('请输入要读取的远程目录。', 'upload');
    setUploadDirectoryError();
    refreshUploadPickerList(session, directory);
  });
  uploadSelectedButton.addEventListener('click', () => { uploadInput.click(); });
  uploadDirectoryInput.addEventListener('input', () => { setUploadDirectoryError(); });
  uploadDirectoryInput.addEventListener('change', () => {
    const session = activeSession();
    const directory = uploadDirectoryInput.value.trim();
    if (session?.connected && directory) refreshUploadPickerList(session, directory);
  });
  uploadInput.addEventListener('change', () => {
    const files = [...uploadInput.files];
    const session = activeSession();
    const directory = uploadDirectoryInput.value.trim();
    uploadInput.value = '';
    if (!files.length || !session?.connected || !directory) return;
    closeUploadPicker();
    for (const file of files) {
      const id = generateUUID();
      updateTransfer(id, { direction: 'upload', name: file.name, size: file.size, transferred: 0, location: directory, server: session.connection?.name || session.connection?.host || '服务器未知' });
      session.uploads.set(id, { file, directory });
      session.socket.send(JSON.stringify({ type: 'upload-start', id, name: file.name, size: file.size, directory }));
    }
  });

  // —— 下载 ——
  downloadButton.addEventListener('click', () => {
    const session = activeSession();
    if (!session?.connected) return session?.terminal.writeln('\r\n\x1b[31m请先连接 SSH 会话。\x1b[0m');
    filePickerDirectoryInput.placeholder = '请输入远程目录，例如 /home/user';
    clearChildren(filePickerList);
    openFilePicker();
    filePickerDirectoryInput.focus();
  });
  filePickerDirectoryForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const session = activeSession();
    const directory = filePickerDirectoryInput.value.trim();
    if (!session?.connected || !socketIsOpen(session.socket)) return;
    if (!directory) return showDirectoryInput('请输入要读取的远程目录。');
    refreshDownloadPickerList(session, directory);
  });
  filePickerParentButton.addEventListener('click', () => {
    const session = activeSession();
    const directory = filePickerDirectoryInput.value.trim();
    if (session?.connected && directory) refreshDownloadPickerList(session, parentDirectory(directory));
  });
  uploadPickerParentButton.addEventListener('click', () => {
    const session = activeSession();
    const directory = uploadDirectoryInput.value.trim();
    if (!session?.connected || !directory) return;
    setUploadDirectoryError();
    refreshUploadPickerList(session, parentDirectory(directory));
  });
  downloadSelectedButton.addEventListener('click', async () => {
    const session = activeSession();
    const files = [...selectedDownloadFiles.values()];
    if (!session?.connected || !socketIsOpen(session.socket) || !files.length) return;
    if (!window.showDirectoryPicker) {
      session.terminal.writeln('\r\n\x1b[31m当前浏览器不支持直接保存到所选目录，请使用最新版 Chrome 或 Edge。\x1b[0m');
      return;
    }

    let directoryHandle;
    try {
      directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (error) {
      if (error.name !== 'AbortError') session.terminal.writeln(`\r\n\x1b[31m无法获取本地保存目录：${error.message}\x1b[0m`);
      return;
    }

    for (const file of files) {
      const id = generateUUID();
      try {
        const fileHandle = await directoryHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        session.downloads.set(id, { name: file.name, remotePath: file.path, directoryHandle, writable, written: 0, writeChain: Promise.resolve(), cancelled: false });
        session.socket.send(JSON.stringify({ type: 'download', id, remotePath: file.path }));
      } catch (error) {
        updateTransfer(id, { direction: 'download', name: file.name, error: `无法在所选目录创建文件：${error.message}` });
      }
    }
    closeFilePicker();
  });
  closeFilePickerButton.addEventListener('click', closeFilePicker);
  filePickerBackdrop.addEventListener('click', closeFilePicker);
  closeUploadPickerButton.addEventListener('click', closeUploadPicker);
  uploadPickerBackdrop.addEventListener('click', closeUploadPicker);
  uploadConflictOverwriteButton.addEventListener('click', () => resolveUploadConflict('overwrite'));
  uploadConflictRenameButton.addEventListener('click', () => resolveUploadConflict('rename'));
  uploadConflictCancelButton.addEventListener('click', () => resolveUploadConflict('cancel'));
  uploadConflictBackdrop.addEventListener('click', () => resolveUploadConflict('cancel'));
}
