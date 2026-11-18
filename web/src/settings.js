import { PetSettings } from './pet-settings.js';
import { FocusSettings } from './focus-settings.js';
import { AboutSettings } from './about-settings.js';
window.__MNP_SETTINGS_READY__ = false;
try {
  const tabs = ['pet', 'time', 'stats', 'about'], slider = document.querySelector('.settings-navigation-slider');
  let selected, contentAnimation;
  function select(page) {
    if (!tabs.includes(page)) page = 'pet';
    if (selected === page) return true;
    if (contentAnimation) { contentAnimation.cancel(); contentAnimation = null; }
    for (const id of tabs) {
      const active = id === page, tab = document.getElementById('settings-' + id + '-tab');
      tab.setAttribute('aria-selected', String(active)); tab.tabIndex = active ? 0 : -1;
      document.getElementById('settings-' + id + '-page').hidden = !active;
    }
    slider.style.transform = 'translate3d(' + tabs.indexOf(page) * 100 + '%,0,0)';
    document.getElementById('pet-status').hidden = page === 'about';
    if (selected && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      const panel = document.getElementById('settings-' + page + '-page');
      if (typeof panel.animate === 'function') contentAnimation = panel.animate([{ opacity: .4 }, { opacity: 1 }], { duration: 180, easing: 'cubic-bezier(.32,.72,0,1)' });
    }
    selected = page;
    return true;
  }
  window.__MNP_SETTINGS_SHOW_PAGE__ = page => select(page);
  select(window.__MNP_SETTINGS_START_PAGE__);
  for (const id of tabs) {
    const tab = document.getElementById('settings-' + id + '-tab');
    tab.addEventListener('click', () => select(id));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault();
      const index = tabs.indexOf(id), target = tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + (event.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length];
      select(target); document.getElementById('settings-' + target + '-tab').focus();
    });
  }
  const pet = new PetSettings(), focus = new FocusSettings();
  new AboutSettings();
  window.__MNP_PET_REFRESH__ = () => { pet.refresh(); focus.refresh(); };
  focus.refresh();
  window.__MNP_SETTINGS_READY__ = true;
} catch (error) {
  const status = document.getElementById('pet-status');
  if (status) { status.textContent = '设置初始化失败，请点击插件窗口中的重试按钮。'; status.dataset.error = 'true'; }
  console.log('[MN Pet] 设置初始化失败：' + String(error.message || error));
}
