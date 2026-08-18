/**
 * ui.js — 界面交互（抽屉、表单、对话框、右键菜单）
 *
 * 负责连接抽屉的开关与表单填充、认证方式切换、各类确认对话框，
 * 以及终端右键粘贴菜单的展示与剪贴板读取逻辑。
 */
import { formDataToObject, socketIsOpen, isSafari } from './utils.js?v=26';
import {
  sessions,
  authMode,
  setAuthMode as setAuthModeState,
  editingSessionId,
  setEditingSessionId,
  profiles,
  setProfiles,
  shutdownConfirmResolver,
  setShutdownConfirmResolver,
  profileOverwriteResolver,
  setProfileOverwriteResolver,
  terminalContextSession,
  setTerminalContextSession,
  terminalContextHintTimer,
  setTerminalContextHintTimer
} from './state.js?v=26';
import {
  drawerBackdrop,
  connectionDrawer,
  connectionDrawerTitle,
  connectionFormDivider,
  closeDrawerButton,
  passwordFields,
  keyFields,
  connectionForm,
  profileFeedback,
  shutdownConfirmBackdrop,
  shutdownConfirmDialog,
  shutdownConfirmCancel,
  shutdownConfirmConfirm,
  profileOverwriteBackdrop,
  profileOverwriteDialog,
  profileOverwriteDescription,
  profileOverwriteCancel,
  profileOverwriteConfirm,
  terminalContextMenu,
  terminalContextPaste,
  terminalContextHint
} from './dom.js?v=26';
import { establishConnection } from './connections.js?v=26';
import { activeSession, createSession, updateSessionTabsOverflow } from './sessions.js?v=26';
import { renderProfiles, persistProfile, fillProfile, clearProfileSelection, profileId } from './profiles.js?v=26';

/** 抽屉触发按钮（用于关闭后焦点还原） */
let drawerTrigger = null;

/**
 * 显示表单反馈消息（成功/错误提示）。
 * @param {string} message 提示文本
 * @param {'success' | 'error'} [type='success'] 提示类型
 */
export function showProfileFeedback(message, type = 'success') {
  profileFeedback.textContent = message;
  profileFeedback.dataset.type = type;
  profileFeedback.hidden = false;
}

/**
 * 清除表单反馈消息。
 */
export function clearProfileFeedback() { profileFeedback.hidden = true; profileFeedback.textContent = ''; }

/**
 * 打开连接抽屉。
 * @param {HTMLElement} [trigger=document.activeElement] 触发按钮
 */
export function openDrawer(trigger = document.activeElement) {
  drawerTrigger = trigger;
  connectionDrawer.classList.add('open');
  connectionDrawer.setAttribute('aria-hidden', 'false');
  drawerBackdrop.hidden = false;
  requestAnimationFrame(() => connectionForm.elements.host.focus());
}

/**
 * 关闭连接抽屉并还原焦点。
 */
export function closeDrawer() {
  connectionDrawer.classList.remove('open');
  connectionDrawer.setAttribute('aria-hidden', 'true');
  drawerBackdrop.hidden = true;
  drawerTrigger?.focus?.();
}

/**
 * 准备编辑会话：填充表单并切换为编辑模式。
 * @param {string} id 会话 id
 */
export function prepareEditSession(id) {
  const session = sessions.get(id);
  if (!session) return;
  setEditingSessionId(id);
  connectionDrawerTitle.textContent = '编辑连接';
  connectionFormDivider.textContent = '连接信息';
  const connection = session.connection || {};
  connectionForm.reset();
  connectionForm.elements.name.value = connection.name || '';
  connectionForm.elements.host.value = connection.host || '';
  connectionForm.elements.port.value = connection.port || 22;
  connectionForm.elements.username.value = connection.username || '';
  setAuthMode(connection.authMode || 'password');
  connectionForm.elements.password.value = connection.password || '';
  connectionForm.elements.privateKey.value = connection.privateKey || '';
  clearProfileSelection();
  clearProfileFeedback();
  openDrawer(session.tab);
}

/**
 * 准备新建连接：清空表单并切换为新建模式。
 */
export function prepareNewConnection() {
  setEditingSessionId(null);
  connectionDrawerTitle.textContent = '新建连接';
  connectionFormDivider.textContent = '新建连接';
  connectionForm.reset();
  connectionForm.elements.port.value = 22;
  connectionForm.elements.username.value = 'root';
  clearProfileSelection();
  clearProfileFeedback();
  setAuthMode('password');
}

/**
 * 切换认证方式（密码/密钥）。
 * @param {string} mode 'password' 或 'key'
 */
export function setAuthMode(mode) {
  const resolved = mode === 'key' ? 'key' : 'password';
  setAuthModeState(resolved);
  document.querySelectorAll('.tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.mode === resolved));
  passwordFields.hidden = resolved !== 'password';
  keyFields.hidden = resolved !== 'key';
  connectionForm.elements.password.disabled = resolved !== 'password';
  connectionForm.elements.privateKey.disabled = resolved !== 'key';
}

/**
 * 提交连接（表单 submit）：编辑模式按需重连，否则新建会话连接。
 * @param {boolean} [closeAfterConnect=true] 连接后是否关闭抽屉
 */
export function connect(closeAfterConnect = true) {
  if (!connectionForm.reportValidity()) return;
  const values = formDataToObject(new FormData(connectionForm));
  if (authMode === 'password' && !values.password) return showProfileFeedback('请输入密码。', 'error');
  if (authMode === 'key' && !values.privateKey) return showProfileFeedback('请输入私钥内容。', 'error');
  const editingSession = editingSessionId ? sessions.get(editingSessionId) : undefined;
  if (editingSession) {
    const previous = editingSession.connection || {};
    const mode = values.authMode || authMode;
    const next = { ...values, authMode: mode, password: mode === 'password' ? values.password : '', privateKey: mode === 'key' ? values.privateKey : '' };
    const connectionFields = ['host', 'port', 'username', 'authMode', 'password', 'privateKey'];
    const changed = connectionFields.some((key) => String(next[key] ?? '') !== String(previous[key] ?? ''));
    setEditingSessionId(null);
    connectionDrawerTitle.textContent = '新建连接';
    connectionFormDivider.textContent = '新建连接';
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

/**
 * 保存连接配置（表单保存按钮）：
 * 编辑模式优先替换原会话对应配置，仅名称变化不重连；连接参数变化则按新配置重连。
 */
export async function saveProfile() {
  if (!connectionForm.reportValidity()) return;
  const values = formDataToObject(new FormData(connectionForm));
  const profile = { name: values.name.trim(), host: values.host, port: values.port, username: values.username, authMode, password: authMode === 'password' ? values.password : '', privateKey: authMode === 'key' ? values.privateKey : '' };
  // 编辑模式：优先定位该会话之前对应的已保存连接，用当前信息替换它而非新增
  const editingSession = editingSessionId ? sessions.get(editingSessionId) : undefined;
  const previousName = editingSession ? (editingSession.connection || {}).name : '';
  const tracked = editingSession && previousName ? profiles.find((item) => profileId(item) === previousName) : undefined;
  const nameConflict = profiles.find((item) => profileId(item) === profileId(profile));
  // 更新原配置时保持其固定状态；覆盖同名配置时保持被覆盖项的固定状态
  const pinnedSource = tracked || nameConflict;
  if (pinnedSource) profile.pinned = pinnedSource.pinned === true;
  // 仅当会覆盖/替换其它已存在配置时才弹窗确认；编辑会话更新自己的原配置不弹窗
  const needConfirm = tracked ? Boolean(nameConflict && nameConflict !== tracked) : Boolean(nameConflict);
  if (needConfirm) {
    const message = tracked
      ? `连接「${profile.name}」已存在，覆盖后将替换原连接「${previousName}」，是否继续？`
      : `主机 ${profile.host}:${profile.port} 已存在同名配置，是否覆盖？`;
    if (!(await openProfileOverwrite(message))) return;
  }
  try {
    if (tracked && previousName !== profile.name) {
      await fetch(`/api/profiles/${encodeURIComponent(previousName)}`, { method: 'DELETE' }).catch(() => {});
      setProfiles(profiles.filter((item) => profileId(item) !== previousName));
    }
    const result = await persistProfile(profile);
    if (!result.ok) {
      showProfileFeedback(result.message || '保存连接配置失败。', 'error');
      return;
    }
    renderProfiles(profileId(result.profile));
    fillProfile(result.profile);
    // 编辑模式下：同步更新会话栏名称；连接参数变化则按新配置重连
    if (editingSession) {
      const previous = editingSession.connection || {};
      const saved = result.profile;
      const connectionFields = ['host', 'port', 'username', 'authMode', 'password', 'privateKey'];
      const connectionChanged = connectionFields.some((key) => String(saved[key] ?? '') !== String(previous[key] ?? ''));
      if (connectionChanged) {
        editingSession.terminal.clear();
        establishConnection(editingSession, saved);
      } else {
        editingSession.connection = { ...saved };
        editingSession.tab.querySelector('.tab-label').textContent = saved.name || saved.host;
        updateSessionTabsOverflow();
      }
    }
  } catch (error) {
    showProfileFeedback(`保存连接配置失败：${error instanceof TypeError ? '无法连接服务器，请确认 WebSSH 服务已启动。' : error.message || '未知错误。'}`, 'error');
  }
}

/**
 * 打开关闭服务确认对话框。
 * @returns {Promise<boolean>} 用户是否确认
 */
export function openShutdownConfirm() {
  shutdownConfirmDialog.hidden = false;
  shutdownConfirmBackdrop.hidden = false;
  shutdownConfirmCancel.focus();
  return new Promise((resolve) => { setShutdownConfirmResolver(resolve); });
}

/**
 * 关闭服务确认对话框并返回结果。
 * @param {boolean} result 确认结果
 */
export function closeShutdownConfirm(result) {
  shutdownConfirmDialog.hidden = true;
  shutdownConfirmBackdrop.hidden = true;
  if (shutdownConfirmResolver) {
    shutdownConfirmResolver(result);
    setShutdownConfirmResolver(null);
  }
}

/**
 * 打开连接配置覆盖确认对话框。
 * @param {string} description 覆盖说明文本
 * @returns {Promise<boolean>} 用户是否确认
 */
export function openProfileOverwrite(description) {
  profileOverwriteDescription.textContent = description;
  profileOverwriteDialog.hidden = false;
  profileOverwriteBackdrop.hidden = false;
  profileOverwriteCancel.focus();
  return new Promise((resolve) => { setProfileOverwriteResolver(resolve); });
}

/**
 * 关闭连接配置覆盖确认对话框并返回结果。
 * @param {boolean} result 确认结果
 */
export function closeProfileOverwrite(result) {
  profileOverwriteDialog.hidden = true;
  profileOverwriteBackdrop.hidden = true;
  if (profileOverwriteResolver) {
    profileOverwriteResolver(result);
    setProfileOverwriteResolver(null);
  }
}

/**
 * 显示终端右键菜单（粘贴）。
 * @param {number} x 鼠标 X 坐标
 * @param {number} y 鼠标 Y 坐标
 * @param {object} session 会话对象
 */
export function showTerminalContextMenu(x, y, session) {
  setTerminalContextSession(session);
  terminalContextMenu.hidden = false;
  const menuRect = terminalContextMenu.getBoundingClientRect();
  const left = Math.max(4, Math.min(x, window.innerWidth - menuRect.width - 4));
  const top = Math.max(4, Math.min(y, window.innerHeight - menuRect.height - 4));
  terminalContextMenu.style.left = `${left}px`;
  terminalContextMenu.style.top = `${top}px`;
  terminalContextPaste.focus();
}

/**
 * 隐藏终端右键菜单。
 */
export function hideTerminalContextMenu() {
  terminalContextMenu.hidden = true;
  setTerminalContextSession(null);
}

/**
 * 显示终端右键菜单提示（Safari 剪贴板受限提示）。
 */
function showTerminalContextHint() {
  terminalContextHint.hidden = false;
  clearTimeout(terminalContextHintTimer);
  setTerminalContextHintTimer(setTimeout(() => { terminalContextHint.hidden = true; }, 4000));
}

/**
 * 查询剪贴板读取权限是否已授予（避免触发系统弹窗）。
 * @returns {Promise<boolean>} 是否已授予
 */
async function clipboardReadGranted() {
  if (!navigator.permissions || typeof navigator.permissions.query !== 'function') return true;
  try {
    const status = await navigator.permissions.query({ name: 'clipboard-read' });
    return status.state === 'granted';
  } catch {
    return true;
  }
}

// —— 事件绑定（抽屉、对话框、右键菜单）——
closeDrawerButton.addEventListener('click', closeDrawer);
drawerBackdrop.addEventListener('click', closeDrawer);
shutdownConfirmCancel.addEventListener('click', () => closeShutdownConfirm(false));
shutdownConfirmConfirm.addEventListener('click', () => closeShutdownConfirm(true));
shutdownConfirmBackdrop.addEventListener('click', () => closeShutdownConfirm(false));
profileOverwriteCancel.addEventListener('click', () => closeProfileOverwrite(false));
profileOverwriteConfirm.addEventListener('click', () => closeProfileOverwrite(true));
profileOverwriteBackdrop.addEventListener('click', () => closeProfileOverwrite(false));
terminalContextPaste.addEventListener('click', async () => {
  const session = terminalContextSession;
  hideTerminalContextMenu();
  if (!session || !session.connected || !socketIsOpen(session.socket)) return;
  // Safari 对 http://127.0.0.1 等非 HTTPS 站点的剪贴板读取授权不持久化，每次调用都会弹系统授权框。
  // 检测到权限未授予时降级为聚焦终端，引导用户按 ⌘V（xterm 原生键盘粘贴走浏览器 paste 事件，无需任何权限）。
  const granted = await clipboardReadGranted();
  if (isSafari() && !granted) {
    showTerminalContextHint();
    session.terminal.focus();
    return;
  }
  // click 事件是有效用户激活：优先 Async Clipboard API（Chrome/Firefox 静默，Safari 已授权时静默）
  if (navigator.clipboard && typeof navigator.clipboard.readText === 'function') {
    try {
      const text = await navigator.clipboard.readText();
      if (text) session.socket.send(JSON.stringify({ type: 'input', data: text }));
      return;
    } catch { /* 权限被拒，尝试回退 */ }
  }
  // 回退：隐藏 textarea + execCommand('paste')（Chrome/Firefox 有效）
  const textarea = document.createElement('textarea');
  textarea.setAttribute('readonly', '');
  textarea.setAttribute('aria-hidden', 'true');
  textarea.style.cssText = 'position:fixed;left:-9999px;top:-9999px;opacity:0;';
  document.body.appendChild(textarea);
  textarea.addEventListener('paste', (e) => {
    const text = e.clipboardData && typeof e.clipboardData.getData === 'function' ? e.clipboardData.getData('text') : '';
    textarea.remove();
    if (text && session.connected && socketIsOpen(session.socket)) session.socket.send(JSON.stringify({ type: 'input', data: text }));
  });
  textarea.focus();
  let execOk = false;
  try { execOk = document.execCommand('paste'); } catch { execOk = false; }
  if (!execOk) textarea.remove();
  const active = activeSession();
  if (active && active.terminal) active.terminal.focus();
});
document.addEventListener('click', (event) => {
  if (!terminalContextMenu.hidden && !terminalContextMenu.contains(event.target)) hideTerminalContextMenu();
});
document.addEventListener('scroll', () => { if (!terminalContextMenu.hidden) hideTerminalContextMenu(); }, true);
document.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && !terminalContextMenu.hidden) hideTerminalContextMenu();
});
window.addEventListener('resize', () => { if (!terminalContextMenu.hidden) hideTerminalContextMenu(); });
