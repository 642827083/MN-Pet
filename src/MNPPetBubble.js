var MNPPetBubble = (function () {
  function geometry(bounds, pet) {
    // 原项目角色位于正方形容器右下，占宽高 59.45%；气泡 SVG 位于容器左上。
    var width = pet.width / .5945;
    return { x: pet.x + pet.width - width, y: pet.y + pet.height - width, width: width, height: width * 700 / 1026 };
  }
  function matches(s, view) { return !!(s && s.countdownUI && s.countdownUI.view === view); }
  function stack(s) {
    var parent = s.view && s.view.superview, view = s.countdownBubble;
    if (!parent || !view || view.superview !== parent) return;
    view.layer.zPosition = (Number(MNPNative.value(s.view.layer, 'zPosition')) || 0) + .5;
    parent.addSubview(view); MNPMenu.stack(s);
  }
  function layout(s) {
    if (!s.countdownBubble || !s.view || !s.view.superview || !s.countdownBubble.superview) return;
    s.countdownBubble.frame = geometry(s.view.superview.bounds, s.view.frame); stack(s);
  }
  function send(s) {
    var ui = s.countdownUI;
    if (!ui || !ui.ready || !ui.payload) return;
    var payload = { open: s.countdownShown === true, title: ui.payload.title, value: ui.payload.value, time: ui.payload.time || '', phase: ui.payload.phase || '', status: ui.payload.status || 'idle' };
    ui.view.accessibilityLabel = payload.title + payload.value + '，' + payload.phase + ' ' + payload.time;
    ui.view.evaluateJavaScript('window.MNPPetBubblePage.set(' + MNPNative.script(payload) + ',' + (++ui.token) + ')', null);
  }
  // focus 可由调用方传入，避免每秒重复读取计时存档。
  function update(s, focus) {
    MNPPetOverlay.cancelTimer(s, 'countdownDayTimer');
    if (!s.countdownShown || !s.countdownUI || !s.active || !s.settings.visible || !s.view || !s.view.superview) return;
    var data = MNPPetCountdown.read(), now = data.name && data.date ? new Date() : null;
    var payload = now ? MNPPetCountdown.describe(data, now) : { title: '', value: '' };
    if (!focus) focus = MNPFocusRuntime.current(s);
    payload.time = focus.error ? '--:--' : MNPFocus.format(focus.displayMs, focus.state.mode === 'countup');
    payload.phase = focus.error ? '计时暂不可用' : focus.label; payload.status = focus.error ? 'idle' : focus.state.status;
    s.countdownUI.payload = payload; send(s);
    if (now) MNPPetOverlay.schedule(s, 'countdownDayTimer', MNPPetCountdown.midnight(now), function () { update(s); });
  }
  function hide(s) {
    s.countdownShown = false;
    MNPPetOverlay.cancelTimer(s, 'countdownDayTimer'); MNPPetOverlay.cancelTimer(s, 'countdownCloseTimer'); MNPPetOverlay.cancelTimer(s, 'countdownLoadTimer');
    if (s.countdownBubble) {
      if (s.countdownUI.ready) s.countdownBubble.evaluateJavaScript('window.MNPPetBubblePage.stop()', null);
      s.countdownBubble.removeFromSuperview();
      if (!s.countdownUI.ready) { s.countdownBubble.delegate = null; s.countdownBubble.stopLoading(); s.countdownBubble = null; s.countdownUI = null; }
    }
  }
  function close(s) {
    s.countdownShown = false; MNPPetOverlay.cancelTimer(s, 'countdownDayTimer'); send(s);
    // 原样式逆序收起，最后的小泡在 .3 秒后开始，过渡 .2 秒后再移除视图。
    MNPPetOverlay.schedule(s, 'countdownCloseTimer', .52, function () { hide(s); });
  }
  function dispose(s) {
    hide(s);
    if (s.countdownBubble) { s.countdownBubble.delegate = null; s.countdownBubble.stopLoading(); }
    s.countdownBubble = null; s.countdownUI = null;
  }
  function loaded(s, view) {
    if (!matches(s, view)) return;
    MNPPetOverlay.cancelTimer(s, 'countdownLoadTimer'); s.countdownUI.ready = true;
    MNPPetAnimationPlayer.clearBackgrounds(view);
    if (s.active && s.countdownShown && view.superview) send(s);
  }
  function failed(s, view) {
    if (!matches(s, view)) return;
    dispose(s); MNPPetOverlay.report(s, new Error('倒计时气泡未能加载，请再次点击桌宠重试'));
  }
  function toggle(s) {
    if (s.countdownShown) { close(s); return; }
    if (!s.active || !s.settings.visible || !s.view || !s.view.superview || s.menu) return;
    MNPPetOverlay.cancelTimer(s, 'countdownCloseTimer'); s.countdownShown = true;
    if (!s.countdownUI) {
      var path = s.mainPath.replace(/\/$/, '') + '/web-dist/pet-bubble/index.html';
      var view = s.countdownBubble = new UIWebView(geometry(s.view.superview.bounds, s.view.frame));
      s.countdownUI = { view: view, path: path, token: 0, ready: false, payload: null };
      view.delegate = s.context; view.userInteractionEnabled = false; view.scalesPageToFit = false; view.dataDetectorTypes = 0;
      MNPPetAnimationPlayer.clearBackgrounds(view);
      if (view.scrollView) view.scrollView.scrollEnabled = false;
      s.view.superview.addSubview(view);
      MNPPetOverlay.schedule(s, 'countdownLoadTimer', 8, function () { failed(s, view); });
      view.loadFileURLAllowingReadAccessToURL(NSURL.fileURLWithPath(path), NSURL.fileURLWithPath(s.mainPath));
    } else if (s.countdownBubble.superview !== s.view.superview) s.view.superview.addSubview(s.countdownBubble);
    update(s); layout(s);
  }
  function allow(s, view, request) {
    var url = MNPNative.value(request, 'URL');
    return matches(s, view) && MNPNative.value(url, 'scheme') === 'file' && MNPNative.value(url, 'path') === s.countdownUI.path;
  }
  return { toggle: toggle, hide: hide, layout: layout, update: update, stack: stack, dispose: dispose, geometry: geometry, matches: matches, loaded: loaded, failed: failed, allow: allow };
})();
