import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets } from './pet-support.mjs';
const { focusHTML, settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(t) {
  const h = pets({ files: new Map([['/addon/web-dist/focus.html', Buffer.from(focusHTML)], ['/addon/web-dist/settings.html', Buffer.from(settingsHTML)]]) }), d = h.open(), docs = [], requests = [];
  d.controller.visible = false; d.addon.panelController = null;
  let now = new Date(2026, 10, 17, 9).getTime();
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  h.context.UIWebView.prototype.loadHTMLStringBaseURL = function (html) {
    const view = this, controller = this.delegate; this.queue = []; this.dom = null;
    const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(window) {
      const append = window.Node.prototype.appendChild;
      // 使用真实 iframe 协议与令牌走完整原生桥接，初始脚本运行期间的回复等 DOM 就绪后再执行。
      window.Node.prototype.appendChild = function (node) {
        const result = append.call(this, node);
        if (node.tagName === 'IFRAME' && node.src.startsWith('mnpet://bridge?')) {
          requests.push(JSON.parse(decodeURIComponent(node.src.split('payload=')[1])));
          h.call(controller, 'webViewShouldStartLoadWithRequestNavigationType', view, { URL: { absoluteString: node.src } });
        }
        return result;
      };
    } });
    docs.push(dom); this.dom = dom;
    for (const pending of this.queue.splice(0)) this.evaluateJavaScript(pending.code, pending.callback);
    h.call(controller, 'webViewDidFinishLoad', this);
  };
  h.context.UIWebView.prototype.evaluateJavaScript = function (code, callback) {
    this.scripts.push(code);
    if (!this.dom) { (this.queue ||= []).push({ code, callback }); return; }
    const value = this.dom.window.eval(code); if (callback) callback(value);
  };
  h.call(d.addon, 'petMenu'); await flush(); await flush();
  t.after(() => { if (d.addon.panelController) h.context.MNPPanel.dispose(d.addon.panelController); h.context.MNPPets.dispose(d.addon); docs.forEach(dom => dom.window.close()); });
  return { h, d, requests, get c() { return d.s.focusController; }, get doc() { return d.s.focusController.settingsView.dom.window.document; }, advance(ms) { now += ms; } };
}

test('桌宠右上角只显示紧凑计时器，使用原生令牌桥接，关闭再开继续计时', async t => {
  const p = await setup(t), { h, d } = p, c = p.c, view = c.settingsView;
  assert.equal(c.activePage, 'focus'); assert.equal(c.titleLabel.text, '番茄钟'); assert.equal(c.resizeHandle.hidden, true);
  assert.equal(c.loadingLabel, undefined); assert.equal(c.retryButton.hidden, true); assert.equal(p.doc.querySelector('#pet-settings'), null);
  assert.equal(p.doc.getElementById('focus-start').disabled, false);
  assert.ok(p.requests.length > 0); assert.ok(p.requests.every(r => r.token === c.settingsToken));
  p.doc.getElementById('focus-start').click(); await flush();
  assert.equal(h.context.MNPFocus.read().state.status, 'running');
  p.advance(1100); d.s.focusTimer.fire(); assert.equal(p.doc.getElementById('focus-time').textContent, '24:59');
  assert.equal(p.doc.querySelector('input,details,#focus-chart'), null);
  assert.equal(c.view.frame.width, 296); assert.equal(c.view.frame.height, 260); assert.equal(c.header.hidden, true); assert.equal(c.settingsView.frame.y, 0);
  h.call(c, 'closePanel'); assert.equal(c.visible, false); assert.equal(d.s.menu, null); assert.ok(d.s.focusTimer);
  p.advance(5000); h.call(d.addon, 'petMenu'); await flush();
  assert.equal(p.c, c); assert.equal(c.settingsView, view); assert.equal(p.doc.getElementById('focus-time').textContent, '24:54');
  assert.equal(h.values.has('cn.marginnote.mn-pet.windowFrame'), false);
  p.doc.getElementById('focus-pause').click(); await flush(); assert.equal(h.context.MNPFocus.read().state.status, 'paused');
});

test('计时面板拒绝错误令牌和桌宠导入命令，后台与销毁后不接受旧页面操作', async t => {
  const p = await setup(t), { h, d } = p, c = p.c;
  const request = (command, token = c.settingsToken) => 'mnpet://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'fixture', command, token, payload: { visible: false } }));
  assert.equal(h.context.MNPWebCommands.local(c, request('focusAction', 'wrong'), c.settingsView), false);
  assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions'), c.settingsView), true);
  assert.equal(d.s.settings.visible, true); assert.match(c.settingsView.scripts.at(-1), /计时面板不支持/);
  h.call(d.addon, 'sceneWillResignActive'); assert.equal(c.visible, false); assert.equal(d.s.menu, null);
  assert.equal(h.context.MNPWebCommands.local(c, request('focusAction'), c.settingsView), false);
  h.call(d.addon, 'sceneDidBecomeActive'); d.s.mountTimer.fire(); h.call(d.addon, 'petMenu'); await flush();
  assert.equal(c.visible, true); h.call(d.addon, 'sceneDidDisconnect'); assert.equal(c.disposed, true); assert.equal(c.settingsView.delegate, null); assert.equal(d.s.focusController, null);
  assert.equal(h.timers.some(timer => timer.valid), false);
});

test('菜单始终留在窗口范围内，计时页保留事件倒计时，专注统计独立为第三页', () => {
  const h = pets(), geometry = h.context.MNPMenu.geometry;
  for (const [width, height] of [[320, 480], [390, 844], [844, 390], [1024, 768], [250, 240]]) {
    for (const [px, py] of [[0, 0], [0, 1], [1, 0], [1, 1], [.5, .5]]) {
      const plan = geometry({ width, height }, { x: px * (width - 112), y: py * (height - 112), width: 112, height: 112 }).menu;
      assert.ok(plan.x >= 8 && plan.y >= 8); assert.ok(plan.x + plan.width <= width - 8); assert.ok(plan.y + plan.height <= height - 8);
    }
  }
  const settings = new JSDOM(settingsHTML), focus = new JSDOM(focusHTML);
  try {
    assert.equal(settings.window.document.querySelector('#focus-card'), null);
    assert.ok(settings.window.document.querySelector('#settings-pet-page #pet-import-heading'));
    assert.ok(settings.window.document.querySelector('#settings-time-page #pet-countdown-name'));
    assert.ok(settings.window.document.querySelector('#settings-time-page #focus-settings'));
    assert.equal(settings.window.document.querySelector('#settings-time-page #focus-chart'), null);
    assert.ok(settings.window.document.querySelector('#settings-stats-page #focus-chart'));
    assert.equal(settings.window.document.querySelectorAll('[role=tab]')[2].id, 'settings-stats-tab');
    assert.equal(settings.window.document.querySelector('#focus-start'), null);
    assert.equal(focus.window.document.querySelector('#focus-settings,#focus-chart,details'), null);
    assert.equal(focus.window.document.querySelector('#pet-countdown-name'), null);
    assert.equal(focus.window.document.querySelector('#pet-image-button'), null);
  } finally { settings.window.close(); focus.window.close(); }
});

test('桥接子页面失败回调只做健康检查，不会触发新请求循环或丢掉草稿', async t => {
  const p = await setup(t), c = p.c, old = c.settingsView, before = p.requests.length;
  for (let i = 0; i < 5; i++) { p.h.call(c, 'webViewDidFailLoadWithError', old, { code: -1009 }); p.h.call(c, 'webViewDidFinishLoad', old); }
  await flush();
  assert.equal(p.requests.length, before); assert.equal(c.settingsView, old); assert.equal(c.retryButton.hidden, true);
});

test('未开始时科目选择在面板内部翻页，安全显示文本，计时开始后科目锁定', async t => {
  const p = await setup(t), { h } = p;
  for (let i = 1; i < 20; i++) h.context.MNPFocus.configure({ action: 'addSubject', name: i === 1 ? '<img>' : '科目' + String(i).padStart(2, '0') });
  h.context.MNPPets.refreshFocus();
  p.doc.getElementById('focus-subject').click();
  assert.equal(p.doc.querySelector('select'), null); assert.equal(p.doc.getElementById('focus-subject-picker').hidden, false);
  assert.equal(p.doc.getElementById('focus-card').getAttribute('aria-hidden'), 'true');
  assert.equal(p.doc.getElementById('focus-start').disabled, true);
  let pages = 1;
  while (!p.doc.getElementById('focus-subject-prev').disabled) { p.doc.getElementById('focus-subject-prev').click(); pages++; }
  assert.ok(pages > 1);
  const item = [...p.doc.querySelectorAll('#focus-subject-list button')].find(button => button.textContent === '<img>');
  assert.ok(item); assert.equal(p.doc.querySelector('img'), null); item.click(); await flush(); await flush();
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, true); assert.equal(p.doc.getElementById('focus-subject-name').textContent, '<img>');
  assert.equal(h.context.MNPFocus.read().current, '<img>');
  p.doc.getElementById('focus-subject').click();
  h.context.MNPFocus.action({ action: 'start' }); h.context.MNPPets.refreshFocus();
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, true);
  assert.equal(p.doc.getElementById('focus-subject').disabled, true);
  assert.equal(h.context.MNPFocus.read().state.subject, '<img>');
  p.doc.getElementById('focus-pause').click(); await flush();
  assert.equal(p.doc.getElementById('focus-subject').disabled, true);
  p.doc.getElementById('focus-reset').click(); p.doc.getElementById('focus-reset').click(); await flush();
  assert.equal(p.doc.getElementById('focus-subject').disabled, false);
  p.doc.getElementById('focus-subject').click(); p.h.call(p.c, 'closePanel');
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, true);
});

test('切换科目保存失败时保留选择页供重试，返回与 Escape 均可关闭', async t => {
  const p = await setup(t), { h } = p;
  h.context.MNPFocus.configure({ action: 'addSubject', name: '英语' }); h.context.MNPPets.refreshFocus();
  p.doc.getElementById('focus-subject').click(); h.failWrite('/documents/MN-Pet/pomodoro.json');
  const select = () => [...p.doc.querySelectorAll('#focus-subject-list button')].find(button => button.textContent === '未分类').click();
  select(); await flush();
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, false); assert.match(p.doc.getElementById('focus-subject-status').textContent, /保存失败/);
  assert.equal(h.context.MNPFocus.read().current, '英语'); h.failWrite(''); select(); await flush();
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, true); assert.equal(h.context.MNPFocus.read().current, '未分类');
  p.doc.getElementById('focus-subject').click(); p.doc.getElementById('focus-subject-picker').dispatchEvent(new p.doc.defaultView.KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  assert.equal(p.doc.getElementById('focus-subject-picker').hidden, true); assert.equal(p.doc.activeElement.id, 'focus-subject');
});

test('仅当前计时页面可按内容调整高度，缩短和提示展开均保持窗口内且不改存档', async t => {
  const p = await setup(t), { h, d } = p, c = p.c, writes = h.writes.length;
  h.context.MNPWebCommands.resizeFocusPanel(c, { height: 248 }); assert.equal(c.view.frame.height, 248);
  h.context.MNPWebCommands.resizeFocusPanel(c, { height: 280 }); assert.equal(c.view.frame.height, 280);
  assert.equal(h.writes.length, writes);
  for (const height of [0, -1, '248', NaN, Infinity, 481]) assert.throws(() => h.context.MNPWebCommands.resizeFocusPanel(c, { height }), /高度/);
  assert.throws(() => h.context.MNPWebCommands.resizeFocusPanel(d.controller, { height: 248 }), /不可调整/);
  d.s.view.superview.frame = { x: 0, y: 0, width: 250, height: 240 }; h.context.MNPPets.layout(d.addon);
  assert.ok(c.view.frame.y >= 8); assert.ok(c.view.frame.y + c.view.frame.height <= 232);
  p.h.call(c, 'closePanel'); assert.throws(() => h.context.MNPWebCommands.resizeFocusPanel(c, { height: 248 }), /不可调整/);
});

test('计时面板没有关闭按钮，外部原生点击层收起面板并移除，继续计时且忽略旧点击', async t => {
  const p = await setup(t), { h, d } = p, c = p.c;
  assert.equal(c.closeButton, undefined); const backdrop = d.s.menuBackdrop, parent = d.s.view.superview;
  assert.equal(backdrop.superview, parent); assert.equal(backdrop.backgroundColor, h.context.UIColor.clearColor());
  assert.equal(backdrop.selector, 'petMenuDismiss:'); assert.equal(backdrop.event, 1 << 6);
  assert.ok(backdrop.layer.zPosition < c.view.layer.zPosition); assert.ok(c.view.layer.zPosition < d.s.menuButton.layer.zPosition);
  assert.ok(parent.subviews.indexOf(backdrop) < parent.subviews.indexOf(c.view));
  p.doc.getElementById('focus-start').click(); await flush();
  assert.equal(c.visible, true); assert.equal(d.s.menuBackdrop, backdrop);
  h.call(d.addon, 'petMenuDismiss', {}); assert.equal(c.visible, true);
  h.call(d.addon, 'petMenuDismiss', backdrop); assert.equal(c.visible, false); assert.equal(d.s.menu, null); assert.equal(d.s.menuBackdrop, null); assert.equal(backdrop.superview, null);
  assert.equal(h.context.MNPFocus.read().state.status, 'running'); p.advance(2000);
  h.call(d.addon, 'petMenu'); await flush(); assert.equal(p.doc.getElementById('focus-time').textContent, '24:58');
  assert.notEqual(d.s.menuBackdrop, backdrop); h.call(d.addon, 'petMenuDismiss', backdrop); assert.equal(c.visible, true);
  parent.frame = { x: 0, y: 0, width: 600, height: 360 }; h.context.MNPPets.layout(d.addon);
  assert.deepEqual({ ...d.s.menuBackdrop.frame }, { x: 0, y: 0, width: 600, height: 360 });
  const rotated = d.s.menuBackdrop; h.call(d.addon, 'sceneWillResignActive'); assert.equal(rotated.superview, null); assert.equal(d.s.menuBackdrop, null);
});

test('小计时器禁用滚动、回弹与缩放，加载后及页面重建后也保持固定比例', async t => {
  const p = await setup(t), c = p.c;
  function fixed(view) {
    const scroll = view.scrollView;
    assert.equal(scroll.scrollEnabled, false); assert.equal(scroll.bounces, false);
    assert.equal(scroll.showsVerticalScrollIndicator, false); assert.equal(scroll.showsHorizontalScrollIndicator, false);
    assert.equal(scroll.minimumZoomScale, 1); assert.equal(scroll.maximumZoomScale, 1); assert.equal(scroll.zoomScale, 1);
    assert.equal(scroll.pinchGestureRecognizer.enabled, false); assert.deepEqual({ ...scroll.contentOffset }, { x: 0, y: 0 });
  }
  fixed(c.settingsView);
  c.settingsView.scrollView.zoomScale = 2; c.settingsView.scrollView.contentOffset = { x: 0, y: 50 };
  p.h.call(c, 'webViewDidFinishLoad', c.settingsView); fixed(c.settingsView);
  const old = c.settingsView; old.dom.window.document.body.replaceChildren();
  p.h.call(p.d.addon, 'petMenu'); p.h.call(p.d.addon, 'petMenu'); await flush(); await flush();
  assert.notEqual(c.settingsView, old); fixed(c.settingsView);
  const viewport = p.doc.querySelector('meta[name=viewport]').content;
  assert.match(viewport, /maximum-scale=1/); assert.match(viewport, /user-scalable=no/);
});

test('计时菜单变空后重新展开可恢复，沿用正在计时的状态，旧页面令牌失效且没有加载横条', async t => {
  const p = await setup(t), c = p.c, old = c.settingsView, token = c.settingsToken;
  p.doc.getElementById('focus-start').click(); await flush();
  old.dom.window.document.body.replaceChildren();
  p.h.call(p.d.addon, 'petMenu'); p.h.call(p.d.addon, 'petMenu'); await flush(); await flush();
  assert.notEqual(c.settingsView, old); assert.notEqual(c.settingsToken, token); assert.equal(c.loadingLabel, undefined);
  assert.equal(p.doc.getElementById('focus-pause').hidden, false); assert.equal(c.retryButton.hidden, true);
  assert.equal(p.h.context.MNPFocus.read().state.status, 'running');
  const request = 'mnpet://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'old', token, command: 'focusAction', payload: { action: 'reset' } }));
  assert.equal(p.h.context.MNPWebCommands.local(c, request, c.settingsView), false);
  p.h.call(c, 'webViewDidFailLoadWithError', old, { code: -1009 }); assert.equal(c.retryButton.hidden, true);
});

test('小计时器设置入口冷启动和重开都直达时间页，状态与统计同步，两个窗口的统计范围互不干扰', async t => {
  const p = await setup(t), { h, d } = p, c = p.c;
  h.context.MNPFocus.configure({ action: 'settings', values: { workMinutes: 1 } }); h.context.MNPPets.refreshFocus();
  p.doc.getElementById('focus-start').click(); await flush();
  p.doc.getElementById('focus-open-settings').click(); await flush(); await flush();
  const main = d.addon.panelController, view = main.settingsView, doc = view.dom.window.document;
  assert.equal(main.visible, true); assert.equal(c.visible, false); assert.equal(d.s.menu, null); assert.equal(d.s.menuBackdrop, null);
  assert.equal(doc.getElementById('settings-time-page').hidden, false); assert.equal(doc.getElementById('settings-pet-page').hidden, true);
  assert.equal(doc.getElementById('focus-workMinutes').value, '1');
  doc.getElementById('focus-range').value = 'month'; doc.getElementById('focus-range').dispatchEvent(new doc.defaultView.Event('change')); await flush();
  assert.equal(doc.getElementById('focus-chart').children.length, 30);
  h.call(d.addon, 'petMenu'); await flush();
  assert.equal(main.focusRange, 'month'); assert.equal(doc.getElementById('focus-chart').children.length, 30);
  p.advance(60000); d.s.focusTimer.fire(); await flush();
  assert.equal(p.doc.getElementById('focus-phase').textContent, '短休息'); assert.match(doc.getElementById('focus-today').textContent, /1 分钟.*1 次/);
  assert.equal(doc.getElementById('focus-chart').children.length, 30);
  doc.getElementById('focus-workMinutes').value = '40'; doc.getElementById('focus-workMinutes').dispatchEvent(new doc.defaultView.Event('input'));
  doc.getElementById('settings-pet-tab').click();
  p.doc.getElementById('focus-open-settings').click(); await flush(); await flush();
  assert.equal(main.settingsView, view); assert.equal(doc.getElementById('settings-time-page').hidden, false); assert.equal(doc.getElementById('focus-workMinutes').value, '40');
  assert.equal(h.context.MNPFocus.read().settings.workMinutes, 1, '打开设置不能自动提交时长草稿');
  h.context.MNPPanel.hide(main); h.call(d.addon, 'petMenu'); await flush();
  p.doc.getElementById('focus-open-settings').click(); await flush(); await flush();
  assert.equal(main.settingsView, view); assert.equal(main.visible, true); assert.equal(doc.getElementById('settings-time-page').hidden, false);
  assert.equal(doc.getElementById('focus-workMinutes').value, '40');
  assert.throws(() => h.context.MNPWebCommands.openFocusSettings(main), /从桌宠计时面板/);
});
