var MNPPetInteraction = (function () {
  function reset(s) {
    if (!s.view) return;
    var frame = { x: 0, y: 0, width: s.view.frame.width, height: s.view.frame.height };
    if (s.imageView) s.imageView.frame = frame;
    if (s.animationUI && s.animationUI.view) s.animationUI.view.frame = frame;
  }
  // 收起一次性动画与拖动状态；动作记忆交回状态机，避免下次同步重复下发素材。
  function stop(s) {
    MNPPetOverlay.cancelTimer(s, 'petActionTimer'); MNPPetOverlay.cancelTimer(s, 'petBounceTimer');
    s.petPressed = false; s.petSquash = null; s.petDragging = false; s.petActionHold = false;
    s.petActionId = s.petActionTarget || 'idle';
    reset(s);
  }
  function mounted(s) { return !s.destroyed && s.active && s.settings.visible && s.view && s.view.superview; }
  function layout(s) {
    if (!s.petSquash || !s.view || !s.imageView) return;
    var size = s.view.frame.width, amount = s.petSquash.value;
    var width = size * (1 + .10 * amount), height = size * (1 - .18 * amount);
    // 只拉伸图片，底部锚点、桌宠位置、菜单和触摸区域保持不动。
    s.imageView.frame = { x: (size - width) / 2, y: size - height, width: width, height: height };
  }
  function advance(state, seconds) {
    var omega = state.target ? 28 : 20, damping = state.target ? 1 : .45;
    var offset = state.value - state.target, velocity = state.velocity, decay = Math.exp(-damping * omega * seconds);
    if (damping === 1) {
      var k = velocity + omega * offset;
      state.value = state.target + (offset + k * seconds) * decay;
      state.velocity = (velocity - omega * k * seconds) * decay;
    } else {
      var a = damping * omega, w = omega * Math.sqrt(1 - damping * damping), c = (velocity + a * offset) / w;
      var cos = Math.cos(w * seconds), sin = Math.sin(w * seconds);
      state.value = state.target + decay * (offset * cos + c * sin);
      state.velocity = decay * (velocity * cos - (a * c + w * offset) * sin);
    }
  }
  function animate(s, state) {
    function tick() {
      if (s.petSquash !== state) return;
      if (!mounted(s)) { stop(s); return; }
      var now = Date.now(); advance(state, Math.max(0, now - state.last) / 1000); state.last = now;
      if (Math.abs(state.value - state.target) < .002 && Math.abs(state.velocity) < .03) {
        if (!s.petPressed) { stop(s); return; }
        state.value = 1; state.velocity = 0; layout(s); return;
      }
      layout(s); MNPPetOverlay.schedule(s, 'petBounceTimer', 1 / 60, tick);
    }
    tick();
  }
  function press(s, sender) {
    if (sender !== s.view || s.settings.source !== 'builtin' || !mounted(s) || s.dragOrigin || Date.now() < (s.suppressTapUntil || 0)) return;
    MNPPetOverlay.cancelTimer(s, 'petBounceTimer');
    // 保留当前位置和速度，连续按压可从回弹中自然接续。
    var old = s.petSquash;
    var state = { value: old ? old.value : 0, velocity: old ? old.velocity : 0, target: 1, last: Date.now() };
    s.petSquash = state; s.petPressed = true; s.petActionId = 'squash';
    if (!old) advance(state, 1 / 120);
    animate(s, state);
  }
  function release(s, sender) {
    if (sender !== s.view || !s.petPressed || !s.petSquash) return;
    MNPPetOverlay.cancelTimer(s, 'petBounceTimer');
    var old = s.petSquash;
    // 松手前先推进按住阶段，避免触摸事件落在两帧之间时跳变。
    advance(old, Math.max(0, Date.now() - old.last) / 1000);
    s.petPressed = false;
    s.petSquash = { value: old.value, velocity: old.velocity, target: 0, last: Date.now() };
    animate(s, s.petSquash);
  }
  function bounce(s) {
    var started = Date.now(); s.petActionId = 'bounce';
    function tick() {
      if (!mounted(s)) { stop(s); return; }
      var progress = Math.min(1, Math.max(0, Date.now() - started) / 600);
      if (progress >= 1) { stop(s); return; }
      // 只改变显示图片，不改变桌宠位置和手势范围；待机动画也可继续播放。
      var amount = Math.sin(progress * Math.PI), size = s.view.frame.width, side = size * (1 - .06 * amount);
      var frame = { x: (size - side) / 2, y: (size - side) / 2 - size * .07 * amount, width: side, height: side };
      s.imageView.frame = frame;
      if (s.animationUI && s.animationUI.view) s.animationUI.view.frame = frame;
      MNPPetOverlay.schedule(s, 'petBounceTimer', 1 / 30, tick);
    }
    tick();
  }
  function tap(s, gesture) {
    if (!gesture || gesture.state !== 3 || !mounted(s) || s.dragOrigin || Date.now() < (s.suppressTapUntil || 0)) return;
    MNPMenu.revealButton(s);
    MNPPetBubble.toggle(s);
    if (s.settings.source === 'builtin') {
      if (s.petPressed) release(s, s.view);
      else if (!s.petSquash) { press(s, s.view); release(s, s.view); }
      return;
    }
    stop(s);
    var actions = s.settings.source === 'pack' && s.petPack ? s.petPack.manifest.actions : [];
    // 点击反馈优先播放下表中任意一个；四类状态动作不参与随机，避免打断计时语义。
    // 动作清单本身受 MNPPetPackModel 白名单约束，枚举完仍为空就说明包里只有状态动作。
    var pool = actions.filter(function (action) { return ['happy', 'wave', 'shy', 'bow', 'sleep', 'step'].indexOf(action.id) >= 0; });
    if (!pool.length) { bounce(s); return; }
    var action = pool[Math.floor(Math.random() * pool.length)]; s.petActionId = action.id;
    // 点击反馈期间挂起计时状态同步，播完后再交还状态机。
    MNPPetAction.hold(s, true);
    MNPPetAnimationPlayer.play(s, action, false);
    MNPPetOverlay.schedule(s, 'petActionTimer', action.duration, function () {
      MNPPetAction.hold(s, false);
      if (!mounted(s) || s.settings.source !== 'pack' || !s.petPack) return;
      MNPPetAction.refresh(s);
    });
  }
  return { tap: tap, press: press, release: release, layout: layout, stop: stop };
})();
