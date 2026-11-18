import test from 'node:test';
import assert from 'node:assert/strict';
import { pets } from './pet-support.mjs';
const tap = (h, d) => h.call(d.addon, 'petTap', { state: 3 });

test('旧设置默认常显，显示模式即时保存并同步窗口，重启保留', () => {
  const h = pets(), d = h.open(), other = h.open();
  assert.equal(d.s.settings.menuButtonMode, 'always'); assert.equal(d.s.menuButton.hidden, false);
  d.command('setPetOptions', { menuButtonMode: 'tap' });
  for (const item of [d, other]) { assert.equal(item.s.settings.menuButtonMode, 'tap'); assert.equal(item.s.menuButton.hidden, true); }
  assert.equal(pets({ values: h.values }).open().s.settings.menuButtonMode, 'tap');
  assert.throws(() => d.command('setPetOptions', { menuButtonMode: 'bad' }), /不支持/);
  assert.equal(h.context.MNPPetModel.normalize({ menuButtonMode: 'bad' }).menuButtonMode, 'always');
  d.command('setPetOptions', { menuButtonMode: 'always' });
  assert.equal(d.s.menuButton.hidden, false); assert.ok(!d.s.petMenuHideTimer);
});

test('点击模式下仅轻点显示按钮，约五秒后收起，重复点击重新计时且保留按压效果', () => {
  const h = pets(), d = h.open(); d.command('setPetOptions', { menuButtonMode: 'tap' });
  h.call(d.addon, 'petMenu'); assert.ok(!d.s.menu);
  tap(h, d); assert.equal(d.s.menuButton.hidden, false); assert.equal(d.s.petMenuHideTimer.seconds, 5);
  assert.ok(d.s.petSquash, '轻点仍有原来的按压反馈');
  const old = d.s.petMenuHideTimer; tap(h, d); const current = d.s.petMenuHideTimer;
  assert.notEqual(old, current); assert.equal(old.valid, false); old.fire(); assert.equal(d.s.menuButton.hidden, false);
  current.fire(); assert.equal(d.s.menuButton.hidden, true); assert.equal(d.s.petMenuHideTimer, null);
  h.call(d.addon, 'controllerWillLayoutSubviews'); assert.equal(d.s.menuButton.hidden, true);
});

test('菜单展开时取消收起计时，菜单关闭后重新等待五秒', () => {
  const h = pets(), d = h.open(); d.command('setPetOptions', { menuButtonMode: 'tap' }); tap(h, d);
  const timer = d.s.petMenuHideTimer;
  h.call(d.addon, 'petMenu'); assert.ok(d.s.menu.superview);
  assert.equal(timer.valid, false); assert.equal(d.s.petMenuHideTimer, null);
  timer.fire(); tap(h, d); assert.equal(d.s.menuButton.hidden, false); assert.equal(d.s.petMenuHideTimer, null);
  h.call(d.addon, 'petMenu'); assert.equal(d.s.menu, null); assert.equal(d.s.petMenuHideTimer.seconds, 5);
  d.s.petMenuHideTimer.fire(); assert.equal(d.s.menuButton.hidden, true);
});

for (const event of ['hide', 'background', 'dispose']) test('取消收起计时并清理临时显示状态：' + event, () => {
  const h = pets(), d = h.open(); d.command('setPetOptions', { menuButtonMode: 'tap' }); tap(h, d);
  const timer = d.s.petMenuHideTimer;
  if (event === 'hide') d.command('setPetOptions', { visible: false });
  if (event === 'background') h.call(d.addon, 'sceneWillResignActive');
  if (event === 'dispose') h.call(d.addon, 'sceneDidDisconnect');
  assert.equal(timer.valid, false); assert.equal(d.s.petMenuHideTimer, null); timer.fire();
  assert.equal(d.s.menuButtonRevealed, false);
  if (event !== 'dispose') {
    if (event === 'hide') d.command('setPetOptions', { visible: true });
    else { h.call(d.addon, 'sceneDidBecomeActive'); d.s.mountTimer.fire(); }
    assert.equal(d.s.menuButton.hidden, true);
  }
});

test('常显模式不创建收起计时器，拖动不被误识别为点击显示', () => {
  const h = pets(), d = h.open(); tap(h, d);
  assert.equal(d.s.menuButton.hidden, false); assert.ok(!d.s.petMenuHideTimer);
  d.command('setPetOptions', { menuButtonMode: 'tap' });
  const gesture = { state: 1, translationInView: () => ({ x: 30, y: 0 }) };
  h.call(d.addon, 'petPan', gesture); gesture.state = 3; h.call(d.addon, 'petPan', gesture); tap(h, d);
  assert.equal(d.s.menuButton.hidden, true); assert.ok(!d.s.petMenuHideTimer);
});
