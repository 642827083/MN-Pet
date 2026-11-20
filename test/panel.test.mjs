import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { settingsHTML } = await resources();
const flush = () => new Promise(resolve => setImmediate(resolve));
async function setup(t, beforeLoad, lazyView = false) {
  const h = pets({ files: new Map([['/addon/web-dist/settings.html', Buffer.from(settingsHTML)]]) }), d = h.open(), ctx = h.context, docs = []; let definition, controller;
  ctx.NSString = { stringWithContentsOfData: data => data.buffer.toString('utf8') };
  ctx.UIWebView.prototype.loadHTMLStringBaseURL = function (html) {
    if (beforeLoad) beforeLoad(ctx, controller, this);
    const dom = new JSDOM(html, { runScripts: 'dangerously', beforeParse(window) { window.scrollTo = () => {}; window.mn = { call: async (name, p) => plain(ctx.MNPPets.command(controller, name, p)) }; } });
    docs.push(dom); this.dom = dom;
    const view = this;
    queueMicrotask(() => {
      if (view.delegate !== controller) return;
      const previous = ctx.self; ctx.self = controller;
      try { definition.webViewDidFinishLoad(view); } finally { ctx.self = previous; }
    });
  };
  ctx.UIWebView.prototype.evaluateJavaScript = function (code, callback) { this.scripts.push(code); if (callback) callback(this.dom ? this.dom.window.eval(code) : true); };
  ctx.JSB.defineClass = (_name, methods) => { definition = methods; return { new: () => {
    const instance = Object.assign({}, methods);
    if (!lazyView) instance.view = new ctx.UIView({ x: 0, y: 0, width: 640, height: 600 });
    else {
      let view;
      Object.defineProperty(instance, 'view', { get() {
        if (!view) {
          view = new ctx.UIView({ x: 0, y: 0, width: 640, height: 600 });
          const previous = ctx.self; ctx.self = instance; try { methods.viewDidLoad(); } finally { ctx.self = previous; }
        }
        return view;
      } });
    }
    return instance;
  } }; };
  for (const name of ['MNPWindow','MNPPanel']) vm.runInContext(readFileSync('src/' + name + '.js', 'utf8'), ctx);
  controller = ctx.MNPPanel.create(d.addon); d.addon.panelController = controller; ctx.MNPPanel.show(controller); await flush();
  t.after(() => { ctx.MNPPanel.dispose(controller); ctx.MNPPets.dispose(d.addon); docs.forEach(dom => dom.window.close()); });
  return { h, d, ctx, c: controller, get doc() { return controller.settingsView.dom.window.document; }, call(method, ...args) { const old = ctx.self; ctx.self = controller; try { return definition[method](...args); } finally { ctx.self = old; } } };
}

test('设置窗口只创建一个设置网页，名称正确，可修改桌宠、关闭并重开且保留编辑内容', async t => {
  const p = await setup(t);
  assert.equal(p.c.titleLabel.text, 'MN Pet'); assert.equal(p.c.visible, true); assert.equal(p.c.activePage, 'settings');
  assert.equal(p.doc.getElementById('pet-size').disabled, false);
  p.doc.getElementById('pet-size').value = 93; p.doc.getElementById('pet-size').dispatchEvent(new p.doc.defaultView.Event('change')); await flush();
  assert.equal(p.d.s.settings.size, 93);
  p.doc.getElementById('pet-countdown-name').value = '未保存草稿'; p.doc.getElementById('pet-countdown-name').dispatchEvent(new p.doc.defaultView.Event('input'));
  const view = p.c.settingsView; p.call('closePanel'); assert.equal(p.c.visible, false); assert.equal(p.c.view.superview, null);
  p.ctx.MNPPanel.show(p.c); await flush(); assert.equal(p.c.settingsView, view); assert.equal(p.doc.getElementById('pet-countdown-name').value, '未保存草稿');
  assert.equal(p.c.webView, undefined); assert.equal(p.c.gptView, undefined);
});

test('设置窗口可以移动和缩放，持久化使用自己的标识，外部网页请求被拒绝', async t => {
  const p = await setup(t), before = { ...p.c.view.frame };
  const gesture = { state: 3, translationInView: () => ({ x: 34, y: 20 }), setTranslationInView() {} };
  p.call('movePanel', gesture); assert.equal(p.c.view.frame.x, before.x + 34); assert.equal(p.c.view.frame.y, before.y + 20);
  const moved = { ...p.c.view.frame }; p.call('resizePanel', gesture); assert.ok(p.c.view.frame.width >= moved.width); assert.equal(p.c.view.frame.x, moved.x);
  assert.ok(p.h.values.has('cn.marginnote.mn-pet.windowFrame')); assert.equal(p.h.values.has('cn.marginnote.ai-bridge.windowFrame'), false);
  assert.equal(p.call('webViewShouldStartLoadWithRequestNavigationType', p.c.settingsView, { URL: { absoluteString: 'https://chatgpt.com/' } }), false);
  const oldView = p.c.settingsView;
  oldView.dom.window.document.body.replaceChildren();
  p.call('webViewDidFailLoadWithError', oldView, { code: -1009 }); await flush();
  assert.notEqual(p.c.settingsView, oldView); assert.equal(p.c.retryButton.hidden, true);
  p.call('retrySettings'); assert.equal(p.c.retryButton.hidden, true); await flush();
});

test('从唯一 HTML 加载中文设置和独立令牌，空白页可重建，资源缺失时可恢复重试', async t => {
  const p = await setup(t), file = '/addon/web-dist/settings.html';
  assert.equal(p.ctx.MNPResources, undefined);
  assert.equal(p.doc.title, 'MN Pet 设置');
  assert.equal(p.doc.defaultView.__MNP_SETTINGS_TOKEN__, p.c.settingsToken);
  const oldToken = p.c.settingsToken, oldDOM = p.c.settingsView.dom;
  oldDOM.window.document.body.replaceChildren();
  p.ctx.MNPPanel.show(p.c); await flush();
  assert.notEqual(p.c.settingsToken, oldToken); assert.notEqual(p.c.settingsView.dom, oldDOM);
  assert.ok(p.doc.getElementById('pet-settings')); assert.equal(p.doc.getElementById('pet-size').disabled, false);
  const bytes = p.h.files.get(file); p.h.files.delete(file);
  p.call('retrySettings'); assert.equal(p.c.retryButton.hidden, false); assert.match(p.h.hud.at(-1), /设置页面资源无法读取/);
  p.h.files.set(file, bytes); p.call('retrySettings'); await flush();
  assert.equal(p.c.retryButton.hidden, true); assert.ok(p.doc.getElementById('pet-settings'));
});

test('页面偶发变空后重开，原生健康检查返回 0 时也能恢复设置内容', async t => {
  const p = await setup(t), old = p.c.settingsView;
  old.dom.window.document.body.replaceChildren();
  const evaluate = old.evaluateJavaScript;
  old.evaluateJavaScript = function (code, callback) {
    evaluate.call(this, code, result => callback?.(result === false || result === '' ? 0 : result));
  };
  p.ctx.MNPPanel.show(p.c); await flush(); await flush();
  assert.ok(p.doc.getElementById('pet-settings'), '重新打开后不应继续白屏');
});

test('网页失去响应时自动重建一次，旧网页的晚到回调不影响新页面', async t => {
  const p = await setup(t), old = p.c.settingsView;
  old.evaluateJavaScript = function () {};
  p.ctx.MNPPanel.show(p.c);
  // 触发原生脚本响应超时，模拟网页渲染进程不再回调。
  p.h.timers.filter(timer => timer.valid && timer.seconds === 3).forEach(timer => timer.fire());
  await flush(); await flush();
  assert.notEqual(p.c.settingsView, old, '失去响应后必须换一个网页视图');
  assert.ok(p.doc.getElementById('pet-settings')); assert.equal(old.delegate, null); assert.equal(old.superview, null);
  p.call('webViewDidFailLoadWithError', old, { code: -1009 });
  assert.equal(p.c.retryButton.hidden, true);
});

test('页面元素存在但初始化未完成时能恢复，关闭重开保留健康网页，未完成的检查不在关闭后重建', async t => {
  const p = await setup(t), oldDOM = p.c.settingsView.dom;
  oldDOM.window.__MNP_SETTINGS_READY__ = false;
  p.ctx.MNPPanel.show(p.c); await flush(); await flush();
  assert.notEqual(p.c.settingsView.dom, oldDOM, '只检查元素存在会漏掉初始化失败');
  const old = p.c.settingsView; old.evaluateJavaScript = function () {};
  p.ctx.MNPPanel.show(p.c); p.call('closePanel');
  p.h.timers.filter(timer => timer.valid && timer.seconds === 3).forEach(timer => timer.fire()); await flush();
  assert.equal(p.c.settingsView, old); assert.equal(p.c.visible, false);
});

test('加载一直没有完成时会结束等待并显示可点击重试；销毁释放加载计时器', async t => {
  const p = await setup(t);
  const load = p.ctx.UIWebView.prototype.loadHTMLStringBaseURL;
  p.ctx.UIWebView.prototype.loadHTMLStringBaseURL = function () {};
  t.after(() => { p.ctx.UIWebView.prototype.loadHTMLStringBaseURL = load; });
  p.call('retrySettings');
  assert.ok(p.c.settingsLoadTimer, '没有完成回调时必须有加载超时保护');
  p.c.settingsLoadTimer.fire(); await flush(); await flush();
  if (p.c.settingsLoadTimer) p.c.settingsLoadTimer.fire(); await flush(); await flush();
  assert.equal(p.c.retryButton.hidden, false);
  assert.match(p.c.retryButton.title, /重试/);
  p.ctx.MNPPanel.dispose(p.c); assert.ok(!p.c.settingsLoadTimer);
});

test('完成回调缺失但网页已经就绪时不重建，首次快速加载可以立即连接原生桥接', async t => {
  const accepted = [];
  const p = await setup(t, (ctx, controller, view) => {
    const request = 'mnpet://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'early', command: 'getPetState', token: controller.settingsToken, payload: {} }));
    accepted.push(ctx.MNPWebCommands.local(controller, request, view));
  });
  assert.deepEqual(accepted, [true]);
  const load = p.ctx.UIWebView.prototype.loadHTMLStringBaseURL;
  p.ctx.UIWebView.prototype.loadHTMLStringBaseURL = function (html) {
    load.call(this, html); this.delegate = null;
  };
  p.call('retrySettings'); await flush();
  const healthy = p.c.settingsView; healthy.delegate = p.c;
  assert.ok(p.c.settingsLoadTimer); p.c.settingsLoadTimer.fire(); await flush();
  assert.equal(p.c.settingsView, healthy); assert.equal(p.c.loadingLabel, undefined); assert.equal(p.c.retryButton.hidden, true);
  p.ctx.UIWebView.prototype.loadHTMLStringBaseURL = load;
});

test('子页面加载失败不会重建健康的设置页，正在输入的草稿得以保留', async t => {
  const p = await setup(t), old = p.c.settingsView;
  p.doc.getElementById('pet-countdown-name').value = '正在输入';
  p.doc.getElementById('pet-countdown-name').dispatchEvent(new p.doc.defaultView.Event('input'));
  p.call('webViewDidFailLoadWithError', old, { code: -1009 }); await flush();
  assert.equal(p.c.settingsView, old); assert.equal(p.c.retryButton.hidden, true); assert.equal(p.doc.getElementById('pet-countdown-name').value, '正在输入');
});

test('桌宠与倒计时独立切换，键盘可导航，关闭重开保留当前页与草稿，正常与异常均无加载横条', async t => {
  const p = await setup(t), pet = p.doc.getElementById('settings-pet-page'), countdown = p.doc.getElementById('settings-time-page');
  assert.equal(pet.hidden, false); assert.equal(countdown.hidden, true); assert.equal(p.c.loadingLabel, undefined);
  assert.equal(p.doc.querySelector('#focus-card'), null);
  p.doc.getElementById('settings-time-tab').click(); assert.equal(pet.hidden, true); assert.equal(countdown.hidden, false);
  p.doc.getElementById('pet-countdown-name').value = '草稿'; p.doc.getElementById('pet-countdown-name').dispatchEvent(new p.doc.defaultView.Event('input'));
  p.call('closePanel'); p.ctx.MNPPanel.show(p.c); await flush(); assert.equal(countdown.hidden, false); assert.equal(p.doc.getElementById('pet-countdown-name').value, '草稿');
  p.doc.getElementById('settings-time-tab').dispatchEvent(new p.doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
  assert.equal(p.doc.activeElement.id, 'settings-pet-tab'); assert.equal(pet.hidden, false); assert.equal(countdown.hidden, true);
  p.doc.getElementById('settings-pet-tab').dispatchEvent(new p.doc.defaultView.KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  assert.equal(p.doc.activeElement.id, 'settings-about-tab'); assert.equal(p.doc.getElementById('settings-about-page').hidden, false);
  const about = p.doc.getElementById('settings-about-page').textContent, manifest = JSON.parse(readFileSync('src/mnaddon.json'));
  assert.ok(about.includes(manifest.title)); assert.ok(about.includes(manifest.version)); assert.ok(about.includes('乔木Joe'));
  assert.ok(about.includes('插件说明与反馈')); assert.ok(about.includes('制作桌宠'));
  assert.equal(p.doc.querySelectorAll('#settings-about-page [data-about-open]').length, 2);
  assert.equal(p.doc.querySelector('.settings-navigation-slider').style.transform, 'translate3d(300%,0,0)');
  p.doc.getElementById('settings-about-tab').dispatchEvent(new p.doc.defaultView.KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
  assert.equal(p.doc.activeElement.id, 'settings-pet-tab');
  assert.equal(p.doc.querySelector('#settings-time-tab').textContent, '计时');
  p.doc.getElementById('settings-stats-tab').click();
  assert.equal(p.doc.getElementById('settings-stats-page').hidden, false); assert.equal(countdown.hidden, true);
  assert.ok(p.doc.querySelector('#settings-stats-page #focus-chart')); assert.equal(p.doc.querySelector('#settings-time-page #focus-chart'), null);
  assert.equal(countdown.lastElementChild.getAttribute('aria-labelledby'), 'pet-countdown-heading');
  p.doc.getElementById('settings-time-tab').click(); assert.equal(p.doc.getElementById('pet-countdown-name').value, '草稿');
  p.c.settingsView.dom.window.document.body.replaceChildren(); p.ctx.MNPPanel.show(p.c); await flush();
  assert.equal(p.c.loadingLabel, undefined); assert.equal(p.c.retryButton.hidden, true); assert.ok(p.doc.getElementById('pet-settings'));
});

test('主设置面板禁用双指缩放与双击放大，保留正常滚动，重建或加载完成后仍为 1 倍', async t => {
  const p = await setup(t), c = p.c;
  function locked(view) {
    const scroll = view.scrollView;
    assert.equal(scroll.minimumZoomScale, 1); assert.equal(scroll.maximumZoomScale, 1);
    assert.equal(scroll.bouncesZoom, false); assert.equal(scroll.zoomScale, 1);
    assert.equal(scroll.pinchGestureRecognizer.enabled, false);
    assert.notEqual(scroll.scrollEnabled, false, '主面板仍要能上下滚动');
  }
  locked(c.settingsView);
  c.settingsView.scrollView.zoomScale = 2.4;
  p.call('webViewDidFinishLoad', c.settingsView); locked(c.settingsView);
  const old = c.settingsView; old.dom.window.document.body.replaceChildren();
  p.call('webViewDidFailLoadWithError', old, { code: -1009 }); await flush();
  assert.notEqual(c.settingsView, old); locked(c.settingsView);
  const viewport = p.doc.querySelector('meta[name=viewport]').content;
  assert.match(viewport, /maximum-scale=1/); assert.match(viewport, /user-scalable=no/);
});

test('原生控制器第一次读取 view 触发加载回调时，只初始化一遍面板和页面', async t => {
  let loads = 0; const p = await setup(t, () => { loads++; }, true);
  assert.equal(loads, 1, '首次访问原生 view 不应导致两次页面加载');
  assert.equal(p.c.view.subviews.length, 4, '只保留网页、标题栏、缩放手柄和异常重试按钮');
  p.call('closePanel'); p.ctx.MNPPanel.show(p.c); await flush(); assert.equal(loads, 1);
});
