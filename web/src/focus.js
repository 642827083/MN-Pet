import { FocusTimer } from './focus-timer.js';
import { setupFocusLayout } from './focus-layout.js';
window.__MNP_SETTINGS_READY__ = false;
try {
  const focus = new FocusTimer();
  const resize = setupFocusLayout();
  window.__MNP_FOCUS_DISMISS__ = () => focus.subjects.close(false);
  window.__MNP_PET_REFRESH__ = () => { focus.subjects.close(false); focus.refresh(); resize(); };
  focus.refresh();
  window.__MNP_SETTINGS_READY__ = true;
} catch (error) {
  const status = document.getElementById('focus-status');
  if (status) { status.textContent = '计时面板初始化失败，请关闭后重试。'; status.dataset.error = 'true'; }
  console.log('[MN Pet] 计时面板初始化失败：' + String(error.message || error));
}
