var MNPPetImageStore = (function () {
  var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/", maxBytes = 512 * 1024, sequence = 0;
  function empty() { return { schema: 1, enabled: false, name: "我的桌宠", style: "still", anchorX: 0.5, base64: "", revision: "" }; }
  function member(obj, key) { return obj && typeof obj[key] === "function" ? obj[key]() : obj && obj[key]; }
  function metadata(value) {
    if (!value || typeof value !== "object" || typeof value.name !== "string" || !value.name.trim() || value.name.length > 24 || /[\x00-\x1f\x7f]/.test(value.name)) throw new Error("请输入 1–24 字的桌宠名称");
    if (value.style !== "still") throw new Error("图片桌宠只支持静态显示");
    if (typeof value.anchorX !== "number" || !isFinite(value.anchorX) || value.anchorX < 0 || value.anchorX > 1) throw new Error("图片中心信息无效，请重新裁剪");
    return { name: value.name.trim(), style: value.style, anchorX: value.anchorX };
  }
  function decode(value) {
    if (typeof value !== "string" || value.length < 44 || value.length > Math.ceil(maxBytes / 3) * 4 || value.length % 4 || !/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(value)) throw new Error("桌宠图片编码无效或超过 512 KiB");
    var bytes = [], buffer = 0, bits = 0;
    for (var i = 0; i < value.length && value[i] !== "="; i++) {
      buffer = (buffer << 6) | alphabet.indexOf(value[i]); bits += 6;
      if (bits >= 8) { bits -= 8; bytes.push((buffer >> bits) & 255); }
    }
    function uint(at) { return bytes[at] * 16777216 + bytes[at + 1] * 65536 + bytes[at + 2] * 256 + bytes[at + 3]; }
    if (bytes.length > maxBytes || bytes.slice(0, 8).join(",") !== "137,80,78,71,13,10,26,10" ||
        bytes.slice(12, 16).join(",") !== "73,72,68,82" || uint(16) !== 256 || uint(20) !== 256) throw new Error("请使用裁剪后的 256×256 PNG 图片");
    return bytes;
  }
  function storage() {
    return MNPPetStorage.open();
  }
  function read() {
    var fallback = empty();
    // 未启用自定义角色时，不让文件接口缺失影响其他角色。
    if (typeof NSFileManager === "undefined" || typeof NSData === "undefined" || typeof NSJSONSerialization === "undefined") return { record: fallback, warning: "" };
    try {
      var store = storage(), file = store.root + "/custom-pet.json";
      if (!store.manager.fileExistsAtPath(file)) return { record: fallback, warning: "" };
      var data = store.manager.contentsAtPath(file);
      if (!data || Number(member(data, "length")) > 800000) throw new Error("自定义桌宠文件过大或无法读取");
      var value = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
      if (!value || value.schema !== 1 || typeof value.enabled !== "boolean" || typeof value.base64 !== "string" || typeof value.revision !== "string" || value.revision.length > 64) throw new Error("自定义桌宠文件格式无效");
      metadata(value); if (value.base64) decode(value.base64);
      if (value.enabled && !value.base64) throw new Error("自定义桌宠缺少图片");
      return { record: value, warning: "" };
    } catch (error) { return { record: fallback, warning: "自定义角色读取失败，请重新导入图片或桌宠包。" }; }
  }
  function image(record) {
    if (!record.enabled || !record.base64) return null;
    if (typeof NSData === "undefined" || typeof UIImage === "undefined") throw new Error("无法加载桌宠图片（IMG-01：缺少 NSData 或 UIImage）");
    var bytes = decode(record.base64), data, result;
    if (typeof NSData.dataWithStringEncoding === "function") {
      // ISO Latin 1 的每个字符对应一个原始字节；UTF-8 会改变 PNG 中大于 127 的字节。
      var chunks = [];
      for (var i = 0; i < bytes.length; i += 4096) chunks.push(String.fromCharCode.apply(null, bytes.slice(i, i + 4096)));
      data = NSData.dataWithStringEncoding(chunks.join(""), 5);
    } else if (typeof NSData.dataWithBytesLength === "function") data = NSData.dataWithBytesLength(bytes, bytes.length);
    else throw new Error("无法加载桌宠图片（IMG-02：缺少字节与字符串数据转换接口）");
    if (!data || Number(member(data, "length")) !== bytes.length || member(data, "base64Encoding") !== record.base64) throw new Error("图片数据转换失败（IMG-03），请反馈这条提示");
    if (typeof UIImage.imageWithData === "function") result = UIImage.imageWithData(data);
    else if (typeof UIImage.imageWithContentsOfFile === "function") {
      // 与动作角色使用相同的文件解码接口；此文件可由 JSON 原件随时重建。
      var store = storage(), file = store.root + "/custom-pet-image.png";
      if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error("无法创建自定义桌宠目录");
      if (!data.writeToFileAtomically || !data.writeToFileAtomically(file, true)) throw new Error("桌宠图片保存失败，已保留原角色");
      result = UIImage.imageWithContentsOfFile(file);
    } else throw new Error("无法加载桌宠图片（IMG-04：缺少内存与文件图片解码接口）");
    var size = result && member(result, "size");
    if (!result || !size || Number(size.width) !== 256 || Number(size.height) !== 256) throw new Error("MN 无法解码这张桌宠图片，请重新选择图片");
    return result;
  }
  function write(value, expected) {
    var current = read().record;
    if (typeof expected !== "string" || current.revision !== expected) throw new Error("桌宠已在其他面板更新，请重新打开设置后再保存");
    var store = storage(), meta = metadata(value), record = { schema: 1, enabled: value.enabled === true, name: meta.name, style: meta.style, anchorX: meta.anchorX,
      base64: value.base64, revision: Date.now() + "-" + (++sequence) };
    if (typeof record.base64 !== "string" || (!record.base64 && record.enabled)) throw new Error("请先选择桌宠图片");
    if (record.enabled) image(record); else if (record.base64) decode(record.base64);
    if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error("无法创建自定义桌宠目录");
    var data = NSJSONSerialization.dataWithJSONObjectOptions(record, 0);
    if (!data || !data.writeToFileAtomically || !data.writeToFileAtomically(store.root + "/custom-pet.json", true)) throw new Error("桌宠保存失败，已保留原角色");
    return record;
  }
  function snapshot(record) {
    record = record || empty();
    return { enabled: record.enabled, hasImage: !!record.base64, name: record.name, style: record.style, anchorX: record.anchorX, revision: record.revision };
  }
  function remove(expected) {
    var current = read();
    if (current.warning) throw new Error(current.warning);
    if (!current.record.base64 || typeof expected !== 'string' || expected !== current.record.revision) throw new Error('桌宠已变化，请重新打开设置后删除');
    var record = empty(); record.revision = Date.now() + '-' + (++sequence);
    MNPPetStorage.erase(storage(), 'custom-pet.json', 'custom-pet-image.png', record);
    return record;
  }
  function receive(session, payload) {
    payload = payload || {};
    var transfer = session.customPetTransfer;
    if (payload.phase === "begin") {
      metadata(payload);
      if (typeof payload.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(payload.id) || typeof payload.expectedRevision !== "string" ||
          !Number.isSafeInteger(payload.length) || payload.length < 44 || payload.length > Math.ceil(maxBytes / 3) * 4 || payload.length % 4) throw new Error("图片传输信息无效");
      session.customPetTransfer = { id: payload.id, length: payload.length, meta: metadata(payload), expected: payload.expectedRevision, chunks: [], offset: 0 };
      MNPPetOverlay.schedule(session, "customImportTimer", 60, function () { session.customPetTransfer = null; });
      return null;
    }
    if (!transfer || transfer.id !== payload.id) throw new Error("图片传输已过期，请重新保存");
    if (payload.phase === "chunk") {
      if (payload.offset !== transfer.offset || typeof payload.text !== "string" || !payload.text.length || payload.text.length > 32768 || transfer.offset + payload.text.length > transfer.length) throw new Error("图片传输顺序无效，请重新保存");
      transfer.chunks.push(payload.text); transfer.offset += payload.text.length; return null;
    }
    session.customPetTransfer = null; MNPPetOverlay.cancelTimer(session, "customImportTimer");
    if (payload.phase !== "finish" || transfer.offset !== transfer.length) throw new Error("图片传输未完成，请重新保存");
    return write(Object.assign({}, transfer.meta, { enabled: true, base64: transfer.chunks.join("") }), transfer.expected);
  }
  return { empty: empty, read: read, write: write, image: image, snapshot: snapshot, receive: receive, remove: remove,
    name: function (session) { return session.customPet && session.customPet.enabled ? session.customPet.name : session.petPack ? session.petPack.manifest.name : "桌宠"; },
    anchor: function (session) { return session.customPet && session.customPet.enabled ? session.customPet.anchorX : session.petPack ? session.petPack.manifest.visualAnchorX : 0.5; } };
})();
