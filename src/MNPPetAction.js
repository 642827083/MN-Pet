// 桌宠动作状态机：待机、专注、休息、拖动各对应一个动作，缺少对应动作时回落到待机。
var MNPPetAction = (function () {
  function actions(s) { return s.settings.source === 'pack' && s.petPack ? s.petPack.manifest.actions : null; }
  function pick(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  function mounted(s) { return !s.destroyed && !!(s.view && s.view.superview && s.active && s.settings.visible); }
  // 拖动优先；未开始、暂停或完成后一律回到待机，只有运行中才区分专注与休息。
  function target(s, state) {
    if (s.petDragging) return 'drag';
    if (!state || state.status !== 'running') return 'idle';
    return state.phase === 'work' ? 'focus' : 'rest';
  }
  function state(s) {
    try { var view = MNPFocusRuntime.current(s); return view && view.state ? view.state : null; }
    catch (error) { return null; }
  }
  // 桌宠包缺少目标动作时回落到待机；两者都没有就保持现状。
  function resolve(s, id) {
    var list = actions(s);
    if (!list) return '';
    var action = pick(list, id) || pick(list, 'idle');
    return action ? action.id : '';
  }
  function apply(s, id) {
    var action = pick(actions(s) || [], id);
    s.petActionTarget = id; s.petActionId = id;
    if (action && mounted(s)) MNPPetAnimationPlayer.play(s, action, false);
    return id;
  }
  // 挂载、拖动结束、点击动画结束等时刻强制按当前状态重播，不复用上一次的动作记忆。
  function refresh(s) {
    if (!actions(s)) return '';
    return apply(s, resolve(s, target(s, state(s))));
  }
  // 每秒推送时调用：只有目标动作变化才重新播放，避免重复下发整段素材。
  function sync(s, focus) {
    if (!actions(s) || s.petActionHold || !mounted(s)) return s.petActionTarget || '';
    var id = resolve(s, target(s, focus && focus.state ? focus.state : focus));
    if (!id || id === s.petActionTarget) return id;
    return apply(s, id);
  }
  function drag(s, on) {
    s.petDragging = !!on;
    // 图片桌宠和自带桌宠没有动作素材，拖动只记状态，不去改写动作记忆。
    if (!actions(s)) return '';
    if (on) return apply(s, resolve(s, 'drag') || 'idle');
    return refresh(s);
  }
  // 点击反馈等一次性动画播放期间挂起状态同步，结束后再交还给状态机。
  function hold(s, value) { s.petActionHold = !!value; }
  return { sync: sync, refresh: refresh, drag: drag, hold: hold, target: target };
})();
