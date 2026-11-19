var MNPFocusRuntime = (function () {
  function current(s, range) {
    try { return MNPFocus.read(range || 'week'); }
    catch (error) { return { error: String(error.message || error) }; }
  }
  function notify(s, event) {
    if (!event) return;
    var message = event.phase === 'countdown' ? '倒计时结束，已保存本次专注时间' : MNPFocus.labels[event.phase] + '结束，' + (event.autoStarted ? '已开始' : '接下来是') + MNPFocus.labels[event.next];
    if (event.late) message += '。离开时间较长，请手动开始';
    if (event.alert && typeof UIAlertView !== 'undefined' && typeof UIAlertView.showWithTitleMessageStyleCancelButtonTitleOtherButtonTitlesTapBlock === 'function') {
      UIAlertView.showWithTitleMessageStyleCancelButtonTitleOtherButtonTitlesTapBlock('MN Pet 计时', message, 0, '知道了', [], function () {});
    } else if (MNPNative.app().showHUD) MNPNative.app().showHUD(message, s.context.window, 3);
  }
  function publish(s) {
    if (!s || s.destroyed || !s.active) return;
    // 每秒复用同一份计时快照：气泡和桌宠动作都要用，避免重复读盘。
    var focus = current(s);
    MNPPetBubble.update(s, focus);
    MNPPetAction.sync(s, focus);
    [s.focusController, s.context.panelController].forEach(function (panel) {
      if (panel && panel.visible && !panel.disposed && panel.settingsView) MNPNative.evaluate(panel.settingsView,
        'window.__MNP_FOCUS_STATE__&&window.__MNP_FOCUS_STATE__(' + MNPNative.script(current(s, panel.focusRange)) + ')').catch(function () {});
    });
  }
  function stop(s) { MNPPetOverlay.cancelTimer(s, 'focusTimer'); }
  function pulse(s) {
    if (!s || s.destroyed || !s.active || !s.focusActive) return;
    try { notify(s, MNPFocus.tick()); publish(s); s.focusError = ''; }
    catch (error) { var message = String(error.message || error); if (s.focusError !== message) { s.focusError = message; MNPPetOverlay.report(s, error); } }
    MNPPetOverlay.schedule(s, 'focusTimer', 1, function () { pulse(s); });
  }
  function start(s) { s.focusActive = true; stop(s); pulse(s); }
  return { current: current, notify: notify, publish: publish, start: start, stop: stop };
})();
