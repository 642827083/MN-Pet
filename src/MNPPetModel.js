var MNPPetModel = (function () {
  function clamp(value, min, max, fallback) { return typeof value === 'number' && isFinite(value) ? Math.min(max, Math.max(min, value)) : fallback; }
  function normalize(raw) {
    raw = raw || {}; var p = raw.position || {};
    return { visible: typeof raw.visible === 'boolean' ? raw.visible : true,
      menuButtonMode: raw.menuButtonMode === 'tap' ? 'tap' : 'always',
      size: Math.round(clamp(raw.size, 64, 128, 112)), opacity: clamp(raw.opacity, 0.35, 1, 1),
      source: ['image', 'pack'].indexOf(raw.source) >= 0 ? raw.source : 'builtin', position: { x: clamp(p.x, 0, 1, 0.88), y: clamp(p.y, 0, 1, 0.83) } };
  }
  function read() { try { return normalize(JSON.parse(MNPNative.preference('pet.settings', '{}'))); } catch (error) { return normalize({}); } }
  function write(value) { var result = normalize(value); MNPNative.save('pet.settings', JSON.stringify(result)); return result; }
  function patch(current, changes) {
    if (!changes || typeof changes !== 'object' || Array.isArray(changes)) throw new Error('桌宠设置无效');
    var result = normalize(current);
    Object.keys(changes).forEach(function (key) {
      var value = changes[key];
      if (key === 'visible' && typeof value === 'boolean' || key === 'source' && ['builtin', 'image', 'pack'].indexOf(value) >= 0 ||
          key === 'menuButtonMode' && ['always', 'tap'].indexOf(value) >= 0 ||
          ['size', 'opacity'].indexOf(key) >= 0 && typeof value === 'number' && isFinite(value)) result[key] = value;
      else throw new Error('不支持的桌宠设置');
    });
    return normalize(result);
  }
  function region(settings, bounds) {
    var w = Math.max(1, Number(bounds.width) || 1), h = Math.max(1, Number(bounds.height) || 1);
    var size = Math.min(settings.size, w, h);
    return { size: size, left: 0, top: 0, dx: Math.max(0, w - size), dy: Math.max(0, h - size) };
  }
  function frame(settings, bounds) {
    var r = region(settings, bounds);
    return { x: r.left + settings.position.x * r.dx, y: r.top + settings.position.y * r.dy, width: r.size, height: r.size };
  }
  function position(settings, bounds, x, y) {
    var r = region(settings, bounds);
    // 窗口太小时保留原方向，恢复窗口大小后仍回到原来的边缘。
    return { x: r.dx ? clamp((x - r.left) / r.dx, 0, 1, 0.5) : settings.position.x, y: r.dy ? clamp((y - r.top) / r.dy, 0, 1, 0.5) : settings.position.y };
  }
  return { normalize: normalize, read: read, write: write, patch: patch, frame: frame, position: position };
})();
