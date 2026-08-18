/**
 * dom.js — DOM 元素引用
 *
 * 集中声明页面中所有需要操作的 DOM 元素，供各功能模块统一引用，
 * 避免散落的 querySelector 导致维护困难。
 */

/** 会话抽屉（新建/编辑连接表单）相关 */
export const drawerBackdrop = document.querySelector('#drawer-backdrop');
export const connectionDrawer = document.querySelector('#connection-drawer');
export const connectionDrawerTitle = document.querySelector('#connection-drawer-title');
export const closeDrawerButton = document.querySelector('#close-drawer-button');
export const connectionFormDivider = document.querySelector('#connection-form-divider');
export const savedConnectionsSection = document.querySelector('#saved-connections-section');
export const profileList = document.querySelector('#profile-list');
export const profileFeedback = document.querySelector('#profile-feedback');
export const connectionForm = document.querySelector('#connection-form');
export const saveProfileButton = document.querySelector('#save-profile-button');
export const passwordFields = document.querySelector('#password-fields');
export const keyFields = document.querySelector('#key-fields');

/** 文件选择器（下载/上传）相关 */
export const filePickerBackdrop = document.querySelector('#file-picker-backdrop');
export const filePicker = document.querySelector('#file-picker');
export const closeFilePickerButton = document.querySelector('#close-file-picker-button');
export const filePickerDirectoryForm = document.querySelector('#file-picker-directory-form');
export const filePickerDirectoryInput = document.querySelector('#file-picker-directory-input');
export const filePickerParentButton = document.querySelector('#file-picker-parent-button');
export const filePickerList = document.querySelector('#file-picker-list');
export const filePickerSelectionCount = document.querySelector('#file-picker-selection-count');
export const downloadSelectedButton = document.querySelector('#download-selected-button');

export const uploadPickerBackdrop = document.querySelector('#upload-picker-backdrop');
export const uploadPicker = document.querySelector('#upload-picker');
export const closeUploadPickerButton = document.querySelector('#close-upload-picker-button');
export const uploadDirectoryForm = document.querySelector('#upload-directory-form');
export const uploadDirectoryInput = document.querySelector('#upload-directory-input');
export const uploadPickerParentButton = document.querySelector('#upload-picker-parent-button');
export const uploadDirectoryError = document.querySelector('#upload-directory-error');
export const uploadPickerList = document.querySelector('#upload-picker-list');
export const uploadSelectedButton = document.querySelector('#upload-selected-button');

/** 上传冲突对话框 */
export const uploadConflictBackdrop = document.querySelector('#upload-conflict-backdrop');
export const uploadConflictDialog = document.querySelector('#upload-conflict-dialog');
export const uploadConflictMessage = document.querySelector('#upload-conflict-message');
export const uploadConflictCancelButton = document.querySelector('#upload-conflict-cancel');
export const uploadConflictRenameButton = document.querySelector('#upload-conflict-rename');
export const uploadConflictOverwriteButton = document.querySelector('#upload-conflict-overwrite');

/** 关闭服务确认对话框 */
export const shutdownConfirmBackdrop = document.querySelector('#shutdown-confirm-backdrop');
export const shutdownConfirmDialog = document.querySelector('#shutdown-confirm-dialog');
export const shutdownConfirmCancel = document.querySelector('#shutdown-confirm-cancel');
export const shutdownConfirmConfirm = document.querySelector('#shutdown-confirm-confirm');

/** 连接配置覆盖确认对话框 */
export const profileOverwriteBackdrop = document.querySelector('#profile-overwrite-backdrop');
export const profileOverwriteDialog = document.querySelector('#profile-overwrite-dialog');
export const profileOverwriteDescription = document.querySelector('#profile-overwrite-description');
export const profileOverwriteCancel = document.querySelector('#profile-overwrite-cancel');
export const profileOverwriteConfirm = document.querySelector('#profile-overwrite-confirm');

/** 终端与状态栏 */
export const terminalArea = document.querySelector('#terminal');
export const terminalEmptyState = document.querySelector('#terminal-empty-state');
export const emptyStateConnectButton = document.querySelector('#empty-state-connect-button');
export const statusDot = document.querySelector('#status-dot');
export const statusElement = document.querySelector('#status');
export const connectionHealth = document.querySelector('#connection-health');
export const sessionTabs = document.querySelector('#session-tabs');
export const newSessionButton = document.querySelector('#new-session-button');
export const transferPanel = document.querySelector('#transfer-panel');
export const transferHistoryButton = document.querySelector('#transfer-history-button');
export const transferHistoryBackdrop = document.querySelector('#transfer-history-backdrop');
export const transferHistoryDialog = document.querySelector('#transfer-history-dialog');
export const transferHistoryList = document.querySelector('#transfer-history-list');
export const closeTransferHistoryButton = document.querySelector('#close-transfer-history-button');
export const transferHistorySearch = document.querySelector('#transfer-history-search');
export const clearTransferHistoryButton = document.querySelector('#clear-transfer-history-button');

/** 工具栏按钮与输入 */
export const themeButton = document.querySelector('#theme-button');
export const uploadButton = document.querySelector('#upload-button');
export const downloadButton = document.querySelector('#download-button');
export const shutdownButton = document.querySelector('#shutdown-button');
export const uploadInput = document.querySelector('#upload-input');

/** 终端字体设置菜单 */
export const terminalSettingsButton = document.querySelector('#terminal-settings-button');
export const terminalSettingsMenu = document.querySelector('#terminal-settings-menu');
export const fontSizeInput = document.querySelector('#font-size-input');
export const fontSizeValue = document.querySelector('#font-size-value');
export const fontWeightInput = document.querySelector('#font-weight-input');
export const fontWeightValue = document.querySelector('#font-weight-value');
export const letterSpacingInput = document.querySelector('#letter-spacing-input');
export const letterSpacingValue = document.querySelector('#letter-spacing-value');
export const fontColorInput = document.querySelector('#font-color-input');
export const fontColorValue = document.querySelector('#font-color-value');

/** 背景设置菜单 */
export const backgroundSettingsButton = document.querySelector('#background-settings-button');
export const backgroundSettingsMenu = document.querySelector('#background-settings-menu');
export const backgroundStatusDot = document.querySelector('#background-status-dot');
export const backgroundUploadButton = document.querySelector('#background-upload-button');
export const backgroundFileInput = document.querySelector('#background-file-input');
export const backgroundOpacityInput = document.querySelector('#background-opacity-input');
export const backgroundOpacityValue = document.querySelector('#background-opacity-value');
export const backgroundRemoveButton = document.querySelector('#background-remove-button');

/** 终端右键菜单（粘贴） */
export const terminalContextMenu = document.querySelector('#terminal-context-menu');
export const terminalContextPaste = document.querySelector('#terminal-context-paste');
export const terminalContextHint = document.querySelector('#terminal-context-hint');
