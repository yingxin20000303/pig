import { Terminal } from '/vendor/xterm.js';
import { FitAddon } from '/vendor/addon-fit.js';

function generateUUID() {
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

let settingsStore = { theme: 'dark', fontSize: 14, fontWeight: 400, letterSpacing: 0, fontColor: null, pinnedOrder: [] };
let settingsLoaded = false;

async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      settingsStore = await response.json();
      settingsLoaded = true;
    }
  } catch { /* 服务不可用时使用默认值 */ }
}

function saveSettingsDebounced() {
  clearTimeout(saveSettingsDebounced.timer);
  saveSettingsDebounced.timer = setTimeout(async () => {
    try { await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsStore) }); } catch { /* 离线时忽略 */ }
  }, 300);
}

function updateSettings(key, value) {
  settingsStore[key] = value;
  saveSettingsDebounced();
}
function clearChildren(element) {
  if (element && typeof element.replaceChildren === 'function') { element.replaceChildren(); return; }
  while (element && element.firstChild) element.removeChild(element.firstChild);
}
function readBlobArrayBuffer(blob) {
  if (typeof blob.arrayBuffer === 'function') return blob.arrayBuffer();
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error || new Error('read-failed'));
    reader.readAsArrayBuffer(blob);
  });
}
function formDataToObject(formData) {
  const values = {};
  formData.forEach((value, key) => { values[key] = value; });
  return values;
}

const form = document.querySelector('#connection-form');
const terminalArea = document.querySelector('#terminal');
const emptyState = document.querySelector('#terminal-empty-state');
const emptyStateConnectButton = document.querySelector('#empty-state-connect-button');
const transferPanel = document.querySelector('#transfer-panel');
const sessionTabs = document.querySelector('#session-tabs');
const newSessionButton = document.querySelector('#new-session-button');
const statusElement = document.querySelector('#status');
const statusDot = document.querySelector('#status-dot');
const connectionHealth = document.querySelector('#connection-health');
const passwordFields = document.querySelector('#password-fields');
const keyFields = document.querySelector('#key-fields');
const profileList = document.querySelector('#profile-list');
const savedConnectionsSection = document.querySelector('#saved-connections-section');
const profileFeedback = document.querySelector('#profile-feedback');
const saveProfileButton = document.querySelector('#save-profile-button');
const drawer = document.querySelector('#connection-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const uploadButton = document.querySelector('#upload-button');
const downloadButton = document.querySelector('#download-button');
const shutdownButton = document.querySelector('#shutdown-button');
const uploadInput = document.querySelector('#upload-input');
const filePicker = document.querySelector('#file-picker');
const filePickerBackdrop = document.querySelector('#file-picker-backdrop');
const filePickerDirectoryForm = document.querySelector('#file-picker-directory-form');
const filePickerDirectoryInput = document.querySelector('#file-picker-directory-input');
const filePickerList = document.querySelector('#file-picker-list');
const filePickerSelectionCount = document.querySelector('#file-picker-selection-count');
const downloadSelectedButton = document.querySelector('#download-selected-button');
const filePickerParentButton = document.querySelector('#file-picker-parent-button');
const closeFilePickerButton = document.querySelector('#close-file-picker-button');
const uploadPicker = document.querySelector('#upload-picker');
const uploadPickerBackdrop = document.querySelector('#upload-picker-backdrop');
const uploadDirectoryForm = document.querySelector('#upload-directory-form');
const uploadDirectoryInput = document.querySelector('#upload-directory-input');
const uploadPickerParentButton = document.querySelector('#upload-picker-parent-button');
const uploadPickerList = document.querySelector('#upload-picker-list');
const uploadSelectedButton = document.querySelector('#upload-selected-button');
const uploadDirectoryError = document.querySelector('#upload-directory-error');
const closeUploadPickerButton = document.querySelector('#close-upload-picker-button');
const uploadConflictDialog = document.querySelector('#upload-conflict-dialog');
const uploadConflictBackdrop = document.querySelector('#upload-conflict-backdrop');
const uploadConflictMessage = document.querySelector('#upload-conflict-message');
const uploadConflictOverwriteButton = document.querySelector('#upload-conflict-overwrite');
const uploadConflictRenameButton = document.querySelector('#upload-conflict-rename');
const uploadConflictCancelButton = document.querySelector('#upload-conflict-cancel');
const shutdownConfirmDialog = document.querySelector('#shutdown-confirm-dialog');
const shutdownConfirmBackdrop = document.querySelector('#shutdown-confirm-backdrop');
const shutdownConfirmCancelButton = document.querySelector('#shutdown-confirm-cancel');
const shutdownConfirmConfirmButton = document.querySelector('#shutdown-confirm-confirm');
let shutdownConfirmResolver = null;
const profileOverwriteDialog = document.querySelector('#profile-overwrite-dialog');
const profileOverwriteBackdrop = document.querySelector('#profile-overwrite-backdrop');
const profileOverwriteCancelButton = document.querySelector('#profile-overwrite-cancel');
const profileOverwriteConfirmButton = document.querySelector('#profile-overwrite-confirm');
const profileOverwriteDescription = document.querySelector('#profile-overwrite-description');
let profileOverwriteResolver = null;
const closeDrawerButton = document.querySelector('#close-drawer-button');
const themeButton = document.querySelector('#theme-button');
const terminalSettingsButton = document.querySelector('#terminal-settings-button');
const terminalSettingsMenu = document.querySelector('#terminal-settings-menu');
const fontSizeInput = document.querySelector('#font-size-input');
const fontSizeValue = document.querySelector('#font-size-value');
const backgroundSettingsButton = document.querySelector('#background-settings-button');
const backgroundSettingsMenu = document.querySelector('#background-settings-menu');
const backgroundUploadButton = document.querySelector('#background-upload-button');
const backgroundFileInput = document.querySelector('#background-file-input');
const backgroundOpacityInput = document.querySelector('#background-opacity-input');
const backgroundOpacityValue = document.querySelector('#background-opacity-value');
const backgroundRemoveButton = document.querySelector('#background-remove-button');
const fontWeightInput = document.querySelector('#font-weight-input');
const fontWeightValue = document.querySelector('#font-weight-value');
const letterSpacingInput = document.querySelector('#letter-spacing-input');
const letterSpacingValue = document.querySelector('#letter-spacing-value');
const fontColorInput = document.querySelector('#font-color-input');
const fontColorValue = document.querySelector('#font-color-value');
const backgroundStatusDot = document.querySelector('#background-status-dot');

const terminalFontSettings = {
  fontSize: 14,
  fontWeight: 400,
  letterSpacing: 0,
  foreground: null
};

function syncTerminalFontSettingsFromStore() {
  terminalFontSettings.fontSize = settingsStore.fontSize;
  terminalFontSettings.fontWeight = settingsStore.fontWeight;
  terminalFontSettings.letterSpacing = settingsStore.letterSpacing;
  terminalFontSettings.foreground = settingsStore.fontColor || null;
}

let authMode = 'password';
let profiles = [];
let activeSessionId;
let drawerTrigger;
let editingSessionId = null;
const selectedDownloadFiles = new Map();
const sessions = new Map();
function socketIsOpen(socket) { return socket?.readyState === WebSocket.OPEN; }
function socketIsConnecting(socket) { return socket?.readyState === WebSocket.CONNECTING; }
setInterval(() => refreshConnectionHealth(), 1000);

const transfers = new Map();
const pickerRequests = new Map();
function updateEmptyState() { emptyState.hidden = sessions.size > 0; }
function parentDirectory(directory) {
  const normalized = String(directory || '').replace(/\/+$/, '') || '/';
  return normalized === '/' ? '/' : (normalized.slice(0, normalized.lastIndexOf('/')) || '/');
}
function showPickerLoading(input, list) {
  input.placeholder = '正在读取目录…';
  clearChildren(list);
  const loading = document.createElement('div');
  loading.className = 'file-picker-empty';
  loading.textContent = '正在读取目录…';
  list.append(loading);
}
function updateDownloadSelection() {
  const count = selectedDownloadFiles.size;
  filePickerSelectionCount.textContent = count ? `已选择 ${count} 个文件` : '未选择文件';
  downloadSelectedButton.disabled = count === 0;
}
function refreshPickerList(session, picker, directory) {
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
function refreshDownloadPickerList(session, directory) { refreshPickerList(session, 'download', directory); }
function refreshUploadPickerList(session, directory) { refreshPickerList(session, 'upload', directory); }
function openFilePicker() {
  filePicker.hidden = false;
  filePickerBackdrop.hidden = false;
  const session = activeSession();
  if (session?.home) {
    filePickerDirectoryInput.value = session.home;
    refreshDownloadPickerList(session, session.home);
  }
}
function closeFilePicker() {
  pickerRequests.delete('download');
  filePicker.hidden = true;
  filePickerBackdrop.hidden = true;
  selectedDownloadFiles.clear();
  updateDownloadSelection();
}
function setUploadDirectoryError(message = '') {
  uploadDirectoryError.textContent = message;
  uploadDirectoryError.hidden = !message;
  uploadDirectoryError.classList.toggle('visible', Boolean(message));
  uploadDirectoryInput.setAttribute('aria-invalid', String(Boolean(message)));
}
function openUploadPicker(fillHome = true) {
  uploadPicker.hidden = false;
  uploadPickerBackdrop.hidden = false;
  const session = activeSession();
  if (fillHome && session?.home) uploadDirectoryInput.value = session.home;
  setUploadDirectoryError();
  if (session?.home && uploadDirectoryInput.value.trim()) refreshUploadPickerList(session, uploadDirectoryInput.value.trim());
  uploadDirectoryInput.focus();
}
function closeUploadPicker() { pickerRequests.delete('upload'); uploadPicker.hidden = true; uploadPickerBackdrop.hidden = true; setUploadDirectoryError(); clearChildren(uploadPickerList); }
let uploadConflictCloseTimer = null;
function openUploadConflict(session, message) {
  if (uploadConflictCloseTimer) { clearTimeout(uploadConflictCloseTimer); uploadConflictCloseTimer = null; }
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
function closeUploadConflict() {
  uploadConflictDialog.classList.remove('visible');
  uploadConflictBackdrop.classList.remove('visible');
  uploadConflictCloseTimer = setTimeout(() => {
    uploadConflictCloseTimer = null;
    uploadConflictDialog.hidden = true;
    uploadConflictBackdrop.hidden = true;
    delete uploadConflictDialog.dataset.sessionId;
    delete uploadConflictDialog.dataset.transferId;
  }, 180);
}
function resolveUploadConflict(action) {
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
function showDirectoryInput(message, picker = 'download') {
  const input = picker === 'upload' ? uploadDirectoryInput : filePickerDirectoryInput;
  const list = picker === 'upload' ? uploadPickerList : filePickerList;
  input.placeholder = message;
  clearChildren(list);
  input.focus();
}
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
function renderFileList(session, message) {
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
function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  return `${(bytes / 1024 ** index).toFixed(index ? 1 : 0)} ${units[index]}`;
}
function removeTransfer(id, element) {
  const task = transfers.get(id);
  clearInterval(task?.dismissTimer);
  if (task && !task.done && !task.error) {
    for (const session of sessions.values()) {
      if (session.downloads.has(id) || session.uploads.has(id)) {
        if (socketIsOpen(session.socket)) session.socket.send(JSON.stringify({ type: 'cancel-transfer', id }));
        session.downloads.delete(id);
        session.uploads.delete(id);
        break;
      }
    }
  }
  transfers.delete(id);
  element?.remove();
}
function updateTransfer(id, details) {
  const task = { ...transfers.get(id), ...details };
  transfers.set(id, task);
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
  element.querySelector('.transfer-task-meta').textContent = task.error || (task.done ? `${completedMessage} · ${remainingSeconds} 秒后关闭` : `${task.direction === 'upload' ? '正在上传' : '正在下载'} · ${percent}% · ${formatBytes(task.transferred || 0)}/${formatBytes(task.size || 0)}`);
  element.querySelector('.transfer-task-progress > span').style.width = `${task.done ? 100 : percent}%`;
  if (task.done && !task.dismissTimer) {
    task.dismissDeadline = Date.now() + 6000;
    task.dismissTimer = setInterval(() => {
      if (Date.now() >= task.dismissDeadline) return removeTransfer(id, element);
      updateTransfer(id, {});
    }, 250);
    updateTransfer(id, {});
  }
}
function applyTerminalFontSettings() {
  fontSizeInput.value = terminalFontSettings.fontSize;
  fontSizeValue.textContent = `${terminalFontSettings.fontSize}px`;
  fontWeightInput.value = String(terminalFontSettings.fontWeight);
  fontWeightValue.textContent = String(terminalFontSettings.fontWeight);
  letterSpacingInput.value = terminalFontSettings.letterSpacing;
  letterSpacingValue.textContent = `${terminalFontSettings.letterSpacing}px`;
  fontColorInput.value = effectiveTerminalForeground();
  fontColorValue.textContent = effectiveTerminalForeground();
  updateSettings('fontSize', terminalFontSettings.fontSize);
  updateSettings('fontWeight', terminalFontSettings.fontWeight);
  updateSettings('letterSpacing', terminalFontSettings.letterSpacing);
  updateSettings('fontColor', terminalFontSettings.foreground);
  sessions.forEach((session) => {
    session.terminal.options.fontSize = terminalFontSettings.fontSize;
    session.terminal.options.fontWeight = terminalFontSettings.fontWeight;
    session.terminal.options.letterSpacing = terminalFontSettings.letterSpacing;
    session.terminal.options.theme = buildTerminalTheme();
    requestAnimationFrame(() => fitSession(session));
  });
}
const TERMINAL_THEMES = {
  light: { foreground: '#172033', cursor: '#0369a1', selectionBackground: '#bae6fd' },
  dark: { foreground: '#d8e3f1', cursor: '#7dd3fc', selectionBackground: '#155e75' }
};
const TERMINAL_BG_RGB = { light: '251, 253, 255', dark: '11, 18, 32' };
function effectiveTerminalForeground() {
  return terminalFontSettings.foreground || TERMINAL_THEMES[document.body.dataset.theme === 'light' ? 'light' : 'dark'].foreground;
}
function buildTerminalTheme() {
  const isLight = document.body.dataset.theme === 'light';
  return { background: `rgba(${TERMINAL_BG_RGB[isLight ? 'light' : 'dark']}, ${backgroundState.opacity})`, ...TERMINAL_THEMES[isLight ? 'light' : 'dark'], foreground: effectiveTerminalForeground() };
}
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.dataset.theme = isLight ? 'light' : 'dark';
  document.documentElement.dataset.theme = isLight ? 'light' : 'dark';
  updateSettings('theme', document.body.dataset.theme);
  themeButton.innerHTML = isLight
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.8A9 9 0 1 1 11.2 3 7 7 0 0 0 21 12.8z"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2.5v2M12 19.5v2M2.5 12h2M19.5 12h2M5.3 5.3l1.4 1.4M17.3 17.3l1.4 1.4M18.7 5.3l-1.4 1.4M6.7 17.3l-1.4 1.4"/></svg>';
  themeButton.title = isLight ? '切换为深色主题' : '切换为浅色主题';
  themeButton.setAttribute('aria-label', themeButton.title);
  sessions.forEach((session) => {
    session.terminal.options.theme = buildTerminalTheme();
  });
}
let backgroundState = { url: null, opacity: 0.5 };

function applyBackground() {
  document.body.style.setProperty('--webssh-bg-url', backgroundState.url ? `url("${backgroundState.url}")` : 'none');
  document.body.style.setProperty('--webssh-bg-opacity', String(backgroundState.opacity));
  const percent = String(Math.round(backgroundState.opacity * 100));
  backgroundOpacityInput.value = percent;
  backgroundOpacityValue.value = `${percent}%`;
  backgroundRemoveButton.disabled = !backgroundState.url;
  backgroundStatusDot.dataset.hasBg = String(Boolean(backgroundState.url));
  sessions.forEach((session) => { session.terminal.options.theme = buildTerminalTheme(); });
}

async function loadBackground() {
  try {
    const response = await fetch('/api/background');
    if (!response.ok) return;
    backgroundState = await response.json();
    applyBackground();
  } catch {
    /* 保持默认背景 */
  }
}

function showProfileFeedback(message, type = 'success') {
  profileFeedback.textContent = message;
  profileFeedback.dataset.type = type;
  profileFeedback.hidden = false;
}
function clearProfileFeedback() { profileFeedback.hidden = true; profileFeedback.textContent = ''; }
function openDrawer(trigger = document.activeElement) {
  drawerTrigger = trigger;
  drawer.classList.add('open');
  drawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.hidden = false;
  requestAnimationFrame(() => form.elements.host.focus());
}
function closeDrawer() {
  drawer.classList.remove('open');
  drawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.hidden = true;
  drawerTrigger?.focus?.();
}
function prepareEditSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  editingSessionId = id;
  document.querySelector('#connection-drawer-title').textContent = '编辑连接';
  const connection = session.connection || {};
  form.reset();
  form.elements.name.value = connection.name || '';
  form.elements.host.value = connection.host || '';
  form.elements.port.value = connection.port || 22;
  form.elements.username.value = connection.username || '';
  setAuthMode(connection.authMode || 'password');
  form.elements.password.value = connection.password || '';
  form.elements.privateKey.value = connection.privateKey || '';
  clearProfileSelection();
  clearProfileFeedback();
  openDrawer(session.tab);
}
function prepareNewConnection() {
  editingSessionId = null;
  document.querySelector('#connection-drawer-title').textContent = '新建连接';
  form.reset();
  form.elements.port.value = 22;
  form.elements.username.value = 'root';
  clearProfileSelection();
  clearProfileFeedback();
  setAuthMode('password');
}
function setAuthMode(mode) {
  authMode = mode === 'key' ? 'key' : 'password';
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === authMode));
  passwordFields.hidden = authMode !== 'password';
  keyFields.hidden = authMode !== 'key';
  form.elements.password.disabled = authMode !== 'password';
  form.elements.privateKey.disabled = authMode !== 'key';
}
function activeSession() { return sessions.get(activeSessionId); }
function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainingSeconds = seconds % 60;
  return hours ? `${hours}时${String(minutes).padStart(2, '0')}分` : `${minutes}分${String(remainingSeconds).padStart(2, '0')}秒`;
}
function healthItem(label, value, tone = '') {
  const item = document.createElement('span');
  item.className = `health-item ${tone}`.trim();
  const name = document.createElement('b');
  name.textContent = label;
  const detail = document.createElement('span');
  detail.textContent = value;
  item.append(name, detail);
  return item;
}
function refreshConnectionHealth() {
  const session = activeSession();
  if (!session?.connected || !session.health) { clearChildren(connectionHealth); return; }
  const { hostname, cpu, memory, latency } = session.health;
  clearChildren(connectionHealth);
  connectionHealth.append(
    healthItem('主机', hostname || '未知'),
    healthItem('延迟', latency === undefined ? '--' : `${latency} ms`, latency > 300 ? 'warning' : ''),
    healthItem('CPU', cpu === undefined ? '--' : `${cpu}%`, cpu >= 85 ? 'warning' : ''),
    healthItem('内存', memory === undefined ? '--' : `${memory}%`, memory >= 85 ? 'warning' : ''),
    healthItem('时长', formatDuration(Date.now() - session.connectedAt)),
  );
}
function setStatus(text, connected = false) {
  statusElement.textContent = text;
  statusDot.classList.toggle('connected', connected);
  if (!connected) clearChildren(connectionHealth);
}
function refreshActiveStatus() {
  const session = activeSession();
  if (!session) return setStatus('未连接');
  if (session.connected) { setStatus('已连接', true); refreshConnectionHealth(); return; }
  if (socketIsConnecting(session.socket)) return setStatus('连接中…');
  setStatus('未连接');
}
function fitSession(session) {
  if (!session || session.id !== activeSessionId) return;
  session.fitAddon.fit();
  if (socketIsOpen(session.socket)) session.socket.send(JSON.stringify({ type: 'resize', cols: session.terminal.cols, rows: session.terminal.rows }));
}
function activateSession(id) {
  if (!sessions.has(id)) return;
  if (id !== activeSessionId) {
    if (!filePicker.hidden) closeFilePicker();
    if (!uploadPicker.hidden) closeUploadPicker();
  }
  activeSessionId = id;
  sessions.forEach((session) => {
    const active = session.id === id;
    session.host.classList.toggle('active', active);
    session.tab.classList.toggle('active', active);
  });
  sessions.get(id).tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  refreshActiveStatus();
  updateEmptyState();
  requestAnimationFrame(() => { fitSession(activeSession()); activeSession()?.terminal.focus(); });
}
function closeSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  const remainingIds = [...sessions.keys()].filter((sessionId) => sessionId !== id);
  session.manuallyClosed = true;
  clearTimeout(session.reconnectTimer);
  session.socket.close?.();
  session.terminal.dispose();
  session.host.remove();
  session.tab.remove();
  sessions.delete(id);
  updateSessionTabsOverflow();
  if (activeSessionId === id) {
    activeSessionId = remainingIds[remainingIds.length - 1] || null;
    if (activeSessionId) activateSession(activeSessionId);
    else refreshActiveStatus();
  }
  updateEmptyState();
}
function createSession(label = '新会话') {
  const id = generateUUID();
  const host = document.createElement('div');
  host.className = 'terminal-host';
  const mount = document.createElement('div');
  mount.className = 'terminal-mount';
  host.append(mount);
  const tab = document.createElement('div');
  tab.className = 'session-tab';
  tab.setAttribute('role', 'tab');
  tab.tabIndex = 0;
  tab.dataset.sessionId = id;
  tab.title = '单击切换会话，双击编辑连接，中键关闭，拖拽排序';
  tab.innerHTML = '<span class="tab-label"></span><button class="tab-close" type="button" aria-label="关闭会话" title="关闭会话"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg></button>';
  tab.querySelector('.tab-label').textContent = label;
  sessionTabs.append(tab);
  updateSessionTabsOverflow();
  terminalArea.append(host);
  const terminal = new Terminal({ cursorBlink: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: terminalFontSettings.fontSize, fontWeight: terminalFontSettings.fontWeight, letterSpacing: terminalFontSettings.letterSpacing, theme: buildTerminalTheme() });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(mount);
  const session = { id, host, mount, tab, terminal, fitAddon, socket: { readyState: WebSocket.CLOSED }, connected: false, connectedAt: undefined, health: undefined, home: undefined, downloads: new Map(), uploads: new Map(), reconnectTimer: undefined, reconnectAttempts: 0, manuallyClosed: false };
  sessions.set(id, session);
  updateEmptyState();
  terminal.onData((data) => {
    if (session.connected && socketIsOpen(session.socket)) return session.socket.send(JSON.stringify({ type: 'input', data }));
    if ((data === '\r' || data === '\n') && session.connection) reconnectSession(session);
  });
  terminal.onSelectionChange(() => {
    const selectedText = terminal.getSelection();
    if (selectedText && navigator.clipboard && typeof navigator.clipboard.writeText === 'function') navigator.clipboard.writeText(selectedText).catch(() => {});
  });
  mount.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    if (!session.connected || !socketIsOpen(session.socket)) return;
    if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
      try {
        const text = await navigator.clipboard.readText();
        if (text) session.socket.send(JSON.stringify({ type: 'input', data: text }));
      } catch {
        terminal.focus();
      }
    } else {
      terminal.focus();
      try { session.terminal.paste?.(''); } catch { /* 旧版 xterm 无 paste 方法 */ }
    }
  });
  tab.addEventListener('click', (event) => {
    if (suppressNextTabClick) { suppressNextTabClick = false; return; }
    if (event.target.closest('.tab-close')) return;
    activateSession(id);
    connectPending(session);
  });
  tab.addEventListener('dblclick', (event) => {
    if (event.target.closest('.tab-close')) return;
    prepareEditSession(id);
  });
  const closeByMiddleClick = (event) => {
    if (event.button !== 1) return;
    event.preventDefault();
    closeSession(id);
  };
  tab.addEventListener('auxclick', closeByMiddleClick);
  tab.addEventListener('pointerdown', (event) => handleTabPointerDown(event, tab, id));
  tab.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateSession(id); }
  });
  tab.querySelector('.tab-close').addEventListener('click', () => closeSession(id));
  activateSession(id);
  return session;
}
function isPinnedSession(session) {
  return Boolean((session.connection && session.connection.pinned === true) || (session.pendingProfile && session.pendingProfile.pinned === true));
}
function moveSessionElements(movedId, referenceId, placeBefore) {
  const moved = sessions.get(movedId);
  const reference = sessions.get(referenceId);
  if (!moved || !reference || movedId === referenceId) return;
  sessionTabs.insertBefore(moved.tab, placeBefore ? reference.tab : reference.tab.nextSibling);
  terminalArea.insertBefore(moved.host, placeBefore ? reference.host : reference.host.nextSibling);
  [...sessionTabs.children].forEach((node) => {
    const target = sessions.get(node.dataset.sessionId);
    if (!target) return;
    sessions.delete(target.id);
    sessions.set(target.id, target);
  });
}
let dragState = null;
let suppressNextTabClick = false;
const TAB_DRAG_THRESHOLD = 5;
function handleTabPointerDown(event, tab, id) {
  if (event.button !== 0 || event.target.closest('.tab-close')) return;
  event.preventDefault();
  tab.classList.add('tab-pressing');
  dragState = { id, tab, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, active: false, ghost: null, offsetX: 0, offsetY: 0, originalTabIndex: -1, lastReferenceId: null, lastPlaceBefore: null };
}
function startTabDrag(state, event) {
  const rect = state.tab.getBoundingClientRect();
  state.offsetX = event.clientX - rect.left;
  state.offsetY = event.clientY - rect.top;
  state.originalTabIndex = [...sessionTabs.children].indexOf(state.tab);
  state.initialTabTop = rect.top;
  state.initialTabWidth = rect.width;
  state.tab.classList.add('dragging');
  state.tab.classList.remove('tab-pressing');
  sessionTabs.style.touchAction = 'none';
  sessionTabs.style.userSelect = 'none';
  sessionTabs.style.scrollBehavior = 'auto';
  const ghost = state.tab.cloneNode(true);
  ghost.classList.remove('dragging');
  ghost.classList.remove('tab-pressing');
  ghost.classList.remove('active');
  ghost.classList.add('session-tab-ghost');
  document.body.append(ghost);
  state.ghost = ghost;
  event.preventDefault();
  updateTabDrag(event);
}
function updateTabDrag(event) {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  const state = dragState;
  event.preventDefault();
  const containerRect = sessionTabs.getBoundingClientRect();
  const minLeft = containerRect.left;
  const maxLeft = containerRect.right - state.initialTabWidth;
  const clampedLeft = Math.min(Math.max(event.clientX - state.offsetX, minLeft), maxLeft);
  state.ghost.style.left = `${clampedLeft}px`;
  state.ghost.style.top = `${state.initialTabTop}px`;
  if (event.clientX < containerRect.left + 28) sessionTabs.scrollLeft -= 12;
  else if (event.clientX > containerRect.right - 28) sessionTabs.scrollLeft += 12;
  const siblings = [...sessionTabs.querySelectorAll('.session-tab:not(.dragging)')];
  const targetTab = siblings.find((item) => {
    const itemRect = item.getBoundingClientRect();
    return event.clientX < itemRect.left + itemRect.width / 2;
  });
  const referenceId = targetTab ? targetTab.dataset.sessionId : null;
  const placeBefore = Boolean(targetTab);
  if (referenceId !== state.lastReferenceId || placeBefore !== state.lastPlaceBefore) {
    state.lastReferenceId = referenceId;
    state.lastPlaceBefore = placeBefore;
    if (targetTab) moveSessionElements(state.id, targetTab.dataset.sessionId, true);
    else if (siblings.length) moveSessionElements(state.id, siblings[siblings.length - 1].dataset.sessionId, false);
  }
}
function finishTabDrag(cancelled) {
  const state = dragState;
  if (!state) return;
  dragState = null;
  const session = sessions.get(state.id);
  if (cancelled && state.active && session) {
    const tabs = [...sessionTabs.children];
    const hosts = [...terminalArea.children];
    sessionTabs.insertBefore(state.tab, tabs[state.originalTabIndex] || null);
    terminalArea.insertBefore(session.host, hosts[state.originalTabIndex] || null);
  }
  state.ghost?.remove();
  state.tab.classList.remove('dragging');
  state.tab.classList.remove('tab-pressing');
  sessionTabs.style.touchAction = '';
  sessionTabs.style.userSelect = '';
  sessionTabs.style.scrollBehavior = '';
  updateSessionTabsOverflow();
  persistPinnedOrder();
  if (state.active && !cancelled) {
    suppressNextTabClick = true;
    setTimeout(() => { suppressNextTabClick = false; }, 0);
  }
}
window.addEventListener('pointermove', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (!dragState.active) {
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < TAB_DRAG_THRESHOLD) return;
    dragState.active = true;
    startTabDrag(dragState, event);
    return;
  }
  updateTabDrag(event);
});
window.addEventListener('pointerup', (event) => {
  if (!dragState || event.pointerId !== dragState.pointerId) return;
  if (dragState.active) finishTabDrag(false);
  else {
    dragState.tab.classList.remove('tab-pressing');
    dragState = null;
  }
});
window.addEventListener('pointercancel', (event) => {
  if (dragState && event.pointerId === dragState.pointerId) finishTabDrag(true);
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dragState) finishTabDrag(true);
});
window.addEventListener('blur', () => finishTabDrag(true));
function persistPinnedOrder() {
  const order = [...sessionTabs.children]
    .map((node) => sessions.get(node.dataset.sessionId))
    .filter((session) => session && isPinnedSession(session))
    .map((session) => (session.connection && session.connection.name) || (session.pendingProfile && session.pendingProfile.name))
    .filter(Boolean);
  updateSettings('pinnedOrder', order);
}
function profileId(profile) { return profile.name; }
function clearProfileSelection() {
  profileList.querySelectorAll('.saved-profile.active').forEach((item) => item.classList.remove('active'));
}
function renderProfiles(selectedId = '') {
  clearChildren(profileList);
  savedConnectionsSection.hidden = profiles.length === 0;
  profiles.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')).forEach((profile) => {
      const item = document.createElement('div');
      item.className = 'saved-profile';
      item.classList.toggle('active', profileId(profile) === selectedId);
      const selectButton = document.createElement('div');
      selectButton.className = 'saved-profile-select';
      selectButton.setAttribute('role', 'button');
      selectButton.setAttribute('tabindex', '0');
      selectButton.innerHTML = `<div class="profile-name">${profile.name}</div><div class="profile-info">${profile.host}${profile.port && profile.port !== 22 ? ':' + profile.port : ''} · ${profile.username || ''}</div>`;
      selectButton.title = `使用 ${profile.name} 填充连接信息`;
      selectButton.addEventListener('click', () => { clearProfileSelection(); item.classList.add('active'); fillProfile(profile); clearProfileFeedback(); });
      selectButton.addEventListener('keydown', (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); selectButton.click(); } });
      const pinButton = document.createElement('button');
      pinButton.type = 'button';
      pinButton.className = 'saved-profile-pin';
      pinButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 17v5"/><path d="M9 10.76V6a3 3 0 0 1 6 0v4.76l2.17 3.46a1 1 0 0 1-.86 1.53H7.69a1 1 0 0 1-.86-1.53L9 10.76z"/><path d="M9.5 6.5h5"/></svg>';
      pinButton.classList.toggle('active', profile.pinned === true);
      pinButton.setAttribute('aria-label', profile.pinned === true ? `取消 ${profile.name} 的常驻` : `将 ${profile.name} 设为常驻`);
      pinButton.title = profile.pinned === true ? `取消常驻（下次打开不再自动出现）` : `设为常驻（下次打开时自动出现在会话栏）`;
      pinButton.addEventListener('click', () => togglePinned(profile));
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'saved-profile-delete';
      deleteButton.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18"/><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
      deleteButton.setAttribute('aria-label', `删除 ${profile.name}`);
      deleteButton.title = `删除 ${profile.name}`;
      deleteButton.addEventListener('click', () => deleteProfile(profile));
    item.append(selectButton, pinButton, deleteButton);
    profileList.append(item);
  });
}
async function persistProfile(profile) {
  const response = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  const result = await response.json();
  if (!response.ok) return { ...result, ok: false };
  const index = profiles.findIndex((item) => profileId(item) === profileId(result.profile));
  if (index >= 0) profiles[index] = result.profile; else profiles.push(result.profile);
  return { ...result, ok: true };
}
async function togglePinned(profile) {
  const next = { ...profile, pinned: profile.pinned !== true };
  try {
    const result = await persistProfile(next);
    if (!result.ok) {
      showProfileFeedback(result.message || '更新常驻设置失败。', 'error');
      return;
    }
    renderProfiles();
    if (next.pinned) {
      showPinnedSession(result.profile);
      persistPinnedOrder();
    }
  } catch { showProfileFeedback('更新常驻设置失败。', 'error'); }
}
function showPinnedSession(profile) {
  const existing = [...sessions.values()].find((session) => (session.connection && session.connection.name === profile.name) || (session.pendingProfile && session.pendingProfile.name === profile.name));
  if (existing) return;
  const previousId = activeSessionId;
  const session = createSession(profile.name || profile.host);
  session.pendingProfile = profile;
  if (previousId && sessions.has(previousId)) activateSession(previousId);
  else {
    activeSessionId = null;
    sessions.forEach((item) => {
      item.host.classList.remove('active');
      item.tab.classList.remove('active');
    });
    refreshActiveStatus();
    updateEmptyState();
  }
}
function connectPending(session) {
  if (!session.pendingProfile || session.connection) return;
  const profile = session.pendingProfile;
  session.pendingProfile = undefined;
  establishConnection(session, profile);
}
function restorePinnedSessions() {
  const pinnedProfiles = profiles.filter((profile) => profile.pinned === true);
  if (!pinnedProfiles.length) return;
  let savedOrder = [];
  try { savedOrder = settingsStore.pinnedOrder || []; } catch { /* 忽略 */ }
  const remaining = new Map(pinnedProfiles.map((profile) => [profile.name, profile]));
  const orderedProfiles = [];
  savedOrder.forEach((name) => {
    if (!remaining.has(name)) return;
    orderedProfiles.push(remaining.get(name));
    remaining.delete(name);
  });
  remaining.forEach((profile) => orderedProfiles.push(profile));
  let restored = false;
  for (const profile of orderedProfiles) {
    const exists = [...sessions.values()].some((session) => (session.connection && session.connection.name === profile.name) || (session.pendingProfile && session.pendingProfile.name === profile.name));
    if (exists) continue;
    const session = createSession(profile.name || profile.host);
    session.pendingProfile = profile;
    restored = true;
  }
  if (!restored) return;
  activeSessionId = null;
  sessions.forEach((session) => {
    session.host.classList.remove('active');
    session.tab.classList.remove('active');
  });
  emptyState.hidden = false;
  refreshActiveStatus();
}
async function deleteProfile(profile) {
  try {
    const response = await fetch(`/api/profiles/${encodeURIComponent(profile.name)}`, { method: 'DELETE' });
    if (!response.ok) return showProfileFeedback('删除连接配置失败。', 'error');
    profiles = profiles.filter((item) => profileId(item) !== profileId(profile));
    renderProfiles();
    prepareNewConnection();
  } catch { showProfileFeedback('删除连接配置失败。', 'error'); }
}
function fillProfile(profile) {
  for (const field of ['name', 'host', 'port', 'username', 'password', 'privateKey']) form.elements[field].value = profile[field] || '';
  setAuthMode(profile.authMode);
}
async function loadProfiles() {
  try {
    const response = await fetch('/api/profiles');
    if (!response.ok) return activeSession()?.terminal.writeln('\r\n\x1b[31m无法加载已保存的连接。\x1b[0m');
    profiles = await response.json();
    renderProfiles();
    restorePinnedSessions();
  } catch { activeSession()?.terminal.writeln('\r\n\x1b[31m无法加载已保存的连接。\x1b[0m'); }
}
function scheduleReconnect(session) {
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
function establishConnection(session, values) {
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
      session.downloads.set(message.id, { ...download, name: message.name, size: Number(message.size), chunks: [] });
      updateTransfer(message.id, { direction: 'download', name: message.name, size: message.size, transferred: 0 });
    }
    if (message.type === 'download-chunk') {
      const download = session.downloads.get(message.id);
      if (download) { download.chunks.push(message.data); updateTransfer(message.id, { transferred: message.transferred, size: message.size }); }
    }
    if (message.type === 'download-complete') {
      const download = session.downloads.get(message.id);
      if (download) {
        try {
          const parts = download.chunks.map((chunk) => Uint8Array.from(atob(chunk), (character) => character.charCodeAt(0)));
          const blob = new Blob(parts);
          if (blob.size !== Number(download.size)) {
            session.downloads.delete(message.id);
            updateTransfer(message.id, { error: `下载文件未保存：文件大小校验失败，应为 ${formatBytes(download.size)}，实际为 ${formatBytes(blob.size)}。` });
            return;
          }
          if (download.saveHandle) {
            const writable = await download.saveHandle.createWritable();
            await writable.write(blob);
            await writable.close();
          } else {
            const url = URL.createObjectURL(blob);
            const link = Object.assign(document.createElement('a'), { href: url, download: download.name });
            document.body.append(link);
            link.click();
            link.remove();
            setTimeout(() => URL.revokeObjectURL(url), 1000);
          }
          session.downloads.delete(message.id);
          updateTransfer(message.id, { done: true, saveLocation: download.saveHandle ? '已保存到您选择的位置' : undefined });
        } catch (error) {
          session.downloads.delete(message.id);
          updateTransfer(message.id, { error: `下载文件未保存：${error.message}` });
        }
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
function reconnectSession(session) {
  if (session.connected || socketIsConnecting(session.socket)) return;
  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = undefined;
  session.socket.close?.();
  establishConnection(session, session.connection);
}
async function startUpload(session, id) {
  const upload = session.uploads.get(id);
  const file = upload?.file;
  if (!file || !socketIsOpen(session.socket)) return;
  const chunkSize = 48 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
    const bytes = new Uint8Array(await readBlobArrayBuffer(file.slice(offset, offset + chunkSize)));
    if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    session.socket.send(JSON.stringify({ type: 'upload-chunk', id, data: btoa(binary) }));
  }
  if (!session.uploads.has(id) || !socketIsOpen(session.socket)) return;
  session.uploads.delete(id);
  session.socket.send(JSON.stringify({ type: 'upload-end', id }));
}
function connect(closeAfterConnect = true) {
  if (!form.reportValidity()) return;
  const values = formDataToObject(new FormData(form));
  if (authMode === 'password' && !values.password) return showProfileFeedback('请输入密码。', 'error');
  if (authMode === 'key' && !values.privateKey) return showProfileFeedback('请输入私钥内容。', 'error');
  const editingSession = editingSessionId ? sessions.get(editingSessionId) : undefined;
  if (editingSession) {
    const previous = editingSession.connection || {};
    const mode = values.authMode || authMode;
    const next = { ...values, authMode: mode, password: mode === 'password' ? values.password : '', privateKey: mode === 'key' ? values.privateKey : '' };
    const connectionFields = ['host', 'port', 'username', 'authMode', 'password', 'privateKey'];
    const changed = connectionFields.some((key) => String(next[key] ?? '') !== String(previous[key] ?? ''));
    editingSessionId = null;
    document.querySelector('#connection-drawer-title').textContent = '新建连接';
    if (changed) {
      editingSession.terminal.clear();
      establishConnection(editingSession, values);
    } else {
      editingSession.connection = next;
      editingSession.tab.querySelector('.tab-label').textContent = next.name || next.host;
      updateSessionTabsOverflow();
    }
  } else {
    const session = createSession(values.name || values.host);
    session.terminal.clear();
    establishConnection(session, values);
  }
  if (closeAfterConnect) closeDrawer();
}

document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.mode)));
document.querySelectorAll('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => {
  const input = button.previousElementSibling;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  const fieldName = '密码';
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', `${visible ? '隐藏' : '显示'}${fieldName}`);
  button.title = `${visible ? '隐藏' : '显示'}${fieldName}`;
}));
themeButton.addEventListener('click', () => applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));
function openShutdownConfirm() {
  shutdownConfirmDialog.hidden = false;
  shutdownConfirmBackdrop.hidden = false;
  shutdownConfirmCancelButton.focus();
  return new Promise((resolve) => { shutdownConfirmResolver = resolve; });
}
function closeShutdownConfirm(result) {
  shutdownConfirmDialog.hidden = true;
  shutdownConfirmBackdrop.hidden = true;
  if (shutdownConfirmResolver) {
    shutdownConfirmResolver(result);
    shutdownConfirmResolver = null;
  }
}
shutdownConfirmCancelButton.addEventListener('click', () => closeShutdownConfirm(false));
shutdownConfirmConfirmButton.addEventListener('click', () => closeShutdownConfirm(true));
shutdownConfirmBackdrop.addEventListener('click', () => closeShutdownConfirm(false));
function openProfileOverwrite(description) {
  profileOverwriteDescription.textContent = description;
  profileOverwriteDialog.hidden = false;
  profileOverwriteBackdrop.hidden = false;
  profileOverwriteCancelButton.focus();
  return new Promise((resolve) => { profileOverwriteResolver = resolve; });
}
function closeProfileOverwrite(result) {
  profileOverwriteDialog.hidden = true;
  profileOverwriteBackdrop.hidden = true;
  if (profileOverwriteResolver) {
    profileOverwriteResolver(result);
    profileOverwriteResolver = null;
  }
}
profileOverwriteCancelButton.addEventListener('click', () => closeProfileOverwrite(false));
profileOverwriteConfirmButton.addEventListener('click', () => closeProfileOverwrite(true));
profileOverwriteBackdrop.addEventListener('click', () => closeProfileOverwrite(false));
shutdownButton.addEventListener('click', async () => {
  if (!(await openShutdownConfirm())) return;
  shutdownButton.disabled = true;
  try {
    await fetch('/api/shutdown', { method: 'POST' });
    document.body.innerHTML = '<main class="service-stopped"><svg class="service-stopped-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 2v10"/><path d="M18.4 6.6a9 9 0 1 1-12.8 0"/></svg><p class="service-stopped-eyebrow">SERVICE OFFLINE</p><h1>WebSSH 服务已关闭</h1><p class="service-stopped-description">可关闭此浏览器页面；如需重新启动，请在您所在平台的部署环境中重新启动 WebSSH 服务。</p></main>';
  } catch {
    window.close();
  }
});
terminalSettingsButton.addEventListener('click', () => {
  backgroundSettingsMenu.hidden = true;
  backgroundSettingsButton.setAttribute('aria-expanded', 'false');
  terminalSettingsMenu.hidden = !terminalSettingsMenu.hidden;
  terminalSettingsButton.setAttribute('aria-expanded', String(!terminalSettingsMenu.hidden));
});
fontSizeInput.addEventListener('input', () => { terminalFontSettings.fontSize = Number(fontSizeInput.value); applyTerminalFontSettings(); });
fontWeightInput.addEventListener('input', () => { terminalFontSettings.fontWeight = Number(fontWeightInput.value); applyTerminalFontSettings(); });
letterSpacingInput.addEventListener('input', () => { terminalFontSettings.letterSpacing = Number(letterSpacingInput.value); applyTerminalFontSettings(); });
fontColorInput.addEventListener('input', () => { terminalFontSettings.foreground = fontColorInput.value; applyTerminalFontSettings(); });
backgroundSettingsButton.addEventListener('click', () => {
  terminalSettingsMenu.hidden = true;
  terminalSettingsButton.setAttribute('aria-expanded', 'false');
  backgroundSettingsMenu.hidden = !backgroundSettingsMenu.hidden;
  backgroundSettingsButton.setAttribute('aria-expanded', String(!backgroundSettingsMenu.hidden));
});
backgroundUploadButton.addEventListener('click', () => backgroundFileInput.click());
backgroundFileInput.addEventListener('change', async () => {
  const file = backgroundFileInput.files?.[0];
  backgroundFileInput.value = '';
  if (!file) return;
  const extMatch = file.name.toLowerCase().match(/\.(png|jpe?g|webp|gif)$/);
  const mime = file.type || (extMatch ? `image/${extMatch[1] === 'jpg' ? 'jpeg' : extMatch[1]}` : '');
  if (!['image/png', 'image/jpeg', 'image/webp', 'image/gif'].includes(mime)) {
    showProfileFeedback('仅支持 PNG、JPEG、WebP 或 GIF 图片。', 'error');
    return;
  }
  if (file.size > 8 * 1024 * 1024) {
    showProfileFeedback('图片大小必须在 8MB 以内。', 'error');
    return;
  }
  try {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(new Error('read-failed'));
      reader.readAsDataURL(file);
    });
    const data = dataUrl.slice(dataUrl.indexOf(',') + 1);
    const response = await fetch('/api/background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ data, contentType: mime, opacity: backgroundState.opacity })
    });
    if (!response.ok) return showProfileFeedback('上传背景图片失败。', 'error');
    backgroundState = await response.json();
    applyBackground();
    showProfileFeedback('背景图片已更新。');
  } catch {
    showProfileFeedback('上传背景图片失败。', 'error');
  }
});
backgroundOpacityInput.addEventListener('input', () => {
  backgroundState.opacity = Number(backgroundOpacityInput.value) / 100;
  backgroundOpacityValue.value = `${backgroundOpacityInput.value}%`;
  document.body.style.setProperty('--webssh-bg-opacity', String(backgroundState.opacity));
  sessions.forEach((session) => { session.terminal.options.theme = buildTerminalTheme(); });
});
backgroundOpacityInput.addEventListener('change', async () => {
  try {
    await fetch('/api/background', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ opacity: backgroundState.opacity })
    });
  } catch {
    /* 忽略保存失败 */
  }
});
backgroundRemoveButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/background', { method: 'DELETE' });
    if (!response.ok) return showProfileFeedback('清除背景失败。', 'error');
    backgroundState = await response.json();
    applyBackground();
  } catch {
    showProfileFeedback('清除背景失败。', 'error');
  }
});
document.addEventListener('click', (event) => {
  if (!event.target.closest('.terminal-settings')) {
    terminalSettingsMenu.hidden = true;
    terminalSettingsButton.setAttribute('aria-expanded', 'false');
    backgroundSettingsMenu.hidden = true;
    backgroundSettingsButton.setAttribute('aria-expanded', 'false');
  }
});
function updateSessionTabsOverflow() {
  const container = sessionTabs.closest('.session-tabs');
  sessionTabs.style.removeProperty('width');
  const overflowing = sessionTabs.scrollWidth > sessionTabs.clientWidth + 1;
  container.classList.toggle('is-overflowing', overflowing);
  if (!overflowing) sessionTabs.style.width = `${sessionTabs.scrollWidth}px`;
}
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateSessionTabsOverflow).observe(sessionTabs.closest('.session-tabs'));
sessionTabs.addEventListener('wheel', (event) => {
  if (!event.deltaY || sessionTabs.scrollWidth <= sessionTabs.clientWidth) return;
  event.preventDefault();
  sessionTabs.scrollLeft += event.deltaY;
}, { passive: false });
newSessionButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(newSessionButton); });
emptyStateConnectButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(emptyStateConnectButton); });
drawerBackdrop.addEventListener('click', closeDrawer);
closeDrawerButton.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!shutdownConfirmDialog.hidden) return closeShutdownConfirm(false);
  if (!profileOverwriteDialog.hidden) return closeProfileOverwrite(false);
  if (!uploadConflictDialog.hidden) return resolveUploadConflict('cancel');
  if (!uploadPicker.hidden) return closeUploadPicker();
  if (!filePicker.hidden) return closeFilePicker();
  if (drawer.classList.contains('open')) closeDrawer();
});
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
uploadSelectedButton.addEventListener('click', () => {
  uploadInput.click();
});
uploadDirectoryInput.addEventListener('input', () => {
  setUploadDirectoryError();
});
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
    updateTransfer(id, { direction: 'upload', name: file.name, size: file.size, transferred: 0 });
    session.uploads.set(id, { file, directory });
    session.socket.send(JSON.stringify({ type: 'upload-start', id, name: file.name, size: file.size, directory }));
  }
});
downloadButton.addEventListener('click', () => { const session = activeSession(); if (!session?.connected) return session?.terminal.writeln('\r\n\x1b[31m请先连接 SSH 会话。\x1b[0m'); filePickerDirectoryInput.placeholder = '请输入远程目录，例如 /home/user'; clearChildren(filePickerList); openFilePicker(); filePickerDirectoryInput.focus(); });
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

  let directoryHandle;
  if ('showDirectoryPicker' in window) {
    try {
      directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite' });
    } catch (error) {
      if (error.name === 'AbortError') return;
    }
  }

  for (const file of files) {
    const id = generateUUID();
    let saveHandle;
    if (directoryHandle) {
      try {
        saveHandle = await directoryHandle.getFileHandle(file.name, { create: true });
      } catch (error) {
        updateTransfer(id, { direction: 'download', name: file.name, error: `无法保存到所选目录：${error.message}` });
        continue;
      }
    }
    session.downloads.set(id, { name: file.name, chunks: [], saveHandle });
    session.socket.send(JSON.stringify({ type: 'download', id, remotePath: file.path }));
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
saveProfileButton.addEventListener('click', async () => {
  if (!form.reportValidity()) return;
  const values = formDataToObject(new FormData(form));
  const profile = { name: values.name.trim(), host: values.host, port: values.port, username: values.username, authMode, password: authMode === 'password' ? values.password : '', privateKey: authMode === 'key' ? values.privateKey : '' };
  const existing = profiles.find((item) => profileId(item) === profileId(profile));
  if (existing) profile.pinned = existing.pinned === true;
  if (existing && !(await openProfileOverwrite(`主机 ${profile.host}:${profile.port} 已存在同名配置，是否覆盖？`))) return;
  try {
    const result = await persistProfile(profile);
    if (!result.ok) {
      showProfileFeedback(result.message || '保存连接配置失败。', 'error');
      return;
    }
    renderProfiles(profileId(result.profile));
    fillProfile(result.profile);
  } catch (error) {
    showProfileFeedback(`保存连接配置失败：${error instanceof TypeError ? '无法连接服务器，请确认 WebSSH 服务已启动。' : error.message || '未知错误。'}`, 'error');
  }
});

form.addEventListener('submit', (event) => { event.preventDefault(); connect(); });
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestAnimationFrame(() => fitSession(activeSession()))).observe(terminalArea);
applyTheme(settingsStore.theme);
updateEmptyState();
void loadBackground();

void loadSettings().then(() => {
  syncTerminalFontSettingsFromStore();
  applyTheme(settingsStore.theme);
  applyTerminalFontSettings();
  void loadProfiles();
});
