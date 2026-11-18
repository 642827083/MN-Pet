function createMnPetAddon(mainPath) {
  return JSB.defineClass('MNPAddon : JSExtension <UIWebViewDelegate>', {
    sceneWillConnect: function () { self.petMainPath = mainPath; MNPPets.later(self, mainPath); },
    sceneWillResignActive: function () { MNPPets.active(self, false); },
    sceneDidBecomeActive: function () { MNPPets.active(self, true); if (self.panelController && typeof MNPPanel.refresh === 'function') MNPPanel.refresh(self.panelController); },
    notebookWillOpen: function () { MNPPets.later(self, mainPath); },
    documentDidOpen: function () { MNPPets.later(self, mainPath); },
    documentWillClose: function () { MNPPets.close(self); },
    controllerWillLayoutSubviews: function () { MNPPets.layout(self); },
    notebookWillClose: function () { MNPPets.close(self); if (self.panelController) { MNPPanel.dispose(self.panelController); self.panelController = null; } },
    sceneDidDisconnect: function () { MNPPets.dispose(self); if (self.panelController) MNPPanel.dispose(self.panelController); self.panelController = null; },
    petPan: function (gesture) { MNPPets.pan(self, gesture); },
    petTap: function (gesture) { MNPPets.tap(self, gesture); },
    petPress: function (sender) { MNPPets.touch(self, sender, true); },
    petRelease: function (sender) { MNPPets.touch(self, sender, false); },
    petMenu: function () { MNPMenu.toggle(self); },
    petMenuDismiss: function (sender) { MNPMenu.dismiss(self, sender); },
    webViewDidFinishLoad: function (view) { if (self.petSession) { MNPPetBubble.loaded(self.petSession, view); MNPPetAnimationPlayer.loaded(self.petSession, view); } },
    webViewDidFailLoadWithError: function (view, error) { if (Number(MNPNative.value(error, 'code')) !== -999 && self.petSession) { MNPPetBubble.failed(self.petSession, view); MNPPetAnimationPlayer.failed(self.petSession, view); } },
    webViewShouldStartLoadWithRequestNavigationType: function (view, request) { return MNPPetBubble.matches(self.petSession, view) ? MNPPetBubble.allow(self.petSession, view, request) : MNPPetAnimationPlayer.allow(self.petSession, view, request); },
    queryAddonCommandStatus: function () { return { image: 'icon.png', object: self, selector: 'togglePanel:', checked: Boolean(self.panelController && self.panelController.visible) }; },
    togglePanel: function () {
      try {
        if (!self.panelController) self.panelController = MNPPanel.create(self);
        if (self.panelController.visible) MNPPanel.hide(self.panelController); else MNPPanel.show(self.panelController);
      } catch (error) { console.log('[MN Pet] ' + String(error.message || error)); MNPNative.app().showHUD(String(error.message || error), self.window, 3); }
    }
  }, { addonDidConnect: function () { console.log('[MN Pet] 已加载'); }, addonWillDisconnect: function () { MNPPets.disposeAll(); },
    applicationDidEnterBackground: function () { MNPPets.background(true); }, applicationWillEnterForeground: function () { MNPPets.background(false); } });
}
