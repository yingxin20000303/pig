/**
 * state.js — 全局共享状态与运行时上下文
 *
 * 集中管理会话集合、传输任务、连接配置、表单模式等跨模块共享的可变状态，
 * 避免各模块各自持有副本导致状态不同步。
 */
import { DEFAULT_SETTINGS } from './constants.js?v=26';

/** 所有 SSH 会话：id -> 会话对象（含 socket、terminal、tab、connection、uploads/downloads 等） */
export const sessions = new Map();

/** 当前激活会话的 id（无激活时为 null） */
export let activeSessionId = null;

/**
 * 设置当前激活会话 id。
 * @param {string | null} id 会话 id
 */
export function setActiveSessionId(id) { activeSessionId = id; }

/** 所有文件传输任务：id -> 任务对象 */
export const transfers = new Map();

/** 文件选择器的挂起请求：picker -> { requestId, sessionId, directory } */
export const pickerRequests = new Map();

/** 已保存的连接配置数组（从后端加载） */
export let profiles = [];

/**
 * 更新已保存连接配置列表。
 * @param {Array<object>} next 新的连接配置数组
 */
export function setProfiles(next) { profiles = next; }

/** 当前连接表单的认证方式：'password' | 'key' */
export let authMode = 'password';

/**
 * 设置当前表单认证方式。
 * @param {string} mode 'password' 或 'key'
 */
export function setAuthMode(mode) { authMode = mode === 'key' ? 'key' : 'password'; }

/** 正在编辑的会话 id（双击标签编辑时为非空） */
export let editingSessionId = null;

/**
 * 设置正在编辑的会话 id。
 * @param {string | null} id 会话 id 或 null
 */
export function setEditingSessionId(id) { editingSessionId = id; }

/** 偏好设置（含主题/字体等），未加载完成为默认值 */
export const settingsStore = { ...DEFAULT_SETTINGS };

/** 终端字体设置对象（默认值） */
export const terminalFontSettings = {
  fontSize: DEFAULT_SETTINGS.fontSize,
  fontWeight: DEFAULT_SETTINGS.fontWeight,
  letterSpacing: DEFAULT_SETTINGS.letterSpacing,
  fontColor: DEFAULT_SETTINGS.fontColor
};

/** 待确认的关闭服务回调（用于关闭确认对话框） */
export let shutdownConfirmResolver = null;

/**
 * 注册关闭服务确认回调。
 * @param {((confirmed: boolean) => void) | null} resolver 回调函数
 */
export function setShutdownConfirmResolver(resolver) { shutdownConfirmResolver = resolver; }

/** 待确认的覆盖连接配置回调 */
export let profileOverwriteResolver = null;

/**
 * 注册连接配置覆盖确认回调。
 * @param {((confirmed: boolean) => void) | null} resolver 回调函数
 */
export function setProfileOverwriteResolver(resolver) { profileOverwriteResolver = resolver; }

/** 上传冲突关闭定时器句柄 */
export let uploadConflictCloseTimer = null;

/**
 * 设置上传冲突关闭定时器句柄。
 * @param {ReturnType<typeof setTimeout> | null} timer 定时器句柄
 */
export function setUploadConflictCloseTimer(timer) { uploadConflictCloseTimer = timer; }

/** 标签拖拽状态（pointerdown 后的暂存信息） */
export const dragState = {
  id: null,
  pointerId: null,
  startX: 0,
  startY: 0,
  offsetX: 0,
  offsetY: 0,
  width: 0,
  dragging: false
};

/** 是否在标签点击后抑制下一次点击（双击判定辅助） */
export let suppressNextTabClick = false;

/**
 * 设置是否抑制下一次标签点击。
 * @param {boolean} value 是否抑制
 */
export function setSuppressNextTabClick(value) { suppressNextTabClick = value; }

/** 终端右键菜单当前关联的会话对象 */
export let terminalContextSession = null;

/**
 * 设置终端右键菜单关联的会话。
 * @param {object | null} session 会话对象
 */
export function setTerminalContextSession(session) { terminalContextSession = session; }

/** 终端右键菜单提示的自动隐藏定时器 */
export let terminalContextHintTimer = null;

/**
 * 设置终端右键菜单提示定时器句柄。
 * @param {ReturnType<typeof setTimeout> | null} timer 定时器句柄
 */
export function setTerminalContextHintTimer(timer) { terminalContextHintTimer = timer; }
