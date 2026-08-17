/**
 * settings.js — 偏好设置与外观主题管理
 *
 * 负责偏好设置的加载/保存（主题、字体、背景），
 * 以及主题切换、终端字体应用、背景图片管理等界面逻辑。
 */
import { TERMINAL_THEMES, TERMINAL_BG_RGB } from './constants.js?v=26';
import {
  terminalFontSettings,
  settingsStore,
  sessions
} from './state.js?v=26';
import {
  themeButton,
  fontSizeInput,
  fontSizeValue,
  fontWeightInput,
  fontWeightValue,
  letterSpacingInput,
  letterSpacingValue,
  fontColorInput,
  fontColorValue,
  backgroundOpacityInput,
  backgroundOpacityValue,
  backgroundRemoveButton,
  backgroundStatusDot
} from './dom.js?v=26';

/**
 * 从后端加载偏好设置；失败时使用默认值。
 * @returns {Promise<void>}
 */
export async function loadSettings() {
  try {
    const response = await fetch('/api/settings');
    if (response.ok) {
      Object.assign(settingsStore, await response.json());
    }
  } catch { /* 服务不可用时使用默认值 */ }
}

/**
 * 防抖保存偏好设置到后端（300ms 防抖）。
 */
export function saveSettingsDebounced() {
  clearTimeout(saveSettingsDebounced.timer);
  saveSettingsDebounced.timer = setTimeout(async () => {
    try {
      await fetch('/api/settings', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(settingsStore) });
    } catch { /* 离线时忽略 */ }
  }, 300);
}

/**
 * 更新单项偏好设置并触发防抖保存。
 * @param {string} key 设置键名
 * @param {unknown} value 设置值
 */
export function updateSettings(key, value) {
  settingsStore[key] = value;
  saveSettingsDebounced();
}

/**
 * 将偏好设置同步到终端字体设置对象。
 */
export function syncTerminalFontSettingsFromStore() {
  terminalFontSettings.fontSize = settingsStore.fontSize;
  terminalFontSettings.fontWeight = settingsStore.fontWeight;
  terminalFontSettings.letterSpacing = settingsStore.letterSpacing;
  terminalFontSettings.foreground = settingsStore.fontColor || null;
}

/**
 * 计算当前生效的终端前景色（用户自定义优先，否则用主题默认值）。
 * @returns {string} 前景色
 */
export function effectiveTerminalForeground() {
  return terminalFontSettings.foreground || TERMINAL_THEMES[document.body.dataset.theme === 'light' ? 'light' : 'dark'].foreground;
}

/**
 * 构建当前主题下的终端配色方案。
 * @returns {object} xterm 主题对象
 */
export function buildTerminalTheme() {
  const isLight = document.body.dataset.theme === 'light';
  return {
    background: `rgba(${TERMINAL_BG_RGB[isLight ? 'light' : 'dark']}, ${backgroundState.opacity})`,
    ...TERMINAL_THEMES[isLight ? 'light' : 'dark'],
    foreground: effectiveTerminalForeground()
  };
}

/**
 * 应用终端字体设置到所有会话并持久化。
 */
export function applyTerminalFontSettings() {
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
    requestAnimationFrame(() => {
      // 终端尺寸适配（内联自 sessions.fitSession，避免循环依赖）
      if (!session.mount?.isConnected) return;
      session.fitAddon.fit();
      if (session.socket?.readyState === WebSocket.OPEN) session.socket.send(JSON.stringify({ type: 'resize', cols: session.terminal.cols, rows: session.terminal.rows }));
    });
  });
}

/**
 * 应用主题（浅色/深色）到页面与所有终端。
 * @param {string} theme 'light' 或 'dark'
 */
export function applyTheme(theme) {
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

/** 当前背景状态（url 与透明度），模块内共享 */
export let backgroundState = { url: null, opacity: 0.5 };

/**
 * 更新背景状态对象（替换为服务端返回的最新设置）。
 * @param {{ url: string | null, opacity: number }} next 新的背景设置
 */
export function setBackgroundState(next) { backgroundState = next; }

/**
 * 应用背景图片设置到页面 CSS 变量与所有终端。
 */
export function applyBackground() {
  document.body.style.setProperty('--webssh-bg-url', backgroundState.url ? `url("${backgroundState.url}")` : 'none');
  document.body.style.setProperty('--webssh-bg-opacity', String(backgroundState.opacity));
  const percent = String(Math.round(backgroundState.opacity * 100));
  backgroundOpacityInput.value = percent;
  backgroundOpacityValue.value = `${percent}%`;
  backgroundRemoveButton.disabled = !backgroundState.url;
  backgroundStatusDot.dataset.hasBg = String(Boolean(backgroundState.url));
  sessions.forEach((session) => { session.terminal.options.theme = buildTerminalTheme(); });
}

/**
 * 从后端加载背景设置并应用。
 * @returns {Promise<void>}
 */
export async function loadBackground() {
  try {
    const response = await fetch('/api/background');
    if (!response.ok) return;
    Object.assign(backgroundState, await response.json());
    applyBackground();
  } catch {
    /* 保持默认背景 */
  }
}
