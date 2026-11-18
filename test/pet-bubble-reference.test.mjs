import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { petBubbleHTML } = await resources();

test('点击沿实际原生入口驱动原项目逐个出现样式，不再整组同时淡入', t => {
  const h = pets(), d = h.open(); h.call(d.addon, 'petTap', { state: 3 });
  const view = d.s.countdownBubble;
  assert.equal(view.loaded.url.path, '/addon/web-dist/pet-bubble/index.html');
  const dom = new JSDOM(petBubbleHTML, { runScripts: 'dangerously' }); t.after(() => dom.window.close());
  dom.window.MNPPetBubblePage.set(plain(view.bubbleMessage), view.bubbleToken);
  const rules = Array.from(dom.window.document.styleSheets[0].cssRules);
  const styles = selector => rules.find(rule => rule.selectorText === selector).style;
  assert.ok(dom.window.document.getElementById('bubble').classList.contains('dshwv-pop-open'));
  assert.equal(styles('.dshwv-pop.dshwv-pop-open .dshwv-b2').getPropertyValue('transition-delay'), '0s');
  assert.equal(styles('.dshwv-pop.dshwv-pop-open .dshwv-b1').getPropertyValue('transition-delay'), '.13s');
  assert.equal(styles('.dshwv-pop.dshwv-pop-open .dshwv-bshape').getPropertyValue('transition-delay'), '.26s');
  assert.equal(styles('.dshwv-pop.dshwv-pop-open .dshwv-text').getPropertyValue('transition'), 'opacity .16s ease .36s,transform .3s ease');
  h.call(d.addon, 'petTap', { state: 3 });
  dom.window.MNPPetBubblePage.set(plain(view.bubbleMessage), view.bubbleToken);
  assert.equal(styles('.dshwv-pop .dshwv-b2').getPropertyValue('transition-delay'), '.3s');
  assert.equal(styles('.dshwv-pop .dshwv-b1').getPropertyValue('transition-delay'), '.2s');
  assert.equal(styles('.dshwv-pop .dshwv-bshape').getPropertyValue('transition-delay'), '.1s');
  const close = d.s.countdownCloseTimer;
  h.call(d.addon, 'petTap', { state: 3 }); close.fire(); assert.ok(view.superview); assert.equal(close.valid, false);
});

test('原始 SVG 保留左右位置、尾部和椭圆参数，连接小气泡贴近桌宠左侧', () => {
  const svg = new JSDOM(readFileSync('web/src/pet-bubble/upstream.svg', 'utf8'), { contentType: 'image/svg+xml' }).window.document;
  const small = svg.querySelector('.dshwv-b2'), large = svg.querySelector('.dshwv-b1');
  assert.equal(small.getAttribute('cx'), '442'); assert.equal(small.getAttribute('cy'), '646');
  assert.equal(large.getAttribute('cx'), '352'); assert.equal(large.getAttribute('cy'), '561');
  assert.equal(svg.querySelector('.dshwv-bshape').getAttribute('d'), 'M 827 248 A 373 232 0 1 0 81 246 A 373 232 0 0 0 301 465 A 57 32 10 0 0 413 484 A 373 232 0 0 0 827 248 Z');
  const h = pets(), d = h.open(); h.call(d.addon, 'petTap', { state: 3 });
  const frame = d.s.countdownBubble.frame, pet = d.s.view.frame, unit = frame.width / 1026;
  assert.ok(frame.x + 442 * unit < pet.x + pet.width * .1);
  assert.ok(frame.y + 646 * unit > pet.y + pet.height * .3);
});

test('气泡文字只以文本写入、事件天数同排且显示计时，旧命令不能覆盖新状态，本地页面不允许外网导航', t => {
  const dom = new JSDOM(petBubbleHTML, { runScripts: 'dangerously' }); t.after(() => dom.window.close());
  const api = dom.window.MNPPetBubblePage, doc = dom.window.document;
  assert.equal(api.set({ open: true, title: '<img src=x onerror=alert(1)>', value: '32 天' }, 3), true);
  assert.equal(doc.getElementById('name').textContent, '<img src=x onerror=alert(1)>'); assert.equal(doc.querySelector('img'), null);
  assert.equal(doc.getElementById('name').parentElement, doc.getElementById('value').parentElement);
  assert.equal(doc.getElementById('focus-time').textContent, '25:00');
  assert.equal(api.set({ open: false, title: '旧', value: '旧' }, 2), false);
  assert.ok(doc.getElementById('bubble').classList.contains('dshwv-pop-open'));
  const h = pets(), d = h.open(); h.call(d.addon, 'petTap', { state: 3 });
  const view = d.s.countdownBubble, allow = url => h.call(d.addon, 'webViewShouldStartLoadWithRequestNavigationType', view, { URL: url });
  assert.equal(allow({ scheme: 'file', path: '/addon/web-dist/pet-bubble/index.html' }), true);
  for (const url of [{ scheme: 'https', path: '/example.com' }, { scheme: 'file', path: '/documents/private.json' }]) assert.equal(allow(url), false);
});

test('加载超时和晚到回调不会让隐藏气泡重新出现，可在下次点击重试', () => {
  const h = pets(), d = h.open();
  h.context.UIWebView.prototype.loadFileURLAllowingReadAccessToURL = function () {};
  h.call(d.addon, 'petTap', { state: 3 }); const old = d.s.countdownBubble, timer = d.s.countdownLoadTimer;
  timer.fire(); assert.equal(d.s.countdownUI, null); assert.equal(old.superview, null);
  h.call(d.addon, 'webViewDidFinishLoad', old); assert.equal(d.s.countdownUI, null);
  h.call(d.addon, 'petTap', { state: 3 }); assert.notEqual(d.s.countdownBubble, old);
  h.call(d.addon, 'sceneWillResignActive'); assert.equal(d.s.countdownUI, null); assert.ok(!d.s.countdownLoadTimer);
});

test('旧语句设置不影响加载，气泡恢复事件、时间、状态的布局，保留已完成状态与小时计时', t => {
  const h = pets({ values: new Map([['cn.marginnote.mn-pet.pet.settings', JSON.stringify({ bubbleText: '旧语句', size: 120 })]]) }), d = h.open();
  assert.equal(d.command('getPetState').settings.size, 120);
  h.call(d.addon, 'petTap', { state: 3 }); assert.equal(d.s.countdownBubble.bubbleMessage.phrase, undefined);
  const dom = new JSDOM(petBubbleHTML, { runScripts: 'dangerously' }); t.after(() => dom.window.close());
  const api = dom.window.MNPPetBubblePage, doc = dom.window.document;
  api.set({ ...plain(d.s.countdownBubble.bubbleMessage), phrase: '<img src=x>', time: '1:01:01', status: 'completed' }, 1);
  assert.equal(doc.getElementById('phrase'), null); assert.equal(doc.querySelector('img'), null);
  assert.match(doc.getElementById('focus-phase').textContent, /已完成/); assert.equal(doc.getElementById('focus-time').textContent, '1:01:01');
  assert.deepEqual([...doc.querySelector('.dshwv-text').children].map(el => el.id), ['countdown-line', 'focus-time', 'focus-phase']);
});
