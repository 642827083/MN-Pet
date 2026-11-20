var MNPPanel = (function () {
  var N = MNPNative;
  function fixViewport(controller, view) {
    if (!view) return;
    var scroll = N.value(view, 'scrollView');
    if (!scroll) return;
    // 两个面板都不允许双指或双击放大，始终保持 1 倍比例；缩放一旦发生文字会糊成一团。
    scroll.bouncesZoom = false; scroll.minimumZoomScale = 1; scroll.maximumZoomScale = 1;
    if (N.value(scroll, 'zoomScale') !== 1) scroll.zoomScale = 1;
    var pinch = N.value(scroll, 'pinchGestureRecognizer'); if (pinch) pinch.enabled = false;
    if (controller.kind !== 'focus') return;
    // 小计时器是固定控件面板，除缩放外也不保留网页滚动、回弹和偏移。
    scroll.scrollEnabled = false; scroll.bounces = false;
    scroll.alwaysBounceVertical = false; scroll.alwaysBounceHorizontal = false;
    scroll.showsVerticalScrollIndicator = false; scroll.showsHorizontalScrollIndicator = false;
    scroll.contentOffset = { x: 0, y: 0 };
  }
  function control(controller, title, action) {
    var view = new UIButton({ x: 0, y: 0, width: 44, height: 44 }); view.setTitleForState(title, 0);
    view.setTitleColorForState(UIColor.darkGrayColor(), 0); view.backgroundColor = UIColor.clearColor(); view.addTargetActionForControlEvents(controller, action, 1 << 6); return view;
  }
  function layout(controller) {
    if (!controller.panelReady) return;
    var width = controller.view.bounds.width, height = controller.view.bounds.height, headerHeight = controller.kind === 'focus' ? 0 : 44;
    controller.header.frame = { x: 0, y: 0, width: width, height: headerHeight };
    controller.titleLabel.frame = { x: 44, y: 0, width: Math.max(1, width - 88), height: headerHeight };
    if (controller.closeButton) controller.closeButton.frame = { x: width - 44, y: 0, width: 44, height: 44 };
    controller.settingsView.frame = { x: 0, y: headerHeight, width: width, height: Math.max(1, height - headerHeight) };
    fixViewport(controller, controller.settingsView);
    if (controller.kind === 'focus') {
      var session = controller.addon.petSession, host = session && session.view && session.view.superview, limit = host && Math.max(1, host.bounds.height - 16);
      if (limit && (controller.focusLimit !== limit || controller.focusLimitView !== controller.settingsView)) {
        controller.focusLimit = limit; controller.focusLimitView = controller.settingsView;
        N.evaluate(controller.settingsView, 'window.__MNP_FOCUS_CONSTRAINT__&&window.__MNP_FOCUS_CONSTRAINT__(' + limit + ')').catch(function () {});
      }
    }
    controller.resizeHandle.frame = { x: width - 30, y: height - 30, width: 30, height: 30 };
    controller.retryButton.frame = { x: 20, y: Math.max(50, (height - 44) / 2), width: Math.max(1, width - 40), height: 44 };
  }
  function cancelTimer(controller, key) { if (controller[key]) { controller[key].invalidate(); controller[key] = null; } }
  function cancelChecks(controller) {
    controller.settingsCheckId = (controller.settingsCheckId || 0) + 1; controller.settingsChecking = false; controller.settingsLoading = false;
    cancelTimer(controller, 'settingsProbeTimer'); cancelTimer(controller, 'settingsLoadTimer');
  }
  function createWebView(controller) {
    var old = controller.settingsView, view = new UIWebView(old ? old.frame : { x: 0, y: 44, width: 640, height: 560 });
    view.delegate = controller; view.scalesPageToFit = false; view.dataDetectorTypes = 0; view.backgroundColor = UIColor.whiteColor();
    controller.settingsView = view;
    fixViewport(controller, view);
    if (old) {
      old.delegate = null; old.stopLoading();
      // 保持关闭按钮、异常重试和缩放手柄在网页上方。
      if (old.superview === controller.view) controller.view.insertSubviewAboveSubview(view, old); else controller.view.addSubview(view);
      old.removeFromSuperview();
    } else controller.view.addSubview(view);
  }
  function failed(controller, message) {
    cancelChecks(controller); controller.retryButton.hidden = false;
    controller.retryButton.setTitleForState('设置暂未显示，点击重试', 0);
    console.log('[MN Pet] 设置页面：' + message);
  }
  function recover(controller, message) {
    if (!controller.visible || controller.disposed) return;
    if ((controller.settingsRecoveryCount || 0) >= 1) { failed(controller, message); return; }
    controller.settingsRecoveryCount = 1; load(controller, true);
  }
  function load(controller, rebuild) {
    cancelChecks(controller);
    try {
      if (typeof NSFileManager === 'undefined' || typeof NSString === 'undefined' || typeof NSString.stringWithContentsOfData !== 'function') throw new Error('当前 MN 缺少设置页面读取接口');
      var file = controller.addon.petMainPath.replace(/\/$/, '') + '/web-dist/' + (controller.kind === 'focus' ? 'focus.html' : 'settings.html');
      var data = NSFileManager.defaultManager().contentsAtPath(file);
      var html = data && NSString.stringWithContentsOfData(data);
      if (typeof html !== 'string' || html.indexOf('__MNP_TOKEN_VALUE__') < 0) throw new Error('设置页面资源无法读取，请重新安装测试包');
      if (rebuild) createWebView(controller);
      controller.settingsToken = N.token(); controller.retryButton.hidden = true; controller.settingsLoading = true;
      var view = controller.settingsView, id = controller.settingsCheckId;
      controller.settingsLoadTimer = NSTimer.scheduledTimerWithTimeInterval(8, false, function () {
        controller.settingsLoadTimer = null;
        if (id !== controller.settingsCheckId || view !== controller.settingsView || !controller.visible || controller.disposed) return;
        // 有时只有完成回调丢失；先检查页面，避免重建已经正常显示的内容。
        controller.settingsLoading = false; refresh(controller, false);
      });
      controller.settingsView.loadHTMLStringBaseURL(html.replace('__MNP_TOKEN_VALUE__', controller.settingsToken).replace('__MNP_START_PAGE_VALUE__', controller.requestedTab === 'time' ? 'time' : 'pet'), null);
    } catch (error) { failed(controller, String(error.message || error)); N.hud(controller, String(error.message || error)); }
  }
  function setup(controller) {
    if (controller.panelReady || controller.panelBuilding) return;
    // 首次读取原生 view 会同步触发 viewDidLoad，防止回调重入后创建两套控件。
    controller.panelBuilding = true;
    try {
      controller.view.backgroundColor = UIColor.whiteColor(); controller.view.autoresizingMask = 0;
      controller.view.layer.cornerRadius = 10; controller.view.layer.masksToBounds = true; controller.view.layer.borderWidth = .5; controller.view.layer.borderColor = UIColor.colorWithWhiteAlpha(.86, 1);
      controller.activePage = controller.kind === 'focus' ? 'focus' : 'settings'; createWebView(controller);
      controller.header = new UIView({ x: 0, y: 0, width: 640, height: 44 }); controller.header.backgroundColor = UIColor.colorWithWhiteAlpha(.985, 1); controller.view.addSubview(controller.header);
      controller.header.hidden = controller.kind === 'focus';
      controller.titleLabel = new UILabel({ x: 44, y: 0, width: 552, height: 44 }); controller.titleLabel.text = controller.kind === 'focus' ? '番茄钟' : 'MN Pet'; controller.titleLabel.textAlignment = 1; controller.titleLabel.font = UIFont.boldSystemFontOfSize(15); controller.titleLabel.textColor = UIColor.darkGrayColor(); controller.titleLabel.userInteractionEnabled = false; controller.header.addSubview(controller.titleLabel);
      if (controller.kind !== 'focus') {
        controller.closeButton = control(controller, '', 'closePanel:'); controller.closeButton.accessibilityLabel = '关闭设置';
        var image = new UIImageView({ x: 12, y: 12, width: 20, height: 20 }); image.userInteractionEnabled = false; image.image = UIImage.imageWithContentsOfFile(controller.addon.petMainPath + '/web-dist/toolbar/close@3x.png'); controller.closeButton.addSubview(image);
        controller.header.addSubview(controller.closeButton);
      }
      controller.resizeHandle = new UIView({ x: 610, y: 570, width: 30, height: 30 });
      var arrow = new UILabel({ x: 0, y: 0, width: 30, height: 30 }); arrow.text = '↘'; arrow.font = UIFont.systemFontOfSize(22); arrow.textAlignment = 1; arrow.userInteractionEnabled = false; controller.resizeHandle.addSubview(arrow); controller.view.addSubview(controller.resizeHandle);
      controller.retryButton = control(controller, '设置暂未显示，点击重试', 'retrySettings:'); controller.view.addSubview(controller.retryButton);
      controller.resizeHandle.hidden = controller.kind === 'focus';
      if (controller.kind !== 'focus' && typeof UIPanGestureRecognizer !== 'undefined') { controller.header.addGestureRecognizer(new UIPanGestureRecognizer(controller, 'movePanel:')); controller.resizeHandle.addGestureRecognizer(new UIPanGestureRecognizer(controller, 'resizePanel:')); }
      controller.panelReady = true; load(controller); layout(controller);
    } finally { controller.panelBuilding = false; }
  }
  function refresh(controller, refreshState) {
    if (!controller.visible || controller.disposed || controller.settingsLoading || controller.settingsChecking) return;
    var view = controller.settingsView, id = controller.settingsCheckId, expected = 'mnp-ready:' + controller.settingsToken;
    controller.settingsChecking = true;
    function finish(result) {
      if (id !== controller.settingsCheckId || view !== controller.settingsView || !controller.visible || controller.disposed) return;
      controller.settingsChecking = false; cancelTimer(controller, 'settingsProbeTimer');
      // 明确比对当前加载令牌，避免把 0、空值或旧页面误认为就绪。
      if (String(result || '') !== expected) { recover(controller, '网页未就绪或失去响应'); return; }
      controller.settingsRecoveryCount = 0; controller.retryButton.hidden = true;
      if (controller.kind !== 'focus' && controller.requestedTab) {
        var target = controller.requestedTab;
        N.evaluate(view, 'window.__MNP_SETTINGS_SHOW_PAGE__&&window.__MNP_SETTINGS_SHOW_PAGE__(' + N.script(target) + ')', 3).then(function (shown) {
          if (shown && controller.settingsView === view && controller.requestedTab === target) controller.requestedTab = '';
        }).catch(function () {});
      }
      if (refreshState !== false) N.evaluate(view, 'window.__MNP_PET_REFRESH__&&window.__MNP_PET_REFRESH__()', 3).catch(function () {});
    }
    controller.settingsProbeTimer = NSTimer.scheduledTimerWithTimeInterval(3, false, function () { controller.settingsProbeTimer = null; finish(null); });
    try {
      var root = controller.kind === 'focus' ? 'focus-card' : 'pet-settings';
      view.evaluateJavaScript('(window.__MNP_SETTINGS_READY__===true&&typeof window.__MNP_PET_REFRESH__==="function"&&document.getElementById(' + N.script(root) + '))?"mnp-ready:"+window.__MNP_SETTINGS_TOKEN__:""', finish);
    } catch (_) { finish(null); }
  }
  function show(controller, parent, frame) {
    var study = controller.kind === 'focus' ? null : N.study(controller);
    if (controller.kind === 'focus' ? !parent || !frame : !study || !study.view) throw new Error('请先打开 MN 学习窗口');
    // 加载很快时，网页可能在 setup 返回前发起首次通信，必须先允许当前面板接收。
    controller.visible = true;
    try { setup(controller); } catch (error) { controller.visible = false; cancelChecks(controller); throw error; }
    if (controller.kind === 'focus') { parent.addSubview(controller.view); controller.view.frame = frame; }
    else { study.view.addSubview(controller.view); MNPWindow.layout(controller); MNPPets.front(controller.addon); }
    layout(controller); refresh(controller);
    if (study && typeof study.refreshAddonCommands === 'function') study.refreshAddonCommands();
  }
  function hide(controller) {
    controller.visible = false; cancelChecks(controller);
    if (controller.kind === 'focus' && controller.settingsView) N.evaluate(controller.settingsView, 'window.__MNP_FOCUS_DISMISS__&&window.__MNP_FOCUS_DISMISS__()').catch(function () {});
    if (controller.kind !== 'focus') { MNPPets.cancel(controller.addon); MNPWindow.save(controller); }
    if (typeof controller.view.endEditing === 'function') controller.view.endEditing(true); controller.view.removeFromSuperview();
    var study = controller.kind === 'focus' ? null : N.study(controller); if (study && typeof study.refreshAddonCommands === 'function') study.refreshAddonCommands();
  }
  function dispose(controller) {
    if (!controller) return; controller.disposed = true; controller.visible = false; cancelChecks(controller); if (controller.kind !== 'focus') MNPPets.cancel(controller.addon);
    if (controller.settingsView) { controller.settingsView.delegate = null; controller.settingsView.stopLoading(); }
    if (controller.view) controller.view.removeFromSuperview();
  }
  function openTime(addon) {
    if (!addon.panelController || addon.panelController.disposed) addon.panelController = create(addon);
    addon.panelController.requestedTab = 'time'; show(addon.panelController);
    if (addon.petSession) MNPMenu.close(addon.petSession);
    return true;
  }
  function create(addon, kind) { var controller = PanelClass.new(); controller.addon = addon; controller.kind = kind === 'focus' ? 'focus' : 'settings'; return controller; }
  var PanelClass = JSB.defineClass('MNPPetPanelController : UIViewController <UIWebViewDelegate>', {
    viewDidLoad: function () { setup(self); },
    viewDidLayoutSubviews: function () { if (self.panelReady) { if (self.kind !== 'focus') MNPWindow.layout(self, true); layout(self); } },
    closePanel: function () { if (self.kind === 'focus' && self.addon.petSession) MNPMenu.close(self.addon.petSession); else hide(self); },
    retrySettings: function () { self.settingsRecoveryCount = 0; load(self, true); },
    movePanel: function (gesture) { MNPWindow.gesture(self, gesture, false); layout(self); },
    resizePanel: function (gesture) { MNPWindow.gesture(self, gesture, true); layout(self); },
    webViewShouldStartLoadWithRequestNavigationType: function (view, request) {
      if (view !== self.settingsView) return false;
      var address = N.address(request); if (/^mnpet:/i.test(address)) { MNPWebCommands.local(self, address, view); return false; } return address === 'about:blank';
    },
    webViewDidFinishLoad: function (view) {
      if (view !== self.settingsView || N.value(view, 'loading') === true) return;
      fixViewport(self, view);
      self.settingsLoading = false; cancelTimer(self, 'settingsLoadTimer'); refresh(self, false);
    },
    webViewDidFailLoadWithError: function (view, error) {
      if (view === self.settingsView && Number(N.value(error, 'code')) !== -999) {
        // 隐藏的桥接 iframe 也可能触发失败回调，先确认主页面是否健康。
        self.settingsLoading = false; cancelTimer(self, 'settingsLoadTimer'); refresh(self, false);
      }
    }
  });
  return { create: create, show: show, hide: hide, dispose: dispose, layout: layout, refresh: refresh, openTime: openTime };
})();
