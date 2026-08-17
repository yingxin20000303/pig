/**
 * profiles.js — 已保存连接管理
 *
 * 负责连接配置的加载/渲染/保存/删除、常驻（置顶）会话逻辑，
 * 以及从已保存配置填充连接表单。
 */
import { clearChildren } from './utils.js?v=26';
import {
  sessions,
  activeSessionId,
  setActiveSessionId,
  profiles,
  setProfiles,
  settingsStore
} from './state.js?v=26';
import {
  profileList,
  savedConnectionsSection
} from './dom.js?v=26';
import { updateSettings } from './settings.js?v=26';
import { createSession, activateSession, refreshActiveStatus, updateEmptyState, activeSession } from './sessions.js?v=26';
import { establishConnection } from './connections.js?v=26';
import { prepareNewConnection, setAuthMode, showProfileFeedback, clearProfileFeedback } from './ui.js?v=26';
import { connectionForm } from './dom.js?v=26';

/**
 * 返回连接的唯一标识（当前为名称）。
 * @param {object} profile 连接配置
 * @returns {string} 标识
 */
export function profileId(profile) { return profile.name; }

/**
 * 清除表单中已选中的连接高亮。
 */
export function clearProfileSelection() {
  profileList.querySelectorAll('.saved-profile.active').forEach((item) => item.classList.remove('active'));
}

/**
 * 渲染已保存连接列表。
 * @param {string} [selectedId=''] 需要高亮的连接名称
 */
export function renderProfiles(selectedId = '') {
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

/**
 * 将连接配置保存到后端并更新本地列表。
 * @param {object} profile 连接配置
 * @returns {Promise<{ profile?: object, message?: string, ok: boolean }>} 保存结果
 */
export async function persistProfile(profile) {
  const response = await fetch('/api/profiles', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(profile) });
  const result = await response.json();
  if (!response.ok) return { ...result, ok: false };
  const index = profiles.findIndex((item) => profileId(item) === profileId(result.profile));
  if (index >= 0) profiles[index] = result.profile; else profiles.push(result.profile);
  return { ...result, ok: true };
}

/**
 * 切换连接的常驻状态。
 * @param {object} profile 连接配置
 */
export async function togglePinned(profile) {
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

/**
 * 为常驻连接创建并挂起一个会话（不自动连接，等待用户点击）。
 * @param {object} profile 连接配置
 */
export function showPinnedSession(profile) {
  const existing = [...sessions.values()].find((session) => (session.connection && session.connection.name === profile.name) || (session.pendingProfile && session.pendingProfile.name === profile.name));
  if (existing) return;
  const previousId = activeSessionId;
  const session = createSession(profile.name || profile.host);
  session.pendingProfile = profile;
  if (previousId && sessions.has(previousId)) activateSession(previousId);
  else {
    setActiveSessionId(null);
    sessions.forEach((item) => {
      item.host.classList.remove('active');
      item.tab.classList.remove('active');
    });
    refreshActiveStatus();
    updateEmptyState();
  }
}

/**
 * 判断会话是否为常驻会话。
 * @param {object} session 会话对象
 * @returns {boolean} 是否常驻
 */
export function isPinnedSession(session) {
  return Boolean((session.connection && session.connection.pinned === true) || (session.pendingProfile && session.pendingProfile.pinned === true));
}

/**
 * 连接挂起的会话（点击常驻标签时建立连接）。
 * @param {object} session 会话对象
 */
export function connectPending(session) {
  if (!session.pendingProfile || session.connection) return;
  const profile = session.pendingProfile;
  session.pendingProfile = undefined;
  establishConnection(session, profile);
}

/**
 * 持久化常驻会话的顺序到偏好设置。
 */
export function persistPinnedOrder() {
  const order = [...document.querySelectorAll('#session-tabs .session-tab')]
    .map((node) => sessions.get(node.dataset.sessionId))
    .filter((session) => session && isPinnedSession(session))
    .map((session) => (session.connection && session.connection.name) || (session.pendingProfile && session.pendingProfile.name))
    .filter(Boolean);
  updateSettings('pinnedOrder', order);
}

/**
 * 恢复常驻会话（按保存顺序创建挂起会话）。
 */
export function restorePinnedSessions() {
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
  setActiveSessionId(null);
  sessions.forEach((session) => {
    session.host.classList.remove('active');
    session.tab.classList.remove('active');
  });
  document.querySelector('#terminal-empty-state').hidden = false;
  refreshActiveStatus();
}

/**
 * 删除连接配置。
 * @param {object} profile 连接配置
 */
export async function deleteProfile(profile) {
  try {
    const response = await fetch(`/api/profiles/${encodeURIComponent(profile.name)}`, { method: 'DELETE' });
    if (!response.ok) return showProfileFeedback('删除连接配置失败。', 'error');
    setProfiles(profiles.filter((item) => profileId(item) !== profileId(profile)));
    renderProfiles();
    prepareNewConnection();
  } catch { showProfileFeedback('删除连接配置失败。', 'error'); }
}

/**
 * 将连接配置填充到表单。
 * @param {object} profile 连接配置
 */
export function fillProfile(profile) {
  for (const field of ['name', 'host', 'port', 'username', 'password', 'privateKey']) connectionForm.elements[field].value = profile[field] || '';
  setAuthMode(profile.authMode);
}

/**
 * 从后端加载连接配置并渲染，同时恢复常驻会话。
 * @returns {Promise<void>}
 */
export async function loadProfiles() {
  try {
    const response = await fetch('/api/profiles');
    if (!response.ok) return activeSession()?.terminal.writeln('\r\n\x1b[31m无法加载已保存的连接。\x1b[0m');
    setProfiles(await response.json());
    renderProfiles();
    restorePinnedSessions();
  } catch { activeSession()?.terminal.writeln('\r\n\x1b[31m无法加载已保存的连接。\x1b[0m'); }
}
