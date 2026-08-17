/**
 * constants.js — 前端常量定义
 *
 * 集中管理终端主题、背景色、拖拽阈值等常量，
 * 便于统一调整 UI 表现参数。
 */

/** 终端主题色（浅色/深色），与 body 的 data-theme 属性对应 */
export const TERMINAL_THEMES = {
  light: { foreground: '#172033', cursor: '#0369a1', selectionBackground: '#bae6fd' },
  dark: { foreground: '#d8e3f1', cursor: '#7dd3fc', selectionBackground: '#155e75' }
};

/** 终端背景色 RGB（用于叠加透明度），与主题对应 */
export const TERMINAL_BG_RGB = { light: '251, 253, 255', dark: '11, 18, 32' };

/** 标签拖拽判定阈值（px）：超过该位移才进入拖拽状态 */
export const TAB_DRAG_THRESHOLD = 5;

/** 默认偏好设置（与后端 DEFAULT_SETTINGS 保持一致） */
export const DEFAULT_SETTINGS = { theme: 'dark', fontSize: 14, fontWeight: 400, letterSpacing: 0, fontColor: null, pinnedOrder: [] };
