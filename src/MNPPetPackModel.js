// 桌宠包的数据边界；同一校验器用于导入页面、原生保存和构建。
var MNPPetPackModel = (function () {
  var ids = ["idle", "wave", "happy", "shy", "sleep", "bow", "drag", "step"];
  var limits = { file: 2 * 1024 * 1024, total: 8 * 1024 * 1024, transfer: 12 * 1024 * 1024, zip: 10 * 1024 * 1024, chunk: 32768 };
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
  function requireValue(ok, message) { if (!ok) throw new Error(message); }
  function label(value, max) { return typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\x00-\x1f\x7f]/.test(value); }
  function manifest(value) {
    requireValue(value && value.schema === 1 && value.format === "animated-webp", "不支持的桌宠包格式，请使用第 1 版 WebP 动作包");
    requireValue(label(value.name, 24) && label(value.author, 80) && label(value.version, 32) && typeof value.id === "string" && /^[a-z0-9][a-z0-9-]{0,63}$/.test(value.id), "桌宠包名称、作者或标识无效");
    requireValue(Number.isInteger(value.frameSize) && value.frameSize >= 64 && value.frameSize <= 256 && value.poster === "poster.png", "桌宠画布应为 64–256 像素的正方形，封面应为 poster.png");
    requireValue(typeof value.visualAnchorX === "number" && isFinite(value.visualAnchorX) && value.visualAnchorX >= 0 && value.visualAnchorX <= 1, "桌宠中心位置无效");
    requireValue(Array.isArray(value.actions) && value.actions.length >= 1 && value.actions.length <= ids.length, "桌宠包缺少动作清单");
    var seen = {}, actions = value.actions.map(function (a) {
      requireValue(a && ids.indexOf(a.id) >= 0 && !seen[a.id] && label(a.label, 24) && a.file === "actions/" + a.id + ".webp", "动作名称、路径无效或重复"); seen[a.id] = true;
      requireValue(Number.isInteger(a.count) && a.count >= 1 && a.count <= 120 && typeof a.duration === "number" && isFinite(a.duration) && a.duration > 0 && a.duration <= 20, "每个动作最多 120 帧、20 秒");
      return { id: a.id, label: a.label.trim(), file: a.file, count: a.count, duration: a.duration };
    });
    requireValue(seen.idle, "桌宠包必须包含 idle 待机动作");
    return { schema: 1, id: value.id, name: value.name.trim(), author: value.author.trim(), version: value.version,
      format: "animated-webp", frameSize: value.frameSize, visualAnchorX: value.visualAnchorX, poster: "poster.png", actions: actions };
  }
  function paths(meta) { return [meta.poster].concat(meta.actions.map(function (a) { return a.file; })); }
  function decode(text) {
    requireValue(typeof text === "string" && text.length > 0 && text.length <= Math.ceil(limits.file / 3) * 4 && text.length % 4 === 0 && /^[A-Za-z0-9+/]+={0,2}$/.test(text), "桌宠素材编码无效或单个文件超过 2 MiB");
    var bytes = new Uint8Array(text.length / 4 * 3 - (text.endsWith("==") ? 2 : text.endsWith("=") ? 1 : 0)), at = 0;
    for (var i = 0; i < text.length; i += 4) {
      var n = (alphabet.indexOf(text[i]) << 18) | (alphabet.indexOf(text[i + 1]) << 12) | (Math.max(0, alphabet.indexOf(text[i + 2])) << 6) | Math.max(0, alphabet.indexOf(text[i + 3]));
      if (at < bytes.length) bytes[at++] = n >>> 16; if (at < bytes.length) bytes[at++] = n >>> 8; if (at < bytes.length) bytes[at++] = n;
    }
    requireValue(bytes.length <= limits.file && encode(bytes) === text, "桌宠素材编码不完整"); return bytes;
  }
  function encode(bytes) {
    var result = [], chunk = "";
    for (var i = 0; i < bytes.length; i += 3) {
      var n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      chunk += alphabet[n >>> 18] + alphabet[(n >>> 12) & 63] + (i + 1 < bytes.length ? alphabet[(n >>> 6) & 63] : "=") + (i + 2 < bytes.length ? alphabet[n & 63] : "=");
      if (chunk.length >= 8192) { result.push(chunk); chunk = ""; }
    }
    result.push(chunk); return result.join("");
  }
  function ascii(bytes, at, length) { return String.fromCharCode.apply(null, bytes.subarray(at, at + length)); }
  function uint(bytes, at, n) { var value = 0; for (var i = n - 1; i >= 0; i--) value = value * 256 + bytes[at + i]; return value; }
  function asset(meta, file, bytes) {
    requireValue(bytes.length > 0 && bytes.length <= limits.file, "单个素材超过 2 MiB 或为空");
    if (file === meta.poster) {
      requireValue(bytes.length >= 33 && Array.prototype.join.call(bytes.subarray(0, 8), ",") === "137,80,78,71,13,10,26,10" && ascii(bytes, 12, 4) === "IHDR" &&
        (bytes[16] * 16777216 + bytes[17] * 65536 + bytes[18] * 256 + bytes[19]) === meta.frameSize && (bytes[20] * 16777216 + bytes[21] * 65536 + bytes[22] * 256 + bytes[23]) === meta.frameSize, "封面必须是与画布等大的 PNG"); return;
    }
    var action = meta.actions.find(function (a) { return a.file === file; });
    requireValue(action && bytes.length >= 30 && ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 4) === "WEBP" && uint(bytes, 4, 4) + 8 === bytes.length, "动作必须是完整的 WebP 文件");
    var frames = 0, duration = 0, canvas = false, animation = false;
    for (var at = 12; at < bytes.length;) {
      requireValue(at + 8 <= bytes.length, "WebP 动作数据截断");
      var kind = ascii(bytes, at, 4), size = uint(bytes, at + 4, 4), start = at + 8;
      requireValue(start + size <= bytes.length, "WebP 动作数据截断");
      if (kind === "VP8X") { requireValue(size === 10 && uint(bytes, start + 4, 3) + 1 === meta.frameSize && uint(bytes, start + 7, 3) + 1 === meta.frameSize, "动作尺寸与画布不一致"); canvas = true; }
      if (kind === "ANIM") { requireValue(size === 6 && uint(bytes, start + 4, 2) === 0, "动作 WebP 应设置为无限循环"); animation = true; }
      if (kind === "ANMF") {
        requireValue(size >= 16 && uint(bytes, start, 3) * 2 + uint(bytes, start + 6, 3) + 1 <= meta.frameSize && uint(bytes, start + 3, 3) * 2 + uint(bytes, start + 9, 3) + 1 <= meta.frameSize, "WebP 动作帧不完整或超出画布");
        frames++; duration += uint(bytes, start + 12, 3);
      }
      at = start + size + (size % 2); requireValue(at <= bytes.length, "WebP 动作填充不完整");
    }
    requireValue(canvas && animation && frames === action.count && Math.abs(duration / 1000 - action.duration) < .002, "动作的帧数或时长与清单不一致");
  }
  function record(value) {
    requireValue(value && value.schema === 1 && value.files && typeof value.files === "object" && !Array.isArray(value.files), "桌宠包数据无效");
    var meta = manifest(value.manifest), names = paths(meta), total = 0, files = {};
    requireValue(Object.keys(value.files).length === names.length, "桌宠包文件清单不一致");
    names.forEach(function (file) { var bytes = decode(value.files[file]); total += bytes.length; requireValue(total <= limits.total, "桌宠素材总大小不能超过 8 MiB"); asset(meta, file, bytes); files[file] = value.files[file]; });
    requireValue(typeof value.license === "string" && value.license.length <= 65536, "桌宠包缺少许可说明或说明过长");
    return { schema: 1, manifest: meta, files: files, license: value.license };
  }
  return { limits: limits, manifest: manifest, paths: paths, decode: decode, encode: encode, asset: asset, record: record };
})();
