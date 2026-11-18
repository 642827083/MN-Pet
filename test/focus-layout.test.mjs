import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { buildSync } from 'esbuild';

const script = buildSync({ stdin: { contents: "import { setupFocusLayout } from './web/src/focus-layout.js'; import { FocusClient } from './web/src/focus-client.js'; window.startLayout = setupFocusLayout; window.FocusClient = FocusClient;", resolveDir: process.cwd() }, bundle: true, write: false, format: 'iife' }).outputFiles[0].text;

test('没有尺寸观察器时保存提示主动更新高度，文字超出测量框仍留底部空间，清空后收紧并停止重复请求', async () => {
  const dom = new JSDOM('<body><main id="focus-main" style="padding-bottom:18px"><section id="focus-card"><p id="focus-status"></p></section></main></body>', { runScripts: 'outside-only' });
  const w = dom.window, main = w.document.getElementById('focus-main'), card = w.document.getElementById('focus-card'), status = w.document.getElementById('focus-status');
  const frames = new Map(), requests = []; let id = 0;
  w.ResizeObserver = undefined; w.MutationObserver = undefined;
  w.requestAnimationFrame = fn => { frames.set(++id, fn); return id; };
  w.cancelAnimationFrame = key => frames.delete(key);
  w.mn = { call: async (command, payload) => { requests.push({ command, ...payload }); return { maxHeight: 700 }; } };
  // 模拟文字已经变化，但 WebView 的外框尺寸尚未同步更新。
  main.getBoundingClientRect = () => ({ top: 0, width: 296, height: 220 });
  Object.defineProperty(main, 'scrollHeight', { get: () => status.textContent ? 240 : 220 });
  card.getBoundingClientRect = () => ({ bottom: status.textContent ? 245 : 200 });
  status.getBoundingClientRect = () => ({ bottom: status.textContent ? 260 : 0 });
  const settle = async () => {
    for (let i = 0; frames.size && i < 8; i++) {
      const pending = [...frames.values()]; frames.clear(); pending.forEach(fn => fn()); await Promise.resolve(); await Promise.resolve();
    }
    assert.equal(frames.size, 0, '稳定尺寸不能持续请求高度');
  };
  try {
    w.eval(script); w.startLayout(); const client = new w.FocusClient('focus-status');
    await settle(); const initial = requests.at(-1).height;
    client.status('已保存新增的专注时间'); await settle();
    assert.equal(requests.at(-1).command, 'resizeFocusPanel');
    assert.ok(requests.at(-1).height >= 278, '文字末端下方应保留至少 18 像素');
    assert.ok(requests.at(-1).height > initial);
    client.status(''); await settle(); assert.equal(requests.at(-1).height, initial);
    assert.equal(requests.length, 3);
    w.dispatchEvent(new w.Event('pagehide')); client.status('关闭后到达的提示'); await settle();
    assert.equal(requests.length, 3);
  } finally { w.close(); }
});
