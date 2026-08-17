/**
 * app.js — 前端入口
 *
 * 负责应用初始化与全局事件绑定，将各功能模块组合起来：
 * 主题/字体/背景（settings.js）、会话（sessions.js）、
 * 连接配置（profiles.js）、文件传输（transfers.js）、
 * WebSocket 连接（connections.js）与界面交互（ui.js）。
 */
import { socketIsOpen } from './js/utils.js?v=26';
import {
  sessions,
  settingsStore,
  terminalFontSettings
} from './js/state.js?v=26';
import {
  themeButton,
  shutdownButton,
  newSessionButton,
  emptyStateConnectButton,
  drawerBackdrop,
  closeDrawerButton,
  connectionDrawer,
  shutdownConfirmDialog,
  shutdownConfirmBackdrop,
  profileOverwriteDialog,
  profileOverwriteBackdrop,
  uploadConflictDialog,
  uploadPicker,
  filePicker,
  terminalArea,
  terminalSettingsButton,
  terminalSettingsMenu,
  backgroundSettingsButton,
  backgroundSettingsMenu,
  backgroundUploadButton,
  backgroundFileInput,
  backgroundOpacityInput,
  backgroundOpacityValue,
  backgroundRemoveButton,
  saveProfileButton,
  connectionForm,
  fontSizeInput,
  fontWeightInput,
  letterSpacingInput,
  fontColorInput,
  sessionTabs
} from './js/dom.js?v=26';
import {
  loadSettings,
  syncTerminalFontSettingsFromStore,
  applyTheme,
  applyTerminalFontSettings,
  applyBackground,
  loadBackground,
  buildTerminalTheme,
  setBackgroundState,
  backgroundState
} from './js/settings.js?v=26';
import { activeSession, fitSession, updateEmptyState } from './js/sessions.js?v=26';
import { loadProfiles } from './js/profiles.js?v=26';
import { bindTransferEvents, closeUploadPicker, closeFilePicker, resolveUploadConflict } from './js/transfers.js?v=26';
import {
  prepareNewConnection,
  openDrawer,
  closeDrawer,
  connect,
  saveProfile,
  openShutdownConfirm,
  closeShutdownConfirm,
  closeProfileOverwrite,
  setAuthMode,
  showProfileFeedback
} from './js/ui.js?v=26';

// —— 认证方式切换 ——
document.querySelectorAll('.tab').forEach((button) => button.addEventListener('click', () => setAuthMode(button.dataset.mode)));
document.querySelectorAll('[data-password-toggle]').forEach((button) => button.addEventListener('click', () => {
  const input = button.previousElementSibling;
  const visible = input.type === 'password';
  input.type = visible ? 'text' : 'password';
  button.setAttribute('aria-pressed', String(visible));
  button.setAttribute('aria-label', `${visible ? '隐藏' : '显示'}密码`);
  button.title = `${visible ? '隐藏' : '显示'}密码`;
}));

// —— 主题切换 ——
themeButton.addEventListener('click', () => applyTheme(document.body.dataset.theme === 'dark' ? 'light' : 'dark'));

// —— 关闭服务 ——
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

// —— 终端字体设置菜单 ——
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

// —— 背景设置菜单 ——
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
    setBackgroundState(await response.json());
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
  } catch { /* 忽略保存失败 */ }
});
backgroundRemoveButton.addEventListener('click', async () => {
  try {
    const response = await fetch('/api/background', { method: 'DELETE' });
    if (!response.ok) return showProfileFeedback('清除背景失败。', 'error');
    setBackgroundState(await response.json());
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

// —— 新建会话 ——
newSessionButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(newSessionButton); });
emptyStateConnectButton.addEventListener('click', () => { prepareNewConnection(); openDrawer(emptyStateConnectButton); });
drawerBackdrop.addEventListener('click', closeDrawer);
closeDrawerButton.addEventListener('click', closeDrawer);

// —— 全局 Esc 关闭各浮层 ——
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  if (!shutdownConfirmDialog.hidden) return closeShutdownConfirm(false);
  if (!profileOverwriteDialog.hidden) return closeProfileOverwrite(false);
  if (!uploadConflictDialog.hidden) return resolveUploadConflict('cancel');
  if (!uploadPicker.hidden) return closeUploadPicker();
  if (!filePicker.hidden) return closeFilePicker();
  if (connectionDrawer.classList.contains('open')) closeDrawer();
});

// —— 保存连接与表单提交 ——
saveProfileButton.addEventListener('click', () => void saveProfile());
connectionForm.addEventListener('submit', (event) => { event.preventDefault(); connect(); });

// —— 会话尺寸适配 ——
if (typeof ResizeObserver !== 'undefined') new ResizeObserver(() => requestAnimationFrame(() => fitSession(activeSession()))).observe(terminalArea);

// —— 上传/下载控件绑定 ——
bindTransferEvents();

// —— 初始化 ——
applyTheme(settingsStore.theme);
updateEmptyState();
void loadBackground();

void loadSettings().then(() => {
  syncTerminalFontSettingsFromStore();
  applyTheme(settingsStore.theme);
  applyTerminalFontSettings();
  void loadProfiles();
});
