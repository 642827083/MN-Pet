var MNPFocusStore = (function () {
  var limits = { countdownMinutes: [1, 720, 25], workMinutes: [1, 180, 25], shortBreakMinutes: [1, 60, 5], longBreakMinutes: [1, 120, 15], roundsPerCycle: [2, 12, 4] }, backupSequence = 0;
  function settings(raw) {
    raw = raw || {}; var result = {};
    Object.keys(limits).forEach(function (key) { var n = Number(raw[key]), range = limits[key]; result[key] = Number.isInteger(n) && n >= range[0] && n <= range[1] ? n : range[2]; });
    result.autoStartBreak = raw.autoStartBreak !== false; result.autoStartWork = raw.autoStartWork === true; result.alertOnFinish = raw.alertOnFinish === true;
    return result;
  }
  function name(value) { return typeof value === 'string' ? value.trim().replace(/[\x00-\x1f\x7f]/g, '').slice(0, 12) : ''; }
  function empty() { return { schema: 1, settings: settings(), subjects: ['未分类'], current: '未分类', presets: [], state: null, days: [], totalMs: 0, totalCount: 0 }; }
  function location() {
    var store = MNPPetStorage.open(); store.path = store.root + '/pomodoro.json'; return store;
  }
  function text(bytes) {
    if (typeof NSString === 'undefined' || typeof NSString.stringWithContentsOfData !== 'function') throw new Error('当前 MN 缺少计时存档文本接口');
    return NSString.stringWithContentsOfData(bytes);
  }
  function nonnegative(n) { return Number.isFinite(n) && n >= 0; }
  function validDay(d) {
    return !!d && MNPPetCountdown.validDate(d.date) && nonnegative(d.ms) && nonnegative(d.count) && Array.isArray(d.hours) && d.hours.length === 24 && d.hours.every(nonnegative) && Array.isArray(d.subjects) && d.subjects.every(function (r) { return !!r && typeof r.name === 'string' && nonnegative(r.ms) && nonnegative(r.count); });
  }
  function daySignature(d) {
    return JSON.stringify([d.date, d.ms, d.count, d.hours, d.subjects.map(function (r) { return [r.name, r.ms, r.count]; })]);
  }
  function validate(raw, recover) {
    if (!raw || raw.schema !== 1 || !Array.isArray(raw.days) || !Array.isArray(raw.subjects) || !Array.isArray(raw.presets)) throw new Error('番茄钟数据格式不支持，已保留原文件');
    if (!nonnegative(raw.totalMs) || !nonnegative(raw.totalCount) || !raw.days.every(validDay)) throw new Error('番茄钟统计数据损坏，已保留原文件');
    var repaired = false, signatures = raw.days.map(daySignature);
    raw.presets = raw.presets.filter(function (p) {
      if (p && name(p.name) && p.values && typeof p.values === 'object' && !Array.isArray(p.values)) return true;
      // 只恢复已确认的错位类型：预设项必须与一条完整统计逐字段一致。
      if (recover && validDay(p) && Object.keys(p).every(function (key) { return ['date', 'ms', 'count', 'hours', 'subjects'].indexOf(key) >= 0; }) && signatures.indexOf(daySignature(p)) >= 0) { repaired = true; return false; }
      throw new Error('番茄钟统计数据损坏，已保留原文件');
    });
    raw.settings = settings(raw.settings);
    raw.subjects = raw.subjects.map(name).filter(function (n, i, list) { return n && list.indexOf(n) === i; }).slice(0, 20);
    if (!raw.subjects.length) raw.subjects = ['未分类'];
    if (raw.subjects.indexOf(raw.current) < 0) raw.current = raw.subjects[0];
    return repaired;
  }
  function backup(store, bytes) {
    var path;
    do { path = store.root + '/pomodoro-backup-' + Date.now() + '-' + (++backupSequence) + '.json'; } while (store.manager.fileExistsAtPath(path));
    if (!bytes.writeToFileAtomically(path, true) || text(store.manager.contentsAtPath(path)) !== text(bytes)) throw new Error('计时存档备份失败，已保留原文件，请重试');
  }
  function read() {
    var store = location();
    if (!store.manager.fileExistsAtPath(store.path)) return empty();
    var bytes = store.manager.contentsAtPath(store.path), raw;
    if (!bytes || !Number(MNPNative.value(bytes, 'length'))) throw new Error('番茄钟数据为空，已保留原文件');
    // 使用文本边界生成独立的 JS 数组，避免原生对象转换时空数组互相串用。
    try { raw = JSON.parse(text(bytes)); } catch (_) { throw new Error('番茄钟数据无法读取，已保留原文件'); }
    if (validate(raw, true)) { backup(store, bytes); write(raw); }
    return raw;
  }
  function write(data) {
    validate(data, false);
    var store = location();
    if (!store.manager.fileExistsAtPath(store.root) && !store.manager.createDirectoryAtPathWithIntermediateDirectoriesAttributes(store.root, true, null)) throw new Error('无法创建 MN-Pet 数据目录');
    // 直接保存 JSON 文本，读写两侧都不把嵌套数组交给原生对象序列化。
    var json = JSON.stringify(data), bytes = NSData.dataWithStringEncoding(json, 4);
    if (!bytes || text(bytes) !== json) throw new Error('计时存档编码校验失败，已保留原文件');
    if (!bytes || !bytes.writeToFileAtomically(store.path, true)) throw new Error('番茄钟保存失败，请重试');
    return data;
  }
  function patch(current, input) {
    if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('番茄钟设置无效');
    var result = settings(current);
    Object.keys(input).forEach(function (key) {
      var value = input[key], range = limits[key];
      if (range) { if (!Number.isInteger(value) || value < range[0] || value > range[1]) throw new Error('时长或轮数超出范围'); }
      else if (['autoStartBreak', 'autoStartWork', 'alertOnFinish'].indexOf(key) < 0 || typeof value !== 'boolean') throw new Error('番茄钟设置无效');
      result[key] = value;
    });
    return result;
  }
  return { read: read, write: write, settings: settings, patch: patch, name: name, limits: limits };
})();
