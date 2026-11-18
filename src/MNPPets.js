var MNPPets = (function () {
  var sessions = [];
  function selection(settings, pack, image) {
    // 旧版尚未导入角色时使用自带桌宠，保留已经选择的有效导入角色与隐藏状态。
    if (settings.source === 'pack' && !pack || settings.source === 'image' && !(image && image.base64)) settings.source = 'builtin';
    return settings;
  }
  function ensure(addon, mainPath) {
    if (addon.petSession && !addon.petSession.destroyed) { if (mainPath) addon.petSession.mainPath = mainPath; return addon.petSession; }
    var pack = MNPPetPackStore.read(), image = MNPPetImageStore.read();
    var s = { context: addon, mainPath: mainPath || addon.petMainPath || '', active: true, sceneActive: true, destroyed: false,
      settings: selection(MNPPetModel.read(), pack.record, image.record), petPack: pack.record, packRevision: pack.record ? pack.record.revision : pack.revision || '', customPet: image.record, warning: [pack.warning, image.warning].filter(Boolean).join(' '), lastError: '' };
    addon.petSession = s; sessions.push(s); return s;
  }
  function snapshot(s) {
    return { settings: s.settings, countdown: MNPPetCountdown.read(), focus: MNPFocusRuntime.current(s), available: MNPPetOverlay.available(s), mounted: !!(s.view && s.view.superview),
      builtin: MNPBuiltinPet.snapshot(), pack: MNPPetPackStore.snapshot(s.petPack), packRevision: s.packRevision, image: MNPPetImageStore.snapshot(s.customPet),
      warning: [s.warning, s.lastError, s.animationWarning].filter(Boolean).join(' ') };
  }
  function publish(s) {
    var panel = s.context.panelController;
    if (panel && panel.visible && panel.settingsView) MNPNative.evaluate(panel.settingsView,
      'window.__MNP_PET_STATE__&&window.__MNP_PET_STATE__(' + MNPNative.script(snapshot(s)) + ')').catch(function () {});
  }
  function mount(s) { try { MNPPetOverlay.show(s); } catch (error) { MNPPetOverlay.report(s, error); } }
  function later(addon, mainPath) {
    var s = ensure(addon, mainPath);
    MNPFocusRuntime.start(s);
    MNPPetOverlay.schedule(s, 'mountTimer', 0.25, function () { mount(s); });
  }
  function sync(settings, type, record, revision) {
    sessions.forEach(function (s) {
      var position = s.settings.position; s.settings = MNPPetModel.normalize(settings); s.settings.position = position;
      if (type === 'pack') { s.petPack = record; s.packRevision = record ? record.revision : revision || ''; }
      if (type === 'image') s.customPet = record;
      s.warning = ''; mount(s); publish(s);
    });
  }
  function cancel(addon, id) {
    var s = addon.petSession; if (!s) return;
    if (!id || s.petPackTransfer && s.petPackTransfer.id === id) MNPPetPackStore.cancel(s);
    if (!id || s.customPetTransfer && s.customPetTransfer.id === id) { s.customPetTransfer = null; MNPPetOverlay.cancelTimer(s, 'customImportTimer'); }
  }
  function asset(s, p) {
    if (!p || ['builtin', 'pack', 'image'].indexOf(p.source) < 0 || !Number.isSafeInteger(p.offset) || p.offset < 0) throw new Error('桌宠预览读取位置无效');
    var record = p.source === 'builtin' ? MNPBuiltinPet.snapshot() : p.source === 'pack' ? s.petPack : s.customPet;
    if (!record || p.revision !== record.revision) throw new Error('桌宠已变化，请重新读取预览');
    var text = p.source === 'builtin' ? MNPBuiltinPet.base64(s) : p.source === 'pack' ? record.files[record.manifest.poster] : record.base64;
    if (!text || p.offset >= text.length) throw new Error('没有可读取的桌宠图片');
    return { revision: record.revision, offset: p.offset, total: text.length, chunk: text.slice(p.offset, p.offset + 32768) };
  }
  function command(controller, name, p) {
    var addon = controller.addon, s = ensure(addon); p = p || {};
    if (name === 'openFocusSettings') return MNPWebCommands.openFocusSettings(controller);
    if (name === 'resizeFocusPanel') return MNPWebCommands.resizeFocusPanel(controller, p);
    if (['getFocusState', 'focusAction', 'configureFocus'].indexOf(name) >= 0) return MNPWebCommands.focus(controller, name, p);
    if (name === 'getPetState') return snapshot(s);
    if (name === 'getPetAsset') return asset(s, p);
    if (name === 'cancelPetImport') { cancel(addon, p.id); return true; }
    if (!controller.visible || controller.activePage !== 'settings' || !s.active) throw new Error('请在设置页操作桌宠');
    if (name === 'openAboutLink') return MNPAbout.open(p.target);
    if (name === 'setPetCountdown') {
      MNPPetCountdown.write(p);
      sessions.forEach(function (session) { MNPPetBubble.update(session); publish(session); });
      return snapshot(s);
    }
    if (name === 'deletePet') {
      if (['pack', 'image'].indexOf(p.source) < 0) throw new Error('只能删除已导入的桌宠');
      var deleted = p.source === 'pack' ? MNPPetPackStore.remove(p.expectedRevision) : MNPPetImageStore.remove(p.expectedRevision);
      sessions.forEach(function (session) {
        if (p.source === 'pack') MNPPetPackStore.cancel(session);
        else { session.customPetTransfer = null; MNPPetOverlay.cancelTimer(session, 'customImportTimer'); }
      });
      var remaining = MNPPetModel.read(); if (remaining.source === p.source) remaining.source = 'builtin';
      sync(MNPPetModel.write(remaining), p.source, p.source === 'pack' ? null : deleted, deleted.revision); return snapshot(s);
    }
    if (name === 'setPetOptions') {
      var next = MNPPetModel.patch(selection(MNPPetModel.read(), s.petPack, s.customPet), p);
      if (next.source === 'pack' && !s.petPack || next.source === 'image' && !s.customPet.base64) throw new Error('请先导入相应的桌宠');
      sync(MNPPetModel.write(next)); return snapshot(s);
    }
    var record, source;
    try {
      if (name === 'importPetPack') {
        if (s.customPetTransfer) throw new Error('图片正在导入，请稍候');
        source = 'pack'; record = MNPPetPackStore.receive(s, p);
      } else if (name === 'importPetImage') {
        if (s.petPackTransfer) throw new Error('桌宠包正在导入，请稍候');
        source = 'image'; record = MNPPetImageStore.receive(s, p);
      } else throw new Error('不支持的桌宠命令');
    } catch (error) { if (p.id) cancel(addon, p.id); throw error; }
    if (!record) return true;
    var settings = MNPPetModel.read(); settings.source = source; settings.visible = true;
    sync(MNPPetModel.write(settings), source, record); return snapshot(s);
  }
  function active(addon, value) {
    var s = ensure(addon); s.sceneActive = value; s.active = value;
    if (value) later(addon); else { cancel(addon); MNPFocusRuntime.stop(s); MNPPetOverlay.cancelTimer(s, 'mountTimer'); MNPPetOverlay.hide(s); }
  }
  function close(addon) { var s = addon.petSession; if (s) { s.focusActive = false; MNPFocusRuntime.stop(s); cancel(addon); MNPPetOverlay.cancelTimer(s, 'mountTimer'); MNPPetOverlay.hide(s); } }
  function dispose(addon) {
    var s = addon.petSession; if (!s) return;
    MNPPetOverlay.dispose(s); sessions = sessions.filter(function (item) { return item !== s; }); addon.petSession = null;
  }
  function front(addon) {
    var s = addon.petSession, parent = s && s.view && s.view.superview;
    if (!parent || !s.active || !s.settings.visible) return;
    // 打开主面板后仍保留桌宠和菜单按钮的点击能力。
    parent.addSubview(s.view);
    MNPPetBubble.stack(s);
    if (s.menu) parent.addSubview(s.menu);
    if (s.menuButton) parent.addSubview(s.menuButton);
    MNPMenu.stack(s);
  }
  function background(value) {
    sessions.slice().forEach(function (s) {
      if (value) {
        
        s.active = false; MNPFocusRuntime.stop(s); cancel(s.context); MNPPetOverlay.cancelTimer(s, 'mountTimer'); MNPPetOverlay.hide(s);
      }
      else { s.active = s.sceneActive; if (s.active) later(s.context); }
    });
  }
  return { ensure: ensure, snapshot: snapshot, publish: publish, later: later, cancel: cancel, command: command, active: active, close: close, dispose: dispose,
    layout: function (addon) { if (addon.petSession) MNPPetOverlay.layout(addon.petSession); },
    pan: function (addon, gesture) { if (addon.petSession) { try { MNPPetOverlay.pan(addon.petSession, gesture); } catch (error) { MNPPetOverlay.report(addon.petSession, error); } } },
    tap: function (addon, gesture) { if (addon.petSession) { try { MNPPetInteraction.tap(addon.petSession, gesture); } catch (error) { MNPPetOverlay.report(addon.petSession, error); } } },
    touch: function (addon, sender, pressed) { if (addon.petSession) { try { MNPPetInteraction[pressed ? 'press' : 'release'](addon.petSession, sender); } catch (error) { MNPPetOverlay.report(addon.petSession, error); } } },
    background: background, front: front, refreshFocus: function () { sessions.forEach(function (s) { MNPFocusRuntime.publish(s); }); }, disposeAll: function () { sessions.slice().forEach(function (s) { dispose(s.context); }); } };
})();
