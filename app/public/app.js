import { Terminal } from 'https://cdn.jsdelivr.net/npm/@xterm/xterm@5.5.0/+esm';
import { FitAddon } from 'https://cdn.jsdelivr.net/npm/@xterm/addon-fit@0.10.0/+esm';

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
const connectButton = document.querySelector('#connect-button');
const passwordFields = document.querySelector('#password-fields');
const keyFields = document.querySelector('#key-fields');
const profileList = document.querySelector('#profile-list');
const savedConnectionsSection = document.querySelector('#saved-connections-section');
const profileFeedback = document.querySelector('#profile-feedback');
const saveProfileButton = document.querySelector('#save-profile-button');
const drawer = document.querySelector('#connection-drawer');
const drawerBackdrop = document.querySelector('#drawer-backdrop');
const openDrawerButton = document.querySelector('#open-drawer-button');
const uploadButton = document.querySelector('#upload-button');
const downloadButton = document.querySelector('#download-button');
const shutdownButton = document.querySelector('#shutdown-button');
const uploadInput = document.querySelector('#upload-input');
const filePicker = document.querySelector('#file-picker');
const filePickerBackdrop = document.querySelector('#file-picker-backdrop');
const filePickerDirectoryForm = document.querySelector('#file-picker-directory-form');
const filePickerDirectoryInput = document.querySelector('#file-picker-directory-input');
const filePickerList = document.querySelector('#file-picker-list');
const closeFilePickerButton = document.querySelector('#close-file-picker-button');
const uploadPicker = document.querySelector('#upload-picker');
const uploadPickerBackdrop = document.querySelector('#upload-picker-backdrop');
const uploadDirectoryForm = document.querySelector('#upload-directory-form');
const uploadDirectoryInput = document.querySelector('#upload-directory-input');
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
const fontWeightInput = document.querySelector('#font-weight-input');
const fontWeightValue = document.querySelector('#font-weight-value');
const letterSpacingInput = document.querySelector('#letter-spacing-input');
const letterSpacingValue = document.querySelector('#letter-spacing-value');

const terminalFontSettings = {
  fontSize: Math.min(24, Math.max(10, Number(localStorage.getItem('webssh-font-size')) || 14)),
  fontWeight: Math.min(900, Math.max(100, Number(localStorage.getItem('webssh-font-weight')) || 400)),
  letterSpacing: Math.min(8, Math.max(-2, Number(localStorage.getItem('webssh-letter-spacing')) || 0))
};

let authMode = 'password';
let profiles = [];
let activeSessionId;
let drawerTrigger;
let editingSessionId = null;
let uploadDirectoryValidation;
const sessions = new Map();
setInterval(() => refreshConnectionHealth(), 1000);

const transfers = new Map();
function updateEmptyState() { emptyState.hidden = sessions.size > 0; }
function refreshDownloadPickerList(session, directory) {
  if (!session?.connected || session.socket.readyState !== WebSocket.OPEN) return;
  if (!directory) return;
  filePickerDirectoryInput.placeholder = '正在读取目录…';
  filePickerList.replaceChildren();
  const loading = document.createElement('div');
  loading.className = 'file-picker-empty';
  loading.textContent = '正在读取目录…';
  filePickerList.append(loading);
  session.socket.send(JSON.stringify({ type: 'list-files', directory }));
}
function openFilePicker() {
  filePicker.hidden = false;
  filePickerBackdrop.hidden = false;
  const session = activeSession();
  if (session?.home) {
    filePickerDirectoryInput.value = session.home;
    refreshDownloadPickerList(session, session.home);
  }
}
function closeFilePicker() { filePicker.hidden = true; filePickerBackdrop.hidden = true; }
function setUploadDirectoryError(message = '') {
  uploadDirectoryError.textContent = message;
  uploadDirectoryError.hidden = !message;
  uploadDirectoryError.classList.toggle('visible', Boolean(message));
  uploadDirectoryInput.setAttribute('aria-invalid', String(Boolean(message)));
}
function setUploadDirectoryChecking(checking) {
  uploadDirectoryForm.classList.toggle('is-checking', checking);
  uploadDirectoryForm.querySelector('button').disabled = checking;
}
function validateUploadDirectory() {
  const session = activeSession();
  const directory = uploadDirectoryInput.value.trim();
  if (!directory) return uploadDirectoryInput.focus();
  if (!session?.connected || session.socket.readyState !== WebSocket.OPEN) return;
  const requestId = crypto.randomUUID();
  uploadDirectoryValidation = { requestId, sessionId: session.id, directory };
  setUploadDirectoryError();
  setUploadDirectoryChecking(true);
  session.socket.send(JSON.stringify({ type: 'validate-upload-directory', requestId, directory }));
}
function openUploadPicker(fillHome = true) {
  uploadPicker.hidden = false;
  uploadPickerBackdrop.hidden = false;
  const session = activeSession();
  if (fillHome && session?.home) uploadDirectoryInput.value = session.home;
  uploadDirectoryInput.focus();
}
function closeUploadPicker() { uploadPicker.hidden = true; uploadPickerBackdrop.hidden = true; uploadDirectoryValidation = undefined; setUploadDirectoryChecking(false); setUploadDirectoryError(); }
function openUploadConflict(session, message) {
  uploadConflictDialog.dataset.sessionId = session.id;
  uploadConflictDialog.dataset.transferId = message.id;
  uploadConflictMessage.replaceChildren();
  const name = document.createElement('strong');
  name.textContent = message.name;
  const path = document.createElement('span');
  path.textContent = message.remotePath;
  uploadConflictMessage.append(name, path);
  uploadConflictDialog.hidden = false;
  uploadConflictBackdrop.hidden = false;
  uploadConflictOverwriteButton.focus();
}
function closeUploadConflict() {
  uploadConflictDialog.hidden = true;
  uploadConflictBackdrop.hidden = true;
  delete uploadConflictDialog.dataset.sessionId;
  delete uploadConflictDialog.dataset.transferId;
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
  if (session.connected && session.socket.readyState === WebSocket.OPEN) {
    session.socket.send(JSON.stringify({ type: 'upload-start', id, name: upload.file.name, size: upload.file.size, directory: upload.directory, conflictAction: action }));
  }
}
function showDirectoryInput(message) {
  filePickerDirectoryInput.placeholder = message;
  filePickerList.replaceChildren();
  filePickerDirectoryInput.focus();
}
function renderFileList(session, message) {
  filePickerDirectoryInput.value = message.path;
  filePickerDirectoryInput.placeholder = '输入远程目录，例如 /home/user';
  filePickerList.replaceChildren();
  if (!message.files.length) { filePickerList.innerHTML = '<div class="file-picker-empty">当前目录没有可下载的文件</div>'; return; }
  message.files.forEach((file) => {
    const button = document.createElement('button');
    button.type = 'button'; button.className = 'file-picker-item';
    button.innerHTML = `<span></span><span>${formatBytes(file.size)}</span>`;
    button.querySelector('span').textContent = file.name;
    button.addEventListener('click', async () => {
      if (!session.connected || session.socket.readyState !== WebSocket.OPEN) return;
      const id = crypto.randomUUID();
      let saveHandle;
      if ('showSaveFilePicker' in window) {
        try {
          saveHandle = await window.showSaveFilePicker({ suggestedName: file.name });
        } catch (error) {
          if (error.name === 'AbortError') return;
        }
      }
      session.downloads.set(id, { name: file.name, chunks: [], saveHandle });
      session.socket.send(JSON.stringify({ type: 'download', id, remotePath: file.path }));
      closeFilePicker();
    });
    filePickerList.append(button);
  });
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
        if (session.socket.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type: 'cancel-transfer', id }));
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
    element.innerHTML = '<div class="transfer-task-header"><span class="transfer-task-icon" aria-hidden="true"></span><div class="transfer-task-details"><span class="transfer-task-name"></span><span class="transfer-task-meta"></span></div><button class="transfer-task-close" type="button" aria-label="关闭传输进度" title="关闭">×</button></div><div class="transfer-task-progress"><span></span></div>';
    element.querySelector('.transfer-task-close').addEventListener('click', () => removeTransfer(id, element));
    transferPanel.append(element);
  }
  const percent = task.size ? Math.min(100, Math.round((task.transferred || 0) / task.size * 100)) : 0;
  element.classList.toggle('error', Boolean(task.error));
  element.classList.toggle('completed', Boolean(task.done));
  const transferIcon = element.querySelector('.transfer-task-icon');
  transferIcon.textContent = task.error ? '✖' : task.done ? '✔' : task.direction === 'upload' ? '↑' : '↓';
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
  fontWeightInput.value = terminalFontSettings.fontWeight;
  fontWeightValue.textContent = terminalFontSettings.fontWeight;
  letterSpacingInput.value = terminalFontSettings.letterSpacing;
  letterSpacingValue.textContent = `${terminalFontSettings.letterSpacing}px`;
  localStorage.setItem('webssh-font-size', terminalFontSettings.fontSize);
  localStorage.setItem('webssh-font-weight', terminalFontSettings.fontWeight);
  localStorage.setItem('webssh-letter-spacing', terminalFontSettings.letterSpacing);
  sessions.forEach((session) => {
    session.terminal.options.fontSize = terminalFontSettings.fontSize;
    session.terminal.options.fontWeight = terminalFontSettings.fontWeight;
    session.terminal.options.letterSpacing = terminalFontSettings.letterSpacing;
    requestAnimationFrame(() => fitSession(session));
  });
}
function applyTheme(theme) {
  const isLight = theme === 'light';
  document.body.dataset.theme = isLight ? 'light' : 'dark';
  localStorage.setItem('webssh-theme', document.body.dataset.theme);
  themeButton.textContent = isLight ? '☾' : '☀';
  themeButton.title = isLight ? '切换为深色主题' : '切换为浅色主题';
  themeButton.setAttribute('aria-label', themeButton.title);
  sessions.forEach((session) => {
    session.terminal.options.theme = isLight
      ? { background: '#f8fafc', foreground: '#172033', cursor: '#0369a1', selectionBackground: '#bae6fd' }
      : { background: '#0b1220', foreground: '#d8e3f1', cursor: '#7dd3fc', selectionBackground: '#155e75' };
  });
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
  form.elements.passphrase.value = connection.passphrase || '';
  clearProfileSelection();
  clearProfileFeedback();
  openDrawer(session.tab);
}
function prepareNewConnection() {
  editingSessionId = null;
  document.querySelector('#connection-drawer-title').textContent = '新建连接';
  form.reset();
  form.elements.port.value = 22;
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
  form.elements.passphrase.disabled = authMode !== 'key';
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
  if (!session?.connected || !session.health) { connectionHealth.replaceChildren(); return; }
  const { hostname, cpu, memory, latency } = session.health;
  connectionHealth.replaceChildren(
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
  connectButton.disabled = false;
  if (!connected) connectionHealth.replaceChildren();
}
function refreshActiveStatus() {
  const session = activeSession();
  if (!session) return setStatus('未连接');
  if (session.connected) { setStatus('已连接', true); refreshConnectionHealth(); return; }
  if (session.socket.readyState === WebSocket.CONNECTING) return setStatus('连接中…');
  setStatus('未连接');
}
function fitSession(session) {
  if (!session || session.id !== activeSessionId) return;
  session.fitAddon.fit();
  if (session.socket.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type: 'resize', cols: session.terminal.cols, rows: session.terminal.rows }));
}
function activateSession(id) {
  if (!sessions.has(id)) return;
  activeSessionId = id;
  sessions.forEach((session) => {
    const active = session.id === id;
    session.host.classList.toggle('active', active);
    session.tab.classList.toggle('active', active);
  });
  sessions.get(id).tab.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
  refreshActiveStatus();
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
    activeSessionId = remainingIds.at(-1) || null;
    if (activeSessionId) activateSession(activeSessionId);
    else refreshActiveStatus();
  }
  updateEmptyState();
}
function createSession(label = '新会话') {
  const id = crypto.randomUUID();
  const host = document.createElement('div');
  host.className = 'terminal-host';
  const mount = document.createElement('div');
  mount.className = 'terminal-mount';
  host.append(mount);
  const tab = document.createElement('div');
  tab.className = 'session-tab';
  tab.setAttribute('role', 'tab');
  tab.tabIndex = 0;
  tab.title = '单击切换会话，双击编辑连接';
  tab.innerHTML = '<span class="tab-label"></span><button class="tab-close" type="button" aria-label="关闭会话" title="关闭会话">×</button>';
  tab.querySelector('.tab-label').textContent = label;
  sessionTabs.append(tab);
  updateSessionTabsOverflow();
  terminalArea.append(host);
  const isLight = document.body.dataset.theme === 'light';
  const terminal = new Terminal({ cursorBlink: true, fontFamily: 'Cascadia Code, Consolas, monospace', fontSize: terminalFontSettings.fontSize, fontWeight: terminalFontSettings.fontWeight, letterSpacing: terminalFontSettings.letterSpacing, theme: isLight ? { background: '#f8fafc', foreground: '#172033', cursor: '#0369a1', selectionBackground: '#bae6fd' } : { background: '#0b1220', foreground: '#d8e3f1', cursor: '#7dd3fc', selectionBackground: '#155e75' } });
  const fitAddon = new FitAddon();
  terminal.loadAddon(fitAddon);
  terminal.open(mount);
  const session = { id, host, mount, tab, terminal, fitAddon, socket: { readyState: WebSocket.CLOSED }, connected: false, connectedAt: undefined, health: undefined, home: undefined, downloads: new Map(), uploads: new Map(), reconnectTimer: undefined, reconnectAttempts: 0, manuallyClosed: false };
  sessions.set(id, session);
  updateEmptyState();
  terminal.onData((data) => {
    if (session.connected && session.socket.readyState === WebSocket.OPEN) return session.socket.send(JSON.stringify({ type: 'input', data }));
    if ((data === '\r' || data === '\n') && session.connection) reconnectSession(session);
  });
  terminal.onSelectionChange(() => {
    const selectedText = terminal.getSelection();
    if (selectedText) navigator.clipboard?.writeText(selectedText).catch(() => {});
  });
  mount.addEventListener('contextmenu', async (event) => {
    event.preventDefault();
    if (!session.connected || session.socket.readyState !== WebSocket.OPEN) return;
    try {
      const text = await navigator.clipboard.readText();
      if (text) session.socket.send(JSON.stringify({ type: 'input', data: text }));
    } catch {
      terminal.focus();
    }
  });
  tab.addEventListener('click', (event) => {
    if (event.target.closest('.tab-close')) return;
    activateSession(id);
  });
  tab.addEventListener('dblclick', (event) => {
    if (event.target.closest('.tab-close')) return;
    prepareEditSession(id);
  });
  tab.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); activateSession(id); }
  });
  tab.querySelector('.tab-close').addEventListener('click', () => closeSession(id));
  activateSession(id);
  return session;
}
function profileId(profile) { return profile.name; }
function clearProfileSelection() {
  profileList.querySelectorAll('.saved-profile.active').forEach((item) => item.classList.remove('active'));
}
function renderProfiles(selectedId = '') {
  profileList.replaceChildren();
  savedConnectionsSection.hidden = profiles.length === 0;
  profiles.slice().sort((a, b) => a.name.localeCompare(b.name, 'zh-CN')).forEach((profile) => {
      const item = document.createElement('div');
      item.className = 'saved-profile';
      item.classList.toggle('active', profileId(profile) === selectedId);
      const selectButton = document.createElement('button');
      selectButton.type = 'button';
      selectButton.className = 'saved-profile-select';
      selectButton.textContent = profile.name;
      selectButton.title = `使用 ${profile.name} 填充连接信息`;
      selectButton.addEventListener('click', () => { clearProfileSelection(); item.classList.add('active'); fillProfile(profile); clearProfileFeedback(); });
      const deleteButton = document.createElement('button');
      deleteButton.type = 'button';
      deleteButton.className = 'saved-profile-delete';
      deleteButton.textContent = '🗑';
      deleteButton.setAttribute('aria-label', `删除 ${profile.name}`);
      deleteButton.title = `删除 ${profile.name}`;
      deleteButton.addEventListener('click', () => deleteProfile(profile));
    item.append(selectButton, deleteButton);
    profileList.append(item);
  });
}
async function deleteProfile(profile) {
  try {
    const response = await fetch(`/api/profiles/${encodeURIComponent(profile.name)}`, { method: 'DELETE' });
    if (!response.ok) throw new Error();
    profiles = profiles.filter((item) => profileId(item) !== profileId(profile));
    renderProfiles();
    prepareNewConnection();
  } catch { showProfileFeedback('删除连接配置失败。', 'error'); }
}
function fillProfile(profile) {
  for (const field of ['name', 'host', 'port', 'username', 'password', 'privateKey', 'passphrase']) form.elements[field].value = profile[field] || '';
  setAuthMode(profile.authMode);
}
async function loadProfiles() {
  try { const response = await fetch('/api/profiles'); if (!response.ok) throw new Error(); profiles = await response.json(); renderProfiles(); } catch { activeSession()?.terminal.writeln('\r\n\x1b[31m无法加载已保存的连接。\x1b[0m'); }
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
          if (blob.size !== Number(download.size)) throw new Error(`文件大小校验失败：应为 ${formatBytes(download.size)}，实际为 ${formatBytes(blob.size)}。`);
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
    if (message.type === 'upload-directory-valid' || message.type === 'upload-directory-invalid') {
      const validation = uploadDirectoryValidation;
      if (!validation || validation.requestId !== message.requestId || validation.sessionId !== session.id) return;
      uploadDirectoryValidation = undefined;
      setUploadDirectoryChecking(false);
      if (message.type === 'upload-directory-invalid') return setUploadDirectoryError(message.message);
      uploadDirectoryInput.value = message.directory;
      uploadInput.click();
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
      if (message.operation === 'list-files') showDirectoryInput(`${message.message}，请输入要读取的远程目录。`);
      else if (upload) {
        session.uploads.delete(message.id);
        const element = transferPanel.querySelector(`[data-transfer-id="${message.id}"]`);
        removeTransfer(message.id, element);
        setUploadDirectoryError(message.message);
        uploadDirectoryInput.value = upload.directory;
        openUploadPicker(false);
        uploadDirectoryInput.focus();
      } else updateTransfer(message.id || crypto.randomUUID(), { direction: message.direction || 'upload', name: transfers.get(message.id)?.name || '文件传输', error: message.message });
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
  if (session.connected || session.socket.readyState === WebSocket.CONNECTING) return;
  clearTimeout(session.reconnectTimer);
  session.reconnectTimer = undefined;
  session.socket.close?.();
  establishConnection(session, session.connection);
}
async function startUpload(session, id) {
  const upload = session.uploads.get(id);
  const file = upload?.file;
  if (!file || session.socket.readyState !== WebSocket.OPEN) return;
  const chunkSize = 48 * 1024;
  for (let offset = 0; offset < file.size; offset += chunkSize) {
    if (!session.uploads.has(id) || session.socket.readyState !== WebSocket.OPEN) return;
    const bytes = new Uint8Array(await file.slice(offset, offset + chunkSize).arrayBuffer());
    if (!session.uploads.has(id) || session.socket.readyState !== WebSocket.OPEN) return;
    let binary = '';
    bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
    session.socket.send(JSON.stringify({ type: 'upload-chunk', id, data: btoa(binary) }));
  }
  if (!session.uploads.has(id) || session.socket.readyState !== WebSocket.OPEN) return;
  session.uploads.delete(id);
  session.socket.send(JSON.stringify({ type: 'upload-end', id }));
}
function connect(closeAfterConnect = true) {
  if (!form.reportValidity()) return;
  const values = Object.fromEntries(new FormData(form));
  if (authMode === 'password' && !values.password) return showProfileFeedback('请输入密码。', 'error');
  if (authMode === 'key' && !values.privateKey) return showProfileFeedback('请输入私钥内容。', 'error');
  const editingSession = editingSessionId ? sessions.get(editingSessionId) : undefined;
  if (editingSession) {
    const previous = editingSession.connection || {};
    const mode = values.authMode || authMode;
    const next = { ...values, authMode: mode, password: mode === 'password' ? values.password : '', privateKey: mode === 'key' ? values.privateKey : '' };
    const connectionFields = ['host', 'port', 'username', 'authMode', 'password', 'privateKey', 'passphrase'];
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
  const fieldName = input.name === 'passphrase' ? '私钥口令' : '密码';
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
document.addEventListener('keydown', (event) => {
  if (!shutdownConfirmDialog.hidden && event.key === 'Escape') closeShutdownConfirm(false);
});
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
document.addEventListener('keydown', (event) => {
  if (!profileOverwriteDialog.hidden && event.key === 'Escape') closeProfileOverwrite(false);
});
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
  terminalSettingsMenu.hidden = !terminalSettingsMenu.hidden;
  terminalSettingsButton.setAttribute('aria-expanded', String(!terminalSettingsMenu.hidden));
});
fontSizeInput.addEventListener('input', () => { terminalFontSettings.fontSize = Number(fontSizeInput.value); applyTerminalFontSettings(); });
fontWeightInput.addEventListener('input', () => { terminalFontSettings.fontWeight = Number(fontWeightInput.value); applyTerminalFontSettings(); });
letterSpacingInput.addEventListener('input', () => { terminalFontSettings.letterSpacing = Number(letterSpacingInput.value); applyTerminalFontSettings(); });
document.addEventListener('click', (event) => {
  if (!event.target.closest('.terminal-settings')) {
    terminalSettingsMenu.hidden = true;
    terminalSettingsButton.setAttribute('aria-expanded', 'false');
  }
});
function updateSessionTabsOverflow() {
  const container = sessionTabs.closest('.session-tabs');
  sessionTabs.style.removeProperty('width');
  const overflowing = sessionTabs.scrollWidth > sessionTabs.clientWidth + 1;
  container.classList.toggle('is-overflowing', overflowing);
  if (!overflowing) sessionTabs.style.width = `${sessionTabs.scrollWidth}px`;
}
new ResizeObserver(updateSessionTabsOverflow).observe(sessionTabs);
sessionTabs.addEventListener('wheel', (event) => {
  if (!event.deltaY || sessionTabs.scrollWidth <= sessionTabs.clientWidth) return;
  event.preventDefault();
  sessionTabs.scrollLeft += event.deltaY;
}, { passive: false });
newSessionButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(newSessionButton); });
openDrawerButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(openDrawerButton); });
emptyStateConnectButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(emptyStateConnectButton); });
drawerBackdrop.addEventListener('click', closeDrawer);
closeDrawerButton.addEventListener('click', closeDrawer);
document.addEventListener('keydown', (event) => { if (event.key === 'Escape' && drawer.classList.contains('open')) closeDrawer(); });
uploadButton.addEventListener('click', () => {
  if (!activeSession()?.connected) return activeSession()?.terminal.writeln('\r\n\x1b[31m请先连接 SSH 会话。\x1b[0m');
  setUploadDirectoryError();
  openUploadPicker();
});
uploadDirectoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  validateUploadDirectory();
});
uploadDirectoryInput.addEventListener('input', () => {
  uploadDirectoryValidation = undefined;
  setUploadDirectoryChecking(false);
  setUploadDirectoryError();
});
uploadInput.addEventListener('change', () => {
  const file = uploadInput.files[0];
  const session = activeSession();
  const directory = uploadDirectoryInput.value.trim();
  uploadInput.value = '';
  if (!file || !session?.connected || !directory) return;
  closeUploadPicker();
  const id = crypto.randomUUID();
  updateTransfer(id, { direction: 'upload', name: file.name, size: file.size, transferred: 0 });
  session.uploads.set(id, { file, directory });
  session.socket.send(JSON.stringify({ type: 'upload-start', id, name: file.name, size: file.size, directory }));
});
downloadButton.addEventListener('click', () => { const session = activeSession(); if (!session?.connected) return session?.terminal.writeln('\r\n\x1b[31m请先连接 SSH 会话。\x1b[0m'); filePickerDirectoryInput.placeholder = '请输入远程目录，例如 /home/user'; filePickerList.replaceChildren(); openFilePicker(); filePickerDirectoryInput.focus(); });
filePickerDirectoryForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const session = activeSession();
  const directory = filePickerDirectoryInput.value.trim();
  if (!session?.connected || session.socket.readyState !== WebSocket.OPEN) return;
  if (!directory) return showDirectoryInput('请输入要读取的远程目录。');
  filePickerDirectoryInput.placeholder = '正在读取指定目录…';
  filePickerList.replaceChildren();
  session.socket.send(JSON.stringify({ type: 'list-files', directory }));
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
  const values = Object.fromEntries(new FormData(form));
  const profile = { name: values.name.trim(), host: values.host, port: values.port, username: values.username, authMode, password: authMode === 'password' ? values.password : '', privateKey: authMode === 'key' ? values.privateKey : '', passphrase: authMode === 'key' ? values.passphrase : '' };
  const existing = profiles.find((item) => profileId(item) === profileId(profile));
  if (existing && !(await openProfileOverwrite(`主机 ${profile.host}:${profile.port} 已存在同名配置，是否覆盖？`))) return;
  try {
    const response = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
    const result = await response.json();
    if (!response.ok) throw new Error(result.message);
    const index = profiles.findIndex((item) => profileId(item) === profileId(result.profile));
    if (index >= 0) profiles[index] = result.profile; else profiles.push(result.profile);
    renderProfiles(profileId(result.profile));
    fillProfile(result.profile);
  } catch (error) { showProfileFeedback(error.message || '保存连接配置失败。', 'error'); }
});

form.addEventListener('submit', (event) => { event.preventDefault(); connect(); });
new ResizeObserver(() => requestAnimationFrame(() => fitSession(activeSession()))).observe(terminalArea);
applyTheme(localStorage.getItem('webssh-theme') || 'dark');
applyTerminalFontSettings();
updateEmptyState();
loadProfiles();
