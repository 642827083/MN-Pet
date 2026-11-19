import { MNBridge } from './lib/mnBridge.js';
export function setupFocusLayout() {
  const main = document.getElementById('focus-main'), card = document.getElementById('focus-card'), status = document.getElementById('focus-status');
  let frame = 0, disposed = false, busy = false, last = '', forced = 0;
  // 面板高度变化、页面重新显示或提示文案变化时，作废上一次的测量记忆，允许重新对账。
  const reset = () => { last = ''; forced = 0; };
  const schedule = () => {
    if (disposed || frame || !window.requestAnimationFrame) return;
    frame = requestAnimationFrame(async () => {
      frame = 0;
      if (disposed || busy) return;
      document.body.classList.toggle('focus-has-status', !!status.textContent.trim());
      // 面板可能比内容高，body 又是固定高度，scrollHeight 会被撑成面板高度，
      // 因此以卡片与提示文字的实际末端为准。
      const rect = main.getBoundingClientRect(), padding = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      const bottom = Math.max(card.getBoundingClientRect().bottom, status.textContent.trim() ? status.getBoundingClientRect().bottom : 0);
      const height = Math.ceil(bottom > 0 ? bottom - rect.top + padding : rect.height) + 6;
      if (height < 160 || height > 480) return;
      const signature = Math.ceil(rect.width) + ':' + height;
      // 面板实际高度比内容高出 12 像素以上时，忽略记忆签名强制收紧一次，避免永久停留在偏高的高度。
      const panel = Math.round(window.innerHeight || 0), tooTall = panel - height > 12 && forced !== panel;
      if (signature === last && !tooTall) return;
      last = signature; if (tooTall) forced = panel; busy = true;
      let succeeded = false;
      try {
        const result = await MNBridge.send('resizeFocusPanel', { height });
        if (!disposed && Number.isFinite(result?.maxHeight)) constraints(result.maxHeight);
        succeeded = true;
      }
      catch (_) { reset(); }
      finally { busy = false; if (!disposed && succeeded) schedule(); }
    });
  };
  function constraints(maxHeight) {
    document.body.classList.toggle('focus-window-small', maxHeight < 300);
    document.body.classList.toggle('focus-window-short', maxHeight < 240);
  }
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(schedule) : null;
  const mutations = typeof MutationObserver === 'function' ? new MutationObserver(schedule) : null;
  window.__MNP_FOCUS_CONSTRAINT__ = maxHeight => {
    if (disposed || !Number.isFinite(maxHeight)) return;
    constraints(maxHeight); reset(); schedule();
  };
  if (observer) observer.observe(card);
  if (mutations) mutations.observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  main.addEventListener('mnp:focus-status', schedule);
  window.addEventListener('resize', () => { reset(); schedule(); });
  window.addEventListener('pageshow', () => { reset(); schedule(); });
  window.addEventListener('pagehide', () => { disposed = true; observer?.disconnect(); mutations?.disconnect(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  document.fonts?.ready.then(schedule); schedule();
  return () => { reset(); schedule(); };
}
