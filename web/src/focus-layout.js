import { MNBridge } from './lib/mnBridge.js';
export function setupFocusLayout() {
  const main = document.getElementById('focus-main'), card = document.getElementById('focus-card'), status = document.getElementById('focus-status');
  let frame = 0, disposed = false, busy = false, last = '';
  const schedule = () => {
    if (disposed || frame || !window.requestAnimationFrame) return;
    frame = requestAnimationFrame(async () => {
      frame = 0;
      if (disposed || busy) return;
      document.body.classList.toggle('focus-has-status', !!status.textContent.trim());
      // 同时检查内容末端与滚动高度，覆盖部分 WebView 的尺寸回调和文字测量差异。
      const rect = main.getBoundingClientRect(), padding = parseFloat(getComputedStyle(main).paddingBottom) || 0;
      const bottom = Math.max(card.getBoundingClientRect().bottom, status.textContent.trim() ? status.getBoundingClientRect().bottom : 0);
      const height = Math.ceil(Math.max(rect.height, main.scrollHeight, bottom - rect.top + padding)) + 6;
      const signature = Math.ceil(rect.width) + ':' + height;
      if (height < 160 || height > 480 || signature === last) return;
      last = signature; busy = true;
      let succeeded = false;
      try {
        const result = await MNBridge.send('resizeFocusPanel', { height });
        if (!disposed && Number.isFinite(result?.maxHeight)) constraints(result.maxHeight);
        succeeded = true;
      }
      catch (_) { last = ''; }
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
    if (!disposed && Number.isFinite(maxHeight)) { constraints(maxHeight); schedule(); }
  };
  if (observer) observer.observe(card);
  if (mutations) mutations.observe(card, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ['hidden', 'class'] });
  main.addEventListener('mnp:focus-status', schedule);
  window.addEventListener('resize', schedule); window.addEventListener('pageshow', schedule);
  window.addEventListener('pagehide', () => { disposed = true; observer?.disconnect(); mutations?.disconnect(); if (frame) cancelAnimationFrame(frame); }, { once: true });
  document.fonts?.ready.then(schedule); schedule();
  return () => { last = ''; schedule(); };
}
