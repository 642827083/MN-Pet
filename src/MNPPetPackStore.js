var MNPPetPackStore = (function () {
  var sequence = 0;
  function storage() {
    return MNPPetStorage.open();
  }
  function member(obj, key) { return obj && typeof obj[key] === "function" ? obj[key]() : obj && obj[key]; }
  function read() {
    try {
      var store = storage(), file = store.root + "/pet-pack.json";
      if (!store.manager.fileExistsAtPath(file)) return { record: null, warning: "" };
      var data = store.manager.contentsAtPath(file);
      if (!data || Number(member(data, "length")) > MNPPetPackModel.limits.transfer) throw new Error("桌宠包存档过大或不可读");
      var raw = NSJSONSerialization.JSONObjectWithDataOptions(data, 0);
      if (raw && raw.schema === 1 && raw.deleted === true && typeof raw.revision === 'string' && raw.revision.length > 0 && raw.revision.length <= 64) return { record: null, revision: raw.revision, warning: '' };
      var value = MNPPetPackModel.record(raw);
      if (typeof raw.revision !== "string" || raw.revision.length > 64) throw new Error("桌宠包版本标识无效");
      value.revision = raw.revision; return { record: value, warning: "" };
    } catch (error) { return { record: null, warning: "桌宠包读取失败，请重新导入 .mnpet 文件。" }; }
  }
  function snapshot(record) { return record ? { manifest: record.manifest, revision: record.revision } : null; }
  function remove(expected) {
    var current = read();
    if (current.warning) throw new Error(current.warning);
    if (!current.record || typeof expected !== 'string' || expected !== current.record.revision) throw new Error('桌宠已变化，请重新打开设置后删除');
    var record = { schema: 1, deleted: true, revision: Date.now() + '-' + (++sequence) };
    MNPPetStorage.erase(storage(), 'pet-pack.json', 'pet-pack-poster.png', record);
    return record;
  }
  function poster(record) {
    var base64 = record.files[record.manifest.poster], bytes = MNPPetPackModel.decode(base64), chunks = [], data;
    if (typeof NSData === "undefined" || typeof UIImage === "undefined") throw new Error("当前 MN 无法加载桌宠封面");
    if (typeof NSData.dataWithStringEncoding === "function") {
      for (var i = 0; i < bytes.length; i += 4096) chunks.push(String.fromCharCode.apply(null, bytes.subarray(i, i + 4096)));
      data = NSData.dataWithStringEncoding(chunks.join(""), 5);
    } else if (typeof NSData.dataWithBytesLength === "function") data = NSData.dataWithBytesLength(Array.prototype.slice.call(bytes), bytes.length);
    if (!data || Number(member(data, "length")) !== bytes.length || member(data, "base64Encoding") !== base64) throw new Error("桌宠封面数据转换失败");
    var image;
    if (typeof UIImage.imageWithData === "function") image = UIImage.imageWithData(data);
    else {
      var store = storage(); mkdir(store);
      if (!data.writeToFileAtomically(store.root + "/pet-pack-poster.png", true)) throw new Error("桌宠封面缓存写入失败");
      image = UIImage.imageWithContentsOfFile(store.root + "/pet-pack-poster.png");
    }
    var size = member(image, "size");
    if (!image || !size || Number(size.width) !== record.manifest.frameSize || Number(size.height) !== record.manifest.frameSize) throw new Error("MN 无法解码桌宠封面");
    return image;
  }
  function mkdir(store) {
    if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error("无法创建桌宠包目录");
  }
  function cancel(session) { session.petPackTransfer = null; MNPPetOverlay.cancelTimer(session, "packImportTimer"); }
  function receive(session, payload) {
    payload = payload || {};
    if (payload.phase === "begin") {
      if (typeof payload.id !== "string" || !/^[a-zA-Z0-9-]{1,64}$/.test(payload.id) || typeof payload.expectedRevision !== "string" || !Number.isSafeInteger(payload.length) || payload.length < 100 || payload.length > MNPPetPackModel.limits.transfer) throw new Error("桌宠包传输信息无效");
      session.petPackTransfer = { id: payload.id, expected: payload.expectedRevision, length: payload.length, offset: 0, chunks: [] };
      MNPPetOverlay.schedule(session, "packImportTimer", 120, function () { session.petPackTransfer = null; }); return null;
    }
    var transfer = session.petPackTransfer;
    if (!transfer || transfer.id !== payload.id) throw new Error("桌宠包传输已过期，请重新导入");
    if (payload.phase === "chunk") {
      if (payload.offset !== transfer.offset || typeof payload.text !== "string" || !payload.text.length || payload.text.length > MNPPetPackModel.limits.chunk || transfer.offset + payload.text.length > transfer.length) throw new Error("桌宠包传输顺序无效");
      transfer.chunks.push(payload.text); transfer.offset += payload.text.length; return null;
    }
    cancel(session);
    if (payload.phase !== "finish" || transfer.offset !== transfer.length) throw new Error("桌宠包尚未完整传输");
    var record = MNPPetPackModel.record(JSON.parse(transfer.chunks.join(""))), current = read();
    if ((current.record ? current.record.revision : current.revision || "") !== transfer.expected) throw new Error("桌宠包已在其他面板更新，请重新打开设置后导入");
    poster(record); // 保存前确认宿主能解码封面；失败不替换当前角色。
    record.revision = Date.now() + "-" + (++sequence);
    var store = storage(); mkdir(store);
    var data = NSJSONSerialization.dataWithJSONObjectOptions(record, 0);
    if (!data || !data.writeToFileAtomically || !data.writeToFileAtomically(store.root + "/pet-pack.json", true)) throw new Error("桌宠包保存失败，已保留原角色");
    return record;
  }
  function asset(session, payload) {
    var record = session.petPack;
    if (!record || !payload || payload.revision !== record.revision || MNPPetPackModel.paths(record.manifest).indexOf(payload.file) < 0 || !Number.isSafeInteger(payload.offset) || payload.offset < 0) throw new Error("桌宠素材已变化，请重新打开设置");
    var text = record.files[payload.file];
    if (payload.offset >= text.length) throw new Error("桌宠素材读取位置无效");
    return { ok: true, revision: record.revision, offset: payload.offset, total: text.length, chunk: text.slice(payload.offset, payload.offset + MNPPetPackModel.limits.chunk) };
  }
  return { read: read, snapshot: snapshot, poster: poster, receive: receive, cancel: cancel, asset: asset, remove: remove };
})();
