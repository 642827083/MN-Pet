var MNPFocus = (function () {
  var labels = { work: '专注', short: '短休息', long: '长休息', countdown: '倒计时' };
  function duration(data, phase) {
    var preset = data.presets.find(function (p) { return p.name === data.current; }), options = preset ? MNPFocusStore.settings(preset.values) : data.settings;
    return options[phase === 'countdown' ? 'countdownMinutes' : phase === 'short' ? 'shortBreakMinutes' : phase === 'long' ? 'longBreakMinutes' : 'workMinutes'] * 60000;
  }
  function fresh(data, mode) { var total = duration(data, mode === 'countdown' ? 'countdown' : 'work'); return { mode: ['countup', 'countdown'].indexOf(mode) >= 0 ? mode : 'pomodoro', phase: 'work', status: 'idle', totalMs: total, remainMs: total, endAt: 0, round: 0, subject: '', upStartAt: 0, upAccumMs: 0, upRecordedMs: 0 }; }
  function state(data) {
    var s = data.state;
    if (!s || ['countdown', 'pomodoro', 'countup'].indexOf(s.mode) < 0 || ['work', 'short', 'long'].indexOf(s.phase) < 0 || ['idle', 'running', 'paused', 'completed'].indexOf(s.status) < 0 || s.status === 'completed' && s.mode !== 'countdown' || ['totalMs','remainMs','endAt','round','upStartAt','upAccumMs','upRecordedMs'].some(function (k) { return !Number.isFinite(s[k]) || s[k] < 0; }) || s.totalMs < 1) s = data.state = fresh(data);
    return s;
  }
  function elapsed(s, now) { return Math.max(s.upRecordedMs, s.upAccumMs + (s.status === 'running' ? Math.max(0, now - s.upStartAt) : 0)); }
  function remaining(s, now) { return s.status === 'running' ? Math.max(0, s.endAt - now) : s.remainMs; }
  function enter(data, s, phase) { s.phase = phase; s.status = 'idle'; s.endAt = 0; s.totalMs = duration(data, phase); s.remainMs = s.totalMs; s.subject = ''; }
  function next(data, s) {
    var preset = data.presets.find(function (p) { return p.name === data.current; }), rounds = preset ? MNPFocusStore.settings(preset.values).roundsPerCycle : data.settings.roundsPerCycle;
    return s.round > 0 && s.round % rounds === 0 ? 'long' : 'short';
  }
  function settle(data, now) {
    var s = state(data);
    if (s.mode === 'countup' || s.status !== 'running' || now < s.endAt) return null;
    if (s.mode === 'countdown') {
      MNPFocusStats.add(data, s.totalMs, s.subject, 1, s.endAt);
      s.status = 'completed'; s.remainMs = 0; s.endAt = 0;
      return { phase: 'countdown', alert: data.settings.alertOnFinish };
    }
    var phase = s.phase, endedAt = s.endAt, late = now - endedAt > 600000;
    if (phase === 'work') { MNPFocusStats.add(data, s.totalMs, s.subject, 1, endedAt); s.round++; }
    var following = phase === 'work' ? next(data, s) : 'work';
    enter(data, s, following); if (phase === 'long') s.round = 0;
    if (!late && data.settings[following === 'work' ? 'autoStartWork' : 'autoStartBreak']) { s.status = 'running'; s.endAt = now + s.totalMs; s.subject = data.current; }
    return { phase: phase, next: following, late: late, autoStarted: s.status === 'running', alert: data.settings.alertOnFinish };
  }
  function snapshot(data, now, range) {
    var s = state(data), ms = s.mode === 'countup' ? elapsed(s, now) : remaining(s, now), options = MNPFocusStore.settings(data.settings);
    var preset = data.presets.find(function (p) { return p.name === data.current; });
    if (preset) Object.keys(MNPFocusStore.limits).forEach(function (k) { options[k] = MNPFocusStore.settings(preset.values)[k]; });
    // 连续天数随统计一起下发；热力图固定近 53 周（按周对齐），并以毫秒数组压缩推送体积。
    return { state: s, displayMs: ms, capturedAt: now, label: s.mode === 'countup' ? '正计时' : s.mode === 'countdown' ? '倒计时' : labels[s.phase], settings: options, subjects: data.subjects, current: data.current, hasPreset: !!preset, stats: MNPFocusStats.report(data, range || 'week', now), heatmap: MNPFocusStats.heatmap(data, now, 371) };
  }
  function tick() {
    var data = MNPFocusStore.read(), event = settle(data, Date.now()); if (event) MNPFocusStore.write(data); return event;
  }
  function read(range) { return snapshot(MNPFocusStore.read(), Date.now(), range); }
  function action(input) {
    var data = MNPFocusStore.read(), now = Date.now(), event = settle(data, now), s = state(data), op = input && input.action;
    if (op === 'start') {
      if (s.status === 'completed') s = data.state = fresh(data, s.mode);
      if (s.status !== 'running') {
        s.status = 'running'; if (!s.subject) s.subject = data.current;
        if (s.mode === 'countup') s.upStartAt = now; else s.endAt = now + s.remainMs;
      }
    } else if (op === 'pause') {
      if (s.status === 'running') { if (s.mode === 'countup') { s.upAccumMs = elapsed(s, now); s.upStartAt = 0; } else s.remainMs = remaining(s, now); s.status = 'paused'; s.endAt = 0; }
    } else if (op === 'reset') data.state = fresh(data, s.mode);
    else if (op === 'skip') { if (s.mode !== 'pomodoro') throw new Error('当前模式没有可跳过的阶段'); var old = s.phase; enter(data, s, old === 'work' ? next(data, s) : 'work'); if (old === 'long') s.round = 0; }
    else if (op === 'mode') {
      if (['countdown', 'pomodoro', 'countup'].indexOf(input.mode) < 0) throw new Error('计时模式无效');
      if (['idle', 'completed'].indexOf(s.status) < 0 || s.upAccumMs > 0) throw new Error('切换模式前请先重置当前计时');
      data.state = fresh(data, input.mode);
    } else if (op === 'record') {
      if (s.mode !== 'countup') throw new Error('仅正计时需要手动记录');
      var up = elapsed(s, now), delta = Math.max(0, up - s.upRecordedMs);
      MNPFocusStats.add(data, delta, s.subject || data.current, s.upRecordedMs === 0 && delta > 0 ? 1 : 0, now); s.upRecordedMs = up;
    } else throw new Error('不支持的计时操作');
    MNPFocusStore.write(data); return { timer: snapshot(data, now, input.range), event: event };
  }
  function configure(input) {
    var data = MNPFocusStore.read(), s = state(data), op = input && input.action;
    // 两个页面和其他窗口都由原生数据层执行科目锁定，暂停也不能绕过。
    if (['running', 'paused'].indexOf(s.status) >= 0 && ['selectSubject', 'addSubject', 'removeSubject'].indexOf(op) >= 0) throw new Error('计时已开始，完成或重置后才能更改科目');
    if (op === 'settings') {
      data.settings = MNPFocusStore.patch(data.settings, input.values);
      var own = data.presets.find(function (p) { return p.name === data.current; });
      if (own) Object.keys(MNPFocusStore.limits).forEach(function (k) { if (Object.prototype.hasOwnProperty.call(input.values, k)) own.values[k] = data.settings[k]; });
    } else if (op === 'addSubject') {
      var name = MNPFocusStore.name(input.name);
      if (!name || name !== input.name.trim() || input.name.length > 12 || /[\x00-\x1f\x7f]/.test(input.name)) throw new Error('请输入 12 字以内的科目名称');
      if (data.subjects.indexOf(name) >= 0) throw new Error('科目已存在');
      if (data.subjects.length >= 20) throw new Error('最多保存 20 个科目');
      data.subjects.push(name); data.current = name;
    } else if (op === 'selectSubject') { if (data.subjects.indexOf(input.name) < 0) throw new Error('科目不存在'); data.current = input.name; }
    else if (op === 'removeSubject') {
      if (data.subjects.indexOf(input.name) < 0) throw new Error('科目不存在');
      data.subjects = data.subjects.filter(function (n) { return n !== input.name; }); if (!data.subjects.length) data.subjects = ['未分类'];
      data.presets = data.presets.filter(function (p) { return p.name !== input.name; }); if (data.current === input.name) data.current = data.subjects[0];
    } else if (op === 'savePreset') {
      var values = MNPFocusStore.patch(data.settings, input.values), preset = {};
      Object.keys(MNPFocusStore.limits).forEach(function (k) { preset[k] = values[k]; });
      data.presets = data.presets.filter(function (p) { return p.name !== data.current; }); data.presets.push({ name: data.current, values: preset });
    } else if (op === 'clearPreset') data.presets = data.presets.filter(function (p) { return p.name !== data.current; });
    else throw new Error('不支持的番茄钟设置');
    // 正在运行或暂停的计时保持本轮时长，新设置从下轮开始。
    if (s.status === 'idle' && s.mode !== 'countup') { s.totalMs = duration(data, s.mode === 'countdown' ? 'countdown' : s.phase); s.remainMs = s.totalMs; }
    MNPFocusStore.write(data); return snapshot(data, Date.now(), input.range);
  }
  function format(ms, up) {
    var seconds = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000));
    var hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60, rest = seconds % 60;
    return (hours ? hours + ':' : '') + ('0' + minutes).slice(-2) + ':' + ('0' + rest).slice(-2);
  }
  return { read: read, tick: tick, action: action, configure: configure, format: format, labels: labels };
})();
