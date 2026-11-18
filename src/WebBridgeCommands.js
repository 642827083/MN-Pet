var MNPWebCommands = (function () {
  var commands = ['getPetState', 'getPetAsset', 'setPetOptions', 'setPetCountdown', 'importPetPack', 'importPetImage', 'cancelPetImport', 'deletePet', 'getFocusState', 'focusAction', 'configureFocus', 'openFocusSettings', 'resizeFocusPanel', 'openAboutLink'];
  var focusHandlers = {
    getFocusState: function (s, p) { MNPFocusRuntime.notify(s, MNPFocus.tick()); return MNPFocus.read(p.range); },
    focusAction: function (s, p) { var result = MNPFocus.action(p); MNPFocusRuntime.notify(s, result.event); return result.timer; },
    configureFocus: function (s, p) { MNPFocusRuntime.notify(s, MNPFocus.tick()); return MNPFocus.configure(p); }
  };
  function focus(controller, name, p) {
    var s = controller.addon.petSession;
    if (!controller.visible || controller.disposed || ['settings', 'focus'].indexOf(controller.activePage) < 0 || !s || !s.active) throw new Error('请在设置页或桌宠计时面板操作番茄钟');
    if (p.range !== undefined && ['day', 'week', 'month'].indexOf(p.range) < 0) throw new Error('统计范围无效');
    if (p.range) controller.focusRange = p.range;
    var request = Object.assign({}, p, { range: controller.focusRange || 'week' });
    var result = focusHandlers[name](s, request); MNPPets.refreshFocus(); return result;
  }
  function openFocusSettings(controller) {
    var s = controller.addon.petSession;
    if (controller.kind !== 'focus' || !controller.visible || controller.disposed || !s || !s.active || s.focusController !== controller) throw new Error('请从桌宠计时面板打开时间设置');
    return MNPPanel.openTime(controller.addon);
  }
  function resizeFocusPanel(controller, p) {
    var s = controller.addon.petSession;
    if (controller.kind !== 'focus' || !controller.visible || controller.disposed || !s || !s.active || s.focusController !== controller || !s.view || !s.view.superview) throw new Error('计时面板当前不可调整');
    if (!p || !Number.isFinite(p.height) || p.height < 160 || p.height > 480) throw new Error('计时面板高度无效');
    var height = Math.ceil(p.height);
    if (height !== controller.focusHeight) { controller.focusHeight = height; MNPMenu.layout(s); }
    return { maxHeight: Math.max(1, s.view.superview.bounds.height - 16) };
  }
  function local(controller, address, view) {
    if (!controller.visible || controller.disposed || view !== controller.settingsView || typeof address !== 'string' || address.length > 100000) return false;
    var match = /^mnpet:\/\/bridge\?payload=(.+)$/.exec(address), request;
    if (!match) return false;
    try {
      request = JSON.parse(decodeURIComponent(match[1]));
      if (!request || request.token !== controller.settingsToken || typeof request.requestId !== 'string' || request.requestId.length > 120) return false;
      if (commands.indexOf(request.command) < 0) throw new Error('不支持的桌宠设置命令');
      if (controller.kind === 'focus' && ['openFocusSettings', 'resizeFocusPanel'].indexOf(request.command) < 0 && !Object.prototype.hasOwnProperty.call(focusHandlers, request.command)) throw new Error('计时面板不支持此命令');
      reply(view, request.requestId, MNPPets.command(controller, request.command, request.payload), null);
    } catch (error) { if (request && request.token === controller.settingsToken) reply(view, request.requestId, null, String(error.message || error)); }
    return true;
  }
  function reply(view, id, payload, error) {
    MNPNative.evaluate(view, 'window.__MNP_BRIDGE_RECEIVE__(' + MNPNative.script({ requestId: id, payload: payload, error: error }) + ')').catch(function () {});
  }
  return { local: local, focus: focus, openFocusSettings: openFocusSettings, resizeFocusPanel: resizeFocusPanel };
})();
