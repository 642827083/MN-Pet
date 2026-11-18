var MNPMenu = (function () {
  function rect(x, y, width, height) { return { x: x, y: y, width: width, height: height }; }
  function clamp(value, low, high) { return Math.max(low, Math.min(value, Math.max(low, high))); }
  function stack(s) {
    var parent = s.view && s.view.superview, sibling = s.view;
    if (!parent || !s.active || !s.settings.visible) return;
    var base = Number(MNPNative.value(s.view.layer, 'zPosition')) || 0;
    [s.menuBackdrop, s.menu, s.menuButton].forEach(function (view, index) {
      if (!view || view.superview !== parent) return;
      view.layer.zPosition = base + index + 1;
      var children = MNPNative.items(MNPNative.value(parent, 'subviews'));
      if (children.indexOf(view) < children.indexOf(sibling)) parent.insertSubviewAboveSubview(view, sibling);
      sibling = view;
    });
  }
  function dismissLater(s) {
    MNPPetOverlay.cancelTimer(s, 'petMenuHideTimer');
    if (s.settings.menuButtonMode !== 'tap' || !s.menuButtonRevealed || s.menu || !s.active || !s.view || !s.view.superview) return;
    MNPPetOverlay.schedule(s, 'petMenuHideTimer', 5, function () {
      if (s.menu || s.settings.menuButtonMode !== 'tap') return;
      s.menuButtonRevealed = false; if (s.menuButton) s.menuButton.hidden = true;
    });
  }
  function revealButton(s) {
    if (!s.menuButton || !s.active || !s.settings.visible || !s.view || !s.view.superview) return;
    if (s.settings.menuButtonMode === 'tap') s.menuButtonRevealed = true;
    s.menuButton.hidden = false; dismissLater(s); stack(s);
  }
  function close(s) {
    if (s.focusController) MNPPanel.hide(s.focusController);
    if (s.menu) s.menu.removeFromSuperview(); s.menu = null;
    if (s.menuBackdrop) s.menuBackdrop.removeFromSuperview(); s.menuBackdrop = null;
    if (s.menuButton) s.menuButton.accessibilityLabel = '展开菜单';
    stack(s); dismissLater(s);
  }
  function geometry(bounds, pet, contentHeight) {
    var width = Math.min(296, Math.max(1, bounds.width - 16)), height = Math.min(contentHeight || 260, Math.max(1, bounds.height - 16));
    var toggle = rect(clamp(pet.x + pet.width - 22, 8, bounds.width - 40), clamp(pet.y, 8, bounds.height - 40), 32, 32);
    var x = clamp(toggle.x + 32 - width, 8, bounds.width - width - 8), y;
    if (pet.x >= width + 18) { x = pet.x - width - 10; y = clamp(toggle.y, 8, bounds.height - height - 8); }
    else if (bounds.width - pet.x - pet.width >= width + 18) { x = pet.x + pet.width + 10; y = clamp(toggle.y, 8, bounds.height - height - 8); }
    else {
      var above = Math.max(0, toggle.y - 18), below = Math.max(0, bounds.height - toggle.y - 50);
      y = clamp(above >= below ? toggle.y - height - 10 : toggle.y + 42, 8, bounds.height - height - 8);
    }
    return { toggle: toggle, menu: rect(x, y, width, height) };
  }
  function layout(s) {
    if (!s.view || !s.view.superview || !s.menuButton) return;
    var plan = geometry(s.view.superview.bounds, s.view.frame, s.focusController && s.focusController.focusHeight); s.menuButton.frame = plan.toggle;
    if (s.menuBackdrop) s.menuBackdrop.frame = rect(0, 0, s.view.superview.bounds.width, s.view.superview.bounds.height);
    if (s.menu) { s.menu.frame = plan.menu; if (s.focusController) MNPPanel.layout(s.focusController); } stack(s);
  }
  function show(s) {
    if (!s.view || !s.view.superview || !s.active || typeof UIButton === 'undefined') return;
    if (!s.menuButton) {
      s.menuButton = new UIButton(rect(0, 0, 32, 32)); s.menuButton.backgroundColor = UIColor.colorWithRedGreenBlueAlpha(.13, .19, .42, 1); s.menuButton.layer.cornerRadius = 7;
      s.menuButton.addTargetActionForControlEvents(s.context, 'petMenu:', 1 << 6);
      [9, 15, 21].forEach(function (y) { var line = new UIView(rect(7, y, 18, 2)); line.backgroundColor = UIColor.whiteColor(); line.layer.cornerRadius = 1; line.userInteractionEnabled = false; s.menuButton.addSubview(line); });
      s.menuButton.accessibilityLabel = '展开菜单';
    }
    if (s.menuButtonMode !== s.settings.menuButtonMode) { s.menuButtonMode = s.settings.menuButtonMode; s.menuButtonRevealed = false; close(s); MNPPetOverlay.cancelTimer(s, 'petMenuHideTimer'); }
    s.menuButton.hidden = s.settings.menuButtonMode === 'tap' && !s.menuButtonRevealed && !s.menu;
    if (s.menuButton.superview !== s.view.superview) s.view.superview.addSubview(s.menuButton); layout(s);
  }
  function hide(s) {
    close(s); s.menuButtonRevealed = false; MNPPetOverlay.cancelTimer(s, 'petMenuHideTimer');
    if (s.menuButton) { s.menuButton.hidden = true; s.menuButton.removeFromSuperview(); }
  }
  function toggle(addon) {
    var s = addon.petSession;
    if (!s || !s.active || !s.settings.visible || !s.view || !s.view.superview || !s.menuButton || s.menuButton.hidden) return;
    if (s.menu) { close(s); return; }
    MNPPetBubble.hide(s); MNPPetOverlay.cancelTimer(s, 'petMenuHideTimer');
    try {
      if (!s.focusController || s.focusController.disposed) s.focusController = MNPPanel.create(addon, 'focus');
      // 透明原生点击层仅在菜单展开时存在，菜单本身及三横线按钮保持在它上方。
      s.menuBackdrop = new UIButton(rect(0, 0, s.view.superview.bounds.width, s.view.superview.bounds.height));
      s.menuBackdrop.backgroundColor = UIColor.clearColor(); s.menuBackdrop.accessibilityLabel = '收起计时面板';
      s.menuBackdrop.addTargetActionForControlEvents(s.context, 'petMenuDismiss:', 1 << 6); s.view.superview.addSubview(s.menuBackdrop);
      MNPPanel.show(s.focusController, s.view.superview, geometry(s.view.superview.bounds, s.view.frame, s.focusController.focusHeight).menu);
      s.menu = s.focusController.view; s.menuButton.accessibilityLabel = '收起菜单'; layout(s);
    } catch (error) { close(s); MNPPetOverlay.report(s, error); }
  }
  function dispose(s) { hide(s); if (s.focusController) MNPPanel.dispose(s.focusController); s.focusController = null; }
  return { show: show, hide: hide, layout: layout, close: close, toggle: toggle, revealButton: revealButton, geometry: geometry, stack: stack, dispose: dispose,
    dismiss: function (addon, sender) { var s = addon.petSession; if (s && s.active && s.menu && s.menuBackdrop === sender) close(s); } };
})();
