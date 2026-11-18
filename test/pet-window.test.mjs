import test from 'node:test';
import assert from 'node:assert/strict';
import { pets, picture } from './pet-support.mjs';

function windowFor(h, d, width = 1024, height = 768) {
  const study = h.views.get(d.addon.window);
  const window = new study.view.constructor({ x: 0, y: 0, width, height });
  study.view.window = window;
  study.view.frame = { x: 0, y: 24, width, height: height - 46 };
  return { study, window };
}
function bottom(h, d) {
  const gesture = { state: 1, translationInView: () => ({ x: 10000, y: 10000 }) };
  h.call(d.addon, 'petPan', gesture); gesture.state = 3; h.call(d.addon, 'petPan', gesture);
}

test('学习内容区留有底部空间时，桌宠和菜单使用当前完整窗口，贴住实际右下角', () => {
  const h = pets(), d = h.open(), { window } = windowFor(h, d);
  h.call(d.addon, 'controllerWillLayoutSubviews'); bottom(h, d);
  assert.equal(d.s.view.frame.y + d.s.view.frame.height, window.bounds.height);
  assert.equal(d.s.view.frame.x + d.s.view.frame.width, window.bounds.width);
  assert.ok(d.s.view.superview === window); assert.ok(d.s.menuButton.superview === window);
  h.call(d.addon, 'petMenu'); assert.ok(d.s.menu.superview === window);
  assert.ok(window.subviews.indexOf(d.s.menuButton) > window.subviews.indexOf(d.s.view));
});

test('完整窗口旋转或分屏后仍贴边，两个学习窗口分别布局且不会挂到另一个窗口', () => {
  const h = pets(), d = h.open(), { window } = windowFor(h, d);
  h.call(d.addon, 'controllerWillLayoutSubviews'); bottom(h, d);
  for (const [width, height] of [[768, 1024], [360, 640], [1024, 768]]) {
    window.frame = { x: 0, y: 0, width, height }; h.call(d.addon, 'controllerWillLayoutSubviews');
    assert.equal(d.s.view.frame.y + d.s.view.frame.height, height);
    assert.equal(d.s.view.frame.x + d.s.view.frame.width, width);
  }
  const other = h.open(), second = windowFor(h, other, 400, 600).window;
  h.call(other.addon, 'controllerWillLayoutSubviews'); bottom(h, other);
  assert.ok(other.s.view.superview === second); assert.ok(d.s.view.superview === window);
  assert.equal(other.s.view.frame.y + other.s.view.frame.height, 600);
});

test('窗口晚就绪时迁入完整窗口，取消旧按压和菜单；后台、关闭和卸载释放窗口中的桌宠', () => {
  const h = pets(), d = h.open(), oldParent = d.s.view.superview;
  h.call(d.addon, 'petPress', d.s.view); h.call(d.addon, 'petMenu');
  const timer = d.s.petBounceTimer, menu = d.s.menu, backdrop = d.s.menuBackdrop;
  const { window } = windowFor(h, d); h.call(d.addon, 'controllerWillLayoutSubviews');
  assert.ok(d.s.view.superview === window); assert.equal(menu.superview, null); assert.equal(timer.valid, false);
  assert.equal(backdrop.superview, null); assert.equal(d.s.menuBackdrop, null);
  assert.equal(d.s.petSquash, null); assert.equal(d.s.dragOrigin, null);
  assert.ok(!oldParent.subviews.includes(d.s.menuButton));
  h.call(d.addon, 'sceneWillResignActive'); assert.equal(d.s.view.superview, null); assert.equal(d.s.menuButton.superview, null);
  h.call(d.addon, 'controllerWillLayoutSubviews'); assert.equal(d.s.view.superview, null);
  h.call(d.addon, 'sceneDidBecomeActive'); d.s.mountTimer.fire(); assert.ok(d.s.view.superview === window);
  h.call(d.addon, 'documentWillClose'); assert.equal(d.s.view.superview, null);
  h.call(d.addon, 'documentDidOpen'); d.s.mountTimer.fire();
  h.call(d.addon, 'sceneDidDisconnect'); assert.equal(window.subviews.length, 0);
});

test('完整窗口不可用时保留学习区回退，导入角色也可贴住完整窗口底边', () => {
  const h = pets(), d = h.open(), study = h.views.get(d.addon.window);
  study.view.window = { bounds: { width: 0, height: 0 } };
  h.call(d.addon, 'controllerWillLayoutSubviews'); assert.ok(d.s.view.superview === study.view);
  const { window } = windowFor(h, d); h.upload(d, 'image', picture); bottom(h, d);
  assert.ok(d.s.view.superview === window); assert.equal(d.s.view.frame.y + d.s.view.frame.height, window.bounds.height);
});
