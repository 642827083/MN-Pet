var MNPPetAnimationPlayer = (function () {
  function matches(s, view) { return !!(s && s.animationUI && s.animationUI.view === view); }
  function clearBackgrounds(view) {
    var seen = [], clear = UIColor.clearColor();
    function visit(current, depth) {
      if (!current || depth > 6 || seen.length >= 48 || seen.indexOf(current) >= 0) return;
      seen.push(current);
      current.backgroundColor = clear; current.opaque = false;
      var layer = member(current,"layer");
      if (layer && typeof layer.opaque === "boolean") layer.opaque = false;
      var children = member(current,"subviews"), count = children && (typeof children.length === "number" ? children.length : Number(member(children,"count")));
      for (var i = 0; i < count && seen.length < 48; i++) visit(children[i] || (typeof children.objectAtIndex === "function" ? children.objectAtIndex(i) : null),depth+1);
      // 部分宿主使用包装视图，scrollView 不一定直接出现在 subviews 中。
      visit(member(current,"scrollView"),depth+1);
    }
    visit(view,0);
  }
  function transparent(s,ui) {
    try { clearBackgrounds(ui.view); return true; }
    catch (error) { fail(s,ui,"（ANIM-06：无法设置播放视图透明背景）"); return false; }
  }
  function layout(s) {
    var ui = s.animationUI;
    if (!ui || !ui.view || !s.view) return;
    var size = s.view.frame.width+"x"+s.view.frame.height;
    if (ui.size === size) return;
    ui.size = size; ui.view.frame = {x:0,y:0,width:s.view.frame.width,height:s.view.frame.height};
    transparent(s,ui);
  }
  function dispose(s) {
    MNPPetOverlay.cancelTimer(s, "animationTimer");
    MNPPetOverlay.cancelTimer(s, "animationBackgroundTimer");
    var ui = s.animationUI; s.animationUI = null;
    if (ui && ui.view) {
      ui.view.delegate = null;
      try { ui.view.evaluateJavaScript("MNPPetAnimation.stop()", null); ui.view.stopLoading(); } catch (error) { /* 视图已被宿主释放。 */ }
      ui.view.removeFromSuperview(); ui.view = null;
    }
    if (s.imageView) s.imageView.hidden = false;
  }
  function fail(s, ui, message) {
    if (s.animationUI !== ui || s.destroyed) return;
    dispose(s); s.animationWarning = "单文件动画暂不可用，已显示静态角色。" + message;
    MNPPetOverlay.publish(s);
  }
  function active(s, ui, token) { return !s.destroyed && s.active && s.settings.visible && s.animationUI === ui && ui.token === token; }
  function settleBackground(s,ui,token,pass) {
    MNPPetOverlay.schedule(s,"animationBackgroundTimer",pass === 0 ? .05 : .2,function () {
      if (!active(s,ui,token) || !transparent(s,ui)) return;
      if (pass === 0) settleBackground(s,ui,token,1);
    });
  }
  function send(s, ui) {
    if (ui.status !== "ready" || !ui.target || !ui.view) return;
    var token = ui.token, action = ui.target, attempts = 0;
    function check(result) {
      if (!active(s, ui, token)) return;
      if (result === "ready:" + token) {
        MNPPetOverlay.cancelTimer(s,"animationTimer");
        if (!transparent(s,ui)) return;
        ui.acknowledged = token; ui.view.hidden = false; s.imageView.hidden = true; s.animationWarning = "";
        settleBackground(s,ui,token,0); MNPPetOverlay.publish(s); return;
      }
      if (result === "failed:" + token || ++attempts >= 60) { fail(s,ui,"（ANIM-03：动作图片未就绪）"); return; }
      MNPPetOverlay.schedule(s,"animationTimer",.1,function () {
        if (!active(s,ui,token)) return;
        try { ui.view.evaluateJavaScript("MNPPetAnimation.status()",check); } catch (error) { fail(s,ui,"（ANIM-04：播放通信失败）"); }
      });
    }
    try { ui.view.evaluateJavaScript("MNPPetAnimation.play(" + JSON.stringify({ id: action, base64: s.petPack.files[s.petPack.manifest.actions.find(function (a) { return a.id === action; }).file] }) + "," + token + ")",check); }
    catch (error) { fail(s,ui,"（ANIM-04：播放通信失败）"); }
  }
  function play(s, action, still) {
    MNPPetOverlay.cancelTimer(s,"animationBackgroundTimer");
    s.animationWarning = "";
    if (still) { dispose(s); return; }
    var ui = s.animationUI;
    if (!ui) {
      ui = {view:null,status:"loading",token:0,target:action.id}; s.animationUI = ui;
      try {
        if (typeof UIWebView === "undefined" || typeof NSURL === "undefined" || !NSURL.fileURLWithPath) throw new Error("缺少本地动画视图接口");
        ui.root = s.mainPath.replace(/\/$/, "") + "/";
        ui.view = new UIWebView({x:0,y:0,width:s.view.frame.width,height:s.view.frame.height});
        if (!ui.view.loadFileURLAllowingReadAccessToURL || !ui.view.evaluateJavaScript) throw new Error("缺少本地动画加载接口");
        ui.view.backgroundColor = UIColor.clearColor(); ui.view.opaque = false; ui.view.hidden = true;
        ui.view.scalesPageToFit = false; ui.view.dataDetectorTypes = 0;
        var scroll = ui.view.scrollView;
        if (scroll) { scroll.backgroundColor = UIColor.clearColor(); if (typeof scroll.scrollEnabled === "boolean") scroll.scrollEnabled = false; }
        if (!transparent(s,ui)) return;
        if (typeof ui.view.userInteractionEnabled === "boolean") ui.view.userInteractionEnabled = false;
        ui.view.delegate = s.context; s.view.addSubview(ui.view);
        MNPPetOverlay.schedule(s,"animationTimer",8,function () { fail(s,ui,"（ANIM-01：动画页面未就绪）"); });
        ui.view.loadFileURLAllowingReadAccessToURL(NSURL.fileURLWithPath(ui.root+"web-dist/pet-motion/index.html"),NSURL.fileURLWithPath(ui.root));
      } catch (error) { fail(s,ui,"（ANIM-02：" + String(error.message || error) + "）"); return; }
    }
    ui.target = action.id; ui.token++; layout(s); send(s,ui);
  }
  function loaded(s, view) {
    if (!matches(s,view)) return;
    var ui = s.animationUI;
    if (ui.status !== "loading") return;
    MNPPetOverlay.cancelTimer(s,"animationTimer");
    if (!transparent(s,ui)) return;
    ui.status = "ready"; send(s,ui);
  }
  function member(o,k) { return o && (typeof o[k] === "function" ? o[k]() : o[k]); }
  function allow(s,view,request) {
    if (!matches(s,view)) return false;
    var url = member(request,"URL");
    return String(member(url,"scheme")) === "file" && String(member(url,"path")) === s.animationUI.root+"web-dist/pet-motion/index.html";
  }
  return {play:play,layout:layout,dispose:dispose,matches:matches,loaded:loaded,allow:allow,clearBackgrounds:clearBackgrounds,
    failed:function (s,view) { if (matches(s,view)) fail(s,s.animationUI,"（ANIM-05：本地页面加载失败）"); }};
})();
