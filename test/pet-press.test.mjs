import test from 'node:test';
import assert from 'node:assert/strict';
import { pets, picture, pack, plain } from './pet-support.mjs';

function setup() {
  const h = pets(), d = h.open(); let now = 1000;
  h.context.Date = { now: () => now };
  const send = (event, sender = d.s.view) => {
    const targets = sender.targets.filter(target => target.event & event);
    assert.equal(targets.length, 1, '每个触摸事件只注册一次');
    for (const target of targets) h.call(target.target, target.selector.replace(/:$/, ''), sender);
  };
  const step = (ms = 1000 / 60) => { now += ms; d.s.petBounceTimer?.fire(); };
  const settle = () => { for (let i = 0; i < 180 && d.s.petBounceTimer; i++) step(); assert.ok(!d.s.petBounceTimer); };
  const anchored = () => {
    const f = d.s.imageView.frame, size = d.s.view.frame.width;
    assert.ok(Math.abs(f.y + f.height - size) < 1e-8, '形变过程中底部固定');
    assert.ok(Math.abs(f.x + f.width / 2 - size / 2) < 1e-8, '形变保持水平居中');
  };
  return { h, d, send, step, settle, anchored };
}

test('自带桌宠按下立即挤压，按住保持，松手回弹且不改变底部和触摸范围', () => {
  const { h, d, send, step, settle, anchored } = setup();
  const root = plain(d.s.view.frame), size = root.width;
  send(1 << 0); assert.equal(d.s.petPressed, true);
  assert.ok(d.s.imageView.frame.width > size); assert.ok(d.s.imageView.frame.height < size); anchored();
  settle(); assert.equal(d.s.petPressed, true); assert.equal(d.s.petSquash.value, 1); anchored();
  send(1 << 6); assert.equal(d.s.petPressed, false);
  let overshot = false;
  for (let i = 0; i < 180 && d.s.petBounceTimer; i++) {
    step(); anchored(); overshot ||= d.s.imageView.frame.height > size;
    assert.deepEqual(plain(d.s.view.frame), root);
  }
  assert.ok(overshot, '松手后有弹性回弹'); assert.equal(d.s.petSquash, null);
  assert.deepEqual(plain(d.s.imageView.frame), { x: 0, y: 0, width: size, height: size });
  assert.equal(h.files.size, 0); assert.equal(h.writes.length, 0);
});

test('连续按压接续当前形变，旧计时器不会覆盖新按压，轻点识别不重播动画', () => {
  const { h, d, send, step, settle } = setup();
  send(1); settle(); send(1 << 6); step(60);
  const oldTimer = d.s.petBounceTimer, old = { ...d.s.petSquash }, frame = plain(d.s.imageView.frame);
  send(1); assert.equal(oldTimer.valid, false);
  assert.equal(d.s.petSquash.value, old.value); assert.equal(d.s.petSquash.velocity, old.velocity);
  assert.deepEqual(plain(d.s.imageView.frame), frame);
  oldTimer.fire(); assert.deepEqual(plain(d.s.imageView.frame), frame);
  send(1 << 6); const state = d.s.petSquash;
  h.call(d.addon, 'petTap', { state: 3 }); assert.equal(d.s.petSquash, state);
  settle(); assert.equal(d.s.petActionId, 'idle');
});

for (const event of [1 << 7, 1 << 8]) test('移出或系统取消触摸会松开挤压：' + event, () => {
  const { d, send, step, settle } = setup(); send(1); step(100); send(event);
  assert.equal(d.s.petPressed, false); settle(); assert.equal(d.s.petSquash, null);
});

test('拖动优先取消挤压，后续取消或松手不触发回弹', () => {
  const { h, d, send } = setup(); send(1);
  const timer = d.s.petBounceTimer, gesture = { state: 1, translationInView: () => ({ x: 20, y: 10 }) };
  h.call(d.addon, 'petPan', gesture); assert.equal(timer.valid, false); assert.equal(d.s.petSquash, null);
  send(1 << 8); gesture.state = 3; h.call(d.addon, 'petPan', gesture);
  send(1 << 6); h.call(d.addon, 'petTap', { state: 3 });
  assert.equal(d.s.petActionId, 'idle'); assert.equal(d.s.petBounceTimer, null);
});

test('按住时调整大小继续保持形变和底部锚点，菜单按钮仍在图片上层', () => {
  const { d, send, settle, anchored } = setup(); send(1); settle();
  d.command('setPetOptions', { size: 90 }); anchored();
  assert.ok(Math.abs(d.s.imageView.frame.height - 90 * .82) < 1e-8);
  assert.equal(d.s.petPressed, true);
  const parent = d.s.view.superview;
  assert.ok(parent.subviews.indexOf(d.s.menuButton) > parent.subviews.indexOf(d.s.view));
});

for (const cleanup of ['hide', 'source', 'background', 'dispose']) test('取消按压并释放计时器：' + cleanup, () => {
  const { h, d, send } = setup(); send(1); const timer = d.s.petBounceTimer, sender = d.s.view;
  if (cleanup === 'hide') d.command('setPetOptions', { visible: false });
  if (cleanup === 'source') h.upload(d, 'image', picture);
  if (cleanup === 'background') h.addonClass.statics.applicationDidEnterBackground();
  if (cleanup === 'dispose') h.call(d.addon, 'sceneDidDisconnect');
  send(1 << 6, sender); timer.fire();
  assert.equal(d.s.petPressed, false); assert.equal(d.s.petSquash, null); assert.equal(d.s.petBounceTimer, null);
  // 桌宠隐藏或换角色时，独立计时继续运行；按压动画的计时器仍须释放。
  assert.equal(h.timers.some(t => t.valid && t !== d.s.focusTimer), false);
  if (cleanup === 'background' || cleanup === 'dispose') assert.ok(!d.s.focusTimer);
});

for (const source of ['image', 'pack']) test('导入角色保留原有互动，不应用自带角色挤压：' + source, () => {
  const { h, d, send } = setup(); h.upload(d, source, source === 'image' ? picture : pack);
  const frame = plain(d.s.imageView.frame); send(1); send(1 << 6);
  assert.deepEqual(plain(d.s.imageView.frame), frame); assert.ok(!d.s.petSquash);
  h.call(d.addon, 'petTap', { state: 3 }); assert.equal(d.s.petActionId, 'bounce');
});

test('旧视图触摸和不可见状态不激活动画，缺少按钮接口仍可轻点回弹', () => {
  const { h, d, send } = setup(); const sender = d.s.view;
  h.call(d.addon, 'sceneDidDisconnect'); const second = h.open();
  h.call(second.addon, 'petPress', sender); assert.ok(!second.s.petSquash);
  send(1, sender); assert.equal(d.s.petSquash, null);
  h.call(second.addon, 'sceneWillResignActive'); h.call(second.addon, 'petPress', second.s.view); assert.equal(second.s.petSquash, null);
  delete h.context.UIButton; const third = h.open();
  h.call(third.addon, 'petTap', { state: 3 }); assert.equal(third.s.petActionId, 'squash');
});
