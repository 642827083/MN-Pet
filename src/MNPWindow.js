var MNPWindow = (function () {
  var key = "cn.marginnote.mn-pet.windowFrame";
  function frame(value) {
    if (!value) return null;
    var result = {};
    for (var i = 0; i < 4; i++) {
      var name = ["x", "y", "width", "height"][i];
      result[name] = Number(value[name]);
      if (!Number.isFinite(result[name])) return null;
    }
    return result.width > 0 && result.height > 0 ? result : null;
  }
  function parse(value) {
    try { return frame(JSON.parse(String(value || ""))); } catch (_) { return null; }
  }
  function bounds(controller) {
    var study = MNPNative.study(controller);
    return study && study.view ? frame(study.view.bounds) : null;
  }
  function clamp(value, low, high) { return Math.max(low, Math.min(high, value)); }
  function normalize(value, area, keepPosition) {
    var margin = Math.min(8, area.width / 4, area.height / 4);
    var maxWidth = Math.max(1, area.width - margin * 2);
    var maxHeight = Math.max(1, area.height - margin * 2);
    var width = clamp(value.width, Math.min(340, maxWidth), maxWidth);
    var height = clamp(value.height, Math.min(280, maxHeight), maxHeight);
    return { x: keepPosition ? value.x : clamp(value.x, area.x + margin, area.x + area.width - width - margin),
      y: keepPosition ? value.y : clamp(value.y, area.y + margin, area.y + area.height - height - margin), width: width, height: height };
  }
  function initial(area) {
    var width = Math.min(850, area.width * 0.72), height = Math.min(700, area.height * 0.78);
    return normalize({ x: area.x + (area.width - width) / 2, y: area.y + (area.height - height) / 2,
      width: width, height: height }, area);
  }
  function apply(controller, value) {
    var current = controller.view.frame;
    if (current.x !== value.x || current.y !== value.y || current.width !== value.width || current.height !== value.height) {
      controller.view.frame = value;
    }
    return value;
  }
  function layout(controller, keepPosition) {
    var area = bounds(controller);
    if (!area) return null;
    var preferred = keepPosition ? frame(controller.view.frame) : parse(controller.mnpFrameJSON);
    if (!preferred && typeof NSUserDefaults !== "undefined") {
      preferred = parse(NSUserDefaults.standardUserDefaults().objectForKey(key));
    }
    if (!preferred) preferred = initial(area);
    var value = normalize(preferred, area, keepPosition);
    controller.mnpFrameJSON = JSON.stringify(value);
    return apply(controller, value);
  }
  function save(controller) {
    var value = frame(controller.view.frame);
    if (!value) return;
    controller.mnpFrameJSON = JSON.stringify(value);
    if (typeof NSUserDefaults !== "undefined") NSUserDefaults.standardUserDefaults().setObjectForKey(controller.mnpFrameJSON, key);
  }
  function gesture(controller, recognizer, resizing) {
    var state = Number(MNPNative.value(recognizer, "state"));
    if (state !== 1 && state !== 2 && state !== 3 && state !== 4) return;
    var area = bounds(controller);
    if (!area) return;
    var translation = recognizer.translationInView(controller.view.superview);
    var dx = Number(translation.x) || 0, dy = Number(translation.y) || 0;
    var value = frame(controller.view.frame);
    if (!value) return;
    if (resizing) {
      value.width += dx; value.height += dy;
      // 缩放只约束尺寸，保留用户放置的屏幕外坐标。
      value = normalize(value, area, true);
    } else { value.x += dx; value.y += dy; }
    controller.mnpFrameJSON = JSON.stringify(value);
    apply(controller, value);
    recognizer.setTranslationInView({ x: 0, y: 0 }, controller.view.superview);
    if (state === 3 || state === 4) save(controller);
  }
  return { layout: layout, save: save, gesture: gesture };
})();
