/**
 * sessions.js — 会话生命周期管理
 *
 * 负责 SSH 会话的创建/激活/关闭、会话标签拖拽排序、
 * 常驻会话恢复以及状态栏（连接状态、远程健康信息）展示。
 */
import { Terminal } from '../vendor/xterm.js?v=26';
import { FitAddon } from '../vendor/addon-fit.js?v=26';
import { TAB_DRAG_THRESHOLD } from './constants.js?v=26';
import { generateUUID, clearChildren, socketIsOpen, socketIsConnecting } from './utils.js?v=26';
import {
  sessions,
  activeSessionId,
  setActiveSessionId,
  dragState,
  setSuppressNextTabClick,
  terminalFontSettings,
  settingsStore,
  suppressNextTabClick
} from './state.js?v=26';
import {
  sessionTabs,
  terminalArea,
  terminalEmptyState,
  connectionHealth,
  statusElement,
  statusDot,
  filePicker,
  uploadPicker
} from './dom.js?v=26';
import { buildTerminalTheme, updateSettings } from './settings.js?v=26';
import { reconnectSession } from './connections.js?v=26';
import { connectPending, isPinnedSession } from './profiles.js?v=26';
import { prepareEditSession, showTerminalContextMenu } from './ui.js?v=26';
import { closeFilePicker, closeUploadPicker } from './transfers.js?v=26';

/**
 * 获取当前激活的会话对象。
 * @returns {object | undefined} 会话对象
 */
export function activeSession() { return sessions.get(activeSessionId); }

/**
 * 格式化持续时长（毫秒）为中文可读文本。
 * @param {number} milliseconds 毫秒数
 * @returns {string} 格式化结果
 */
export function formatDuration(milliseconds = 0) {
  const seconds = Math.max(0, Math.floor(milliseconds / 1000));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const remainingSeconds = seconds % 60;
  return hours ? `${hours}时${String(minutes).padStart(2, '0')}分` : `${minutes}分${String(remainingSeconds).padStart(2, '0')}秒`;
}

/**
 * 创建一个健康信息条目元素（标签 + 数值）。
 * @param {string} label 标签文本
 * @param {string} value 数值文本
 * @param {string} [tone=''] 强调样式（如 'warning'）
 * @returns {HTMLSpanElement} 条目元素
 */
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

/**
 * 刷新状态栏中的远程健康信息（主机/延迟/CPU/内存/时长）。
 */
export function refreshConnectionHealth() {
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

/**
 * 更新状态栏文本与连接指示灯。
 * @param {string} text 状态文本
 * @param {boolean} [connected=false] 是否已连接
 */
export function setStatus(text, connected = false) {
  statusElement.textContent = text;
  statusDot.classList.toggle('connected', connected);
  if (!connected) clearChildren(connectionHealth);
}

/**
 * 根据当前激活会话刷新状态栏显示。
 */
export function refreshActiveStatus() {
  const session = activeSession();
  if (!session) return setStatus('未连接');
  if (session.connected) { setStatus('已连接', true); refreshConnectionHealth(); return; }
  if (socketIsConnecting(session.socket)) return setStatus('连接中…');
  setStatus('未连接');
}

/**
 * 适配终端尺寸并同步窗口大小到远程会话。
 * @param {object} session 会话对象
 */
export function fitSession(session) {
  if (!session || session.id !== activeSessionId) return;
  session.fitAddon.fit();
  if (socketIsOpen(session.socket)) session.socket.send(JSON.stringify({ type: 'resize', cols: session.terminal.cols, rows: session.terminal.rows }));
}

/**
 * 激活指定会话（切换标签高亮、关闭浮层、适配尺寸）。
 * @param {string} id 会话 id
 */
export function activateSession(id) {
  if (!sessions.has(id)) return;
  if (id !== activeSessionId) {
    if (!filePicker.hidden) closeFilePicker();
    if (!uploadPicker.hidden) closeUploadPicker();
  }
  setActiveSessionId(id);
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

/**
 * 关闭指定会话并清理资源。
 * @param {string} id 会话 id
 */
export function closeSession(id) {
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
    setActiveSessionId(remainingIds[remainingIds.length - 1] || null);
    if (activeSessionId) activateSession(activeSessionId);
    else refreshActiveStatus();
  }
  updateEmptyState();
}

/**
 * 创建新的 SSH 会话（终端 + 标签 + 事件绑定）。
 * @param {string} [label='新会话'] 初始标签文本
 * @returns {object} 会话对象
 */
export function createSession(label = '新会话') {
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
  mount.addEventListener('contextmenu', (event) => {
    event.preventDefault();
    if (!session.connected || !socketIsOpen(session.socket)) return;
    showTerminalContextMenu(event.clientX, event.clientY, session);
  });
  tab.addEventListener('click', (event) => {
    if (suppressNextTabClick) { setSuppressNextTabClick(false); return; }
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

/**
 * 将会话元素移动到另一个会话之前/之后（同步标签与终端 DOM）。
 * @param {string} movedId 被移动的会话 id
 * @param {string} referenceId 参考会话 id
 * @param {boolean} placeBefore 是否放在参考会话之前
 */
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

/**
 * 会话标签按下时的暂存状态（pointerdown 时初始化）。
 * @param {PointerEvent} event 指针事件
 * @param {HTMLElement} tab 标签元素
 * @param {string} id 会话 id
 */
function handleTabPointerDown(event, tab, id) {
  if (event.button !== 0 || event.target.closest('.tab-close')) return;
  event.preventDefault();
  tab.classList.add('tab-pressing');
  dragState.id = id;
  dragState.tab = tab;
  dragState.pointerId = event.pointerId;
  dragState.startX = event.clientX;
  dragState.startY = event.clientY;
  dragState.active = false;
  dragState.ghost = null;
  dragState.offsetX = 0;
  dragState.offsetY = 0;
  dragState.originalTabIndex = -1;
  dragState.lastReferenceId = null;
  dragState.lastPlaceBefore = null;
}

/**
 * 开始标签拖拽（生成幽灵元素并进入拖拽状态）。
 * @param {object} state 拖拽状态
 * @param {PointerEvent} event 指针事件
 */
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

/**
 * 更新拖拽中的幽灵位置与排序（含边缘自动滚动）。
 * @param {PointerEvent} event 指针事件
 */
function updateTabDrag(event) {
  if (!dragState.id || event.pointerId !== dragState.pointerId) return;
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

/**
 * 结束标签拖拽（正常结束或取消）。
 * @param {boolean} cancelled 是否取消（恢复原位置）
 */
function finishTabDrag(cancelled) {
  const state = dragState;
  if (!state.id) return;
  dragState.id = null;
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
    setSuppressNextTabClick(true);
    setTimeout(() => { setSuppressNextTabClick(false); }, 0);
  }
}

/**
 * 持久化常驻会话的顺序到偏好设置。
 */
function persistPinnedOrder() {
  const order = [...sessionTabs.children]
    .map((node) => sessions.get(node.dataset.sessionId))
    .filter((session) => session && isPinnedSession(session))
    .map((session) => (session.connection && session.connection.name) || (session.pendingProfile && session.pendingProfile.name))
    .filter(Boolean);
  updateSettings('pinnedOrder', order);
}

/**
 * 更新空状态提示（无会话时显示引导界面）。
 */
export function updateEmptyState() {
  const hasSessions = sessions.size > 0;
  terminalEmptyState.hidden = hasSessions;
}

/**
 * 更新会话栏溢出状态（不溢出时归零滚动并移除固定宽度）。
 */
export function updateSessionTabsOverflow() {
  const container = sessionTabs.closest('.session-tabs');
  sessionTabs.style.removeProperty('width');
  const overflowing = sessionTabs.scrollWidth > sessionTabs.clientWidth + 1;
  container.classList.toggle('is-overflowing', overflowing);
  if (!overflowing) {
    sessionTabs.style.width = '';
    sessionTabs.scrollLeft = 0;
  }
}

// —— 全局指针事件（标签拖拽）——
window.addEventListener('pointermove', (event) => {
  if (!dragState.id || event.pointerId !== dragState.pointerId) return;
  if (!dragState.active) {
    if (Math.hypot(event.clientX - dragState.startX, event.clientY - dragState.startY) < TAB_DRAG_THRESHOLD) return;
    dragState.active = true;
    startTabDrag(dragState, event);
    return;
  }
  updateTabDrag(event);
});
window.addEventListener('pointerup', (event) => {
  if (!dragState.id || event.pointerId !== dragState.pointerId) return;
  if (dragState.active) finishTabDrag(false);
  else {
    dragState.tab.classList.remove('tab-pressing');
    dragState.id = null;
  }
});
window.addEventListener('pointercancel', (event) => {
  if (dragState.id && event.pointerId === dragState.pointerId) finishTabDrag(true);
});
window.addEventListener('keydown', (event) => {
  if (event.key === 'Escape' && dragState.id) finishTabDrag(true);
});
window.addEventListener('blur', () => finishTabDrag(true));

// —— 会话栏溢出监听与滚轮横向滚动 ——
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(updateSessionTabsOverflow).observe(sessionTabs.closest('.session-tabs'));
sessionTabs.addEventListener('wheel', (event) => {
  if (!event.deltaY || sessionTabs.scrollWidth <= sessionTabs.clientWidth) return;
  event.preventDefault();
  sessionTabs.scrollLeft += event.deltaY;
}, { passive: false });

/**
 * 会话栏恢复顺序时引用 settingsStore 以便读取 pinnedOrder。
 * （此处仅为消除未使用告警；实际读取在 restorePinnedSessions 内）
 */
void settingsStore;
