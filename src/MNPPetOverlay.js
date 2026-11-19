var MNPPetOverlay = (function () {
  function cancelTimer(s, name) { if (s[name]) { s[name].invalidate(); s[name] = null; } }
  function schedule(s, name, seconds, callback) {
    cancelTimer(s, name);
    s[name] = NSTimer.scheduledTimerWithTimeInterval(seconds, false, function () {
      s[name] = null; if (s.destroyed) return;
      try { callback(); } catch (error) { report(s, error); }
    });
  }
  function publish(s) { if (typeof MNPPets !== 'undefined') MNPPets.publish(s); }
  function report(s, error) { s.lastError = String(error.message || error); console.log('[MN Pet] 桌宠：' + s.lastError); publish(s); }
  function available(s) { return s.settings.source === 'builtin' || (s.settings.source === 'image' ? !!(s.customPet && s.customPet.base64) : !!s.petPack); }
  function host(s) {
    var study = Application.sharedInstance().studyController(s.context.window);
    if (!study || !study.view) return null;
    var candidates = [MNPNative.value(study.view, 'window'), s.context.window];
    for (var i = 0; i < candidates.length; i++) {
      var view = candidates[i], bounds = MNPNative.value(view, 'bounds');
      if (view && typeof view.addSubview === 'function' && bounds && Number(bounds.width) > 0 && Number(bounds.height) > 0) return view;
    }
    return study.view;
  }
  function attach(s, parent) {
    if (s.view.superview === parent) return;
    // 学习内容区可能避开底部安全区域；桌宠直接挂到本场景窗口，只有自身范围接收触摸。
    MNPMenu.close(s); MNPPetBubble.hide(s); MNPPetInteraction.stop(s); s.dragOrigin = null;
    parent.addSubview(s.view);
    if (s.menuButton) parent.addSubview(s.menuButton);
  }
  function layout(s) {
    if (!s.view || !s.view.superview) return;
    var parent = host(s); if (parent) attach(s, parent);
    var frame = MNPPetModel.frame(s.settings, s.view.superview.bounds); s.view.frame = frame;
    s.imageView.frame = { x: 0, y: 0, width: frame.width, height: frame.height }; s.view.alpha = s.settings.opacity;
    MNPPetAnimationPlayer.layout(s);
    MNPPetInteraction.layout(s);
    MNPMenu.layout(s);
    MNPPetBubble.layout(s);
  }
  function show(s) {
    if (s.destroyed || !s.active || !s.settings.visible || !available(s)) { hide(s); return; }
    var parent = host(s); if (!parent) return;
    if (!s.view) {
      if (typeof UIView === 'undefined' || typeof UIImageView === 'undefined' || typeof UIImage === 'undefined' || typeof UIColor === 'undefined') throw new Error('当前 MN 缺少桌宠显示接口');
      s.view = typeof UIButton !== 'undefined' ? new UIButton({ x: 0, y: 0, width: 112, height: 112 }) : new UIView({ x: 0, y: 0, width: 112, height: 112 });
      if (typeof s.view.addTargetActionForControlEvents === 'function') {
        s.view.addTargetActionForControlEvents(s.context, 'petPress:', 1 << 0);
        s.view.addTargetActionForControlEvents(s.context, 'petRelease:', (1 << 6) | (1 << 7) | (1 << 8));
      }
      s.imageView = new UIImageView({ x: 0, y: 0, width: 112, height: 112 });
      s.view.backgroundColor = UIColor.clearColor(); s.imageView.backgroundColor = UIColor.clearColor();
      s.view.userInteractionEnabled = true; s.imageView.userInteractionEnabled = false; s.view.addSubview(s.imageView);
      if (typeof UIPanGestureRecognizer !== 'undefined') {
        s.panGesture = new UIPanGestureRecognizer(s.context, 'petPan:'); s.panGesture.maximumNumberOfTouches = 1;
        s.view.addGestureRecognizer(s.panGesture);
      }
      if (typeof UITapGestureRecognizer !== 'undefined') {
        s.tapGesture = new UITapGestureRecognizer(s.context, 'petTap:');
        if (s.panGesture && typeof s.tapGesture.requireGestureRecognizerToFail === 'function') s.tapGesture.requireGestureRecognizerToFail(s.panGesture);
        s.view.addGestureRecognizer(s.tapGesture);
      }
    }
    attach(s, parent);
    layout(s);
    MNPMenu.show(s);
    var revision = s.settings.source + ':' + (s.settings.source === 'builtin' ? MNPBuiltinPet.snapshot().revision : s.settings.source === 'image' ? s.customPet.revision : s.petPack.revision);
    if (s.renderedRevision === revision) return;
    MNPPetBubble.hide(s);
    MNPPetInteraction.stop(s);
    MNPPetAnimationPlayer.dispose(s);
    s.animationWarning = '';
    s.imageView.image = s.settings.source === 'builtin' ? MNPBuiltinPet.image(s) : s.settings.source === 'image' ? MNPPetImageStore.image(s.customPet) : MNPPetPackStore.poster(s.petPack);
    s.renderedRevision = revision; s.lastError = '';
    // 挂载后按当前计时状态选择动作：待机、专注、休息各有对应素材。
    MNPPetAction.refresh(s);
  }
  function hide(s) {
    MNPMenu.hide(s);
    MNPPetBubble.hide(s);
    MNPPetInteraction.stop(s); s.dragOrigin = null;
    s.petDragging = false; s.petActionTarget = '';
    MNPPetAnimationPlayer.dispose(s); s.renderedRevision = '';
    if (s.view) s.view.removeFromSuperview();
    if (s.imageView) s.imageView.image = null;
  }
  function pan(s, gesture) {
    if (!s.view || !s.view.superview || !s.active) return;
    if (gesture.state === 1) {
      MNPMenu.close(s);
      MNPPetBubble.hide(s);
      MNPPetInteraction.stop(s);
      // 拖动期间播放拖动动作；结束后由状态机按计时状态恢复。
      MNPPetAction.drag(s, true);
      s.dragOrigin = { x: s.view.frame.x, y: s.view.frame.y };
    }
    if (s.dragOrigin && [1, 2, 3].indexOf(gesture.state) >= 0) {
      var delta = gesture.translationInView(s.view.superview);
      s.settings.position = MNPPetModel.position(s.settings, s.view.superview.bounds, s.dragOrigin.x + delta.x, s.dragOrigin.y + delta.y); layout(s);
    }
    if ([3, 4, 5].indexOf(gesture.state) >= 0) {
      s.dragOrigin = null;
      s.suppressTapUntil = Date.now() + 300;
      MNPPetAction.drag(s, false);
      // 拖动只保存位置，避免覆盖其他窗口刚更新的显示选项。
      var latest = MNPPetModel.read(); latest.position = s.settings.position; MNPPetModel.write(latest);
    }
  }
  function dispose(s) {
    MNPFocusRuntime.stop(s);
    MNPMenu.dispose(s);
    cancelTimer(s, 'mountTimer'); MNPPetPackStore.cancel(s); cancelTimer(s, 'customImportTimer'); s.customPetTransfer = null;
    hide(s); MNPPetBubble.dispose(s); s.destroyed = true;
    if (s.view && s.panGesture) s.view.removeGestureRecognizer(s.panGesture);
    if (s.view && s.tapGesture) s.view.removeGestureRecognizer(s.tapGesture);
    s.view = null; s.imageView = null; s.petPack = null; s.customPet = null;
    s.menuButton = null;
  }
  return { schedule: schedule, cancelTimer: cancelTimer, report: report, publish: publish, available: available, show: show, hide: hide, layout: layout, pan: pan, dispose: dispose };
})();
