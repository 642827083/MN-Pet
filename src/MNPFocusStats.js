var MNPFocusStats = (function () {
  function key(date) { return date.getFullYear() + '-' + ('0' + (date.getMonth() + 1)).slice(-2) + '-' + ('0' + date.getDate()).slice(-2); }
  function day(data, date) { return data.days.find(function (item) { return item.date === key(date); }); }
  function add(data, ms, subject, count, time) {
    if (!(ms > 0)) return;
    var date = new Date(time), item = day(data, date);
    if (!item) { item = { date: key(date), ms: 0, count: 0, subjects: [], hours: Array(24).fill(0) }; data.days.push(item); }
    var row = item.subjects.find(function (entry) { return entry.name === subject; });
    if (!row) { row = { name: subject || '未分类', ms: 0, count: 0 }; item.subjects.push(row); }
    item.ms += ms; item.count += count; row.ms += ms; row.count += count; item.hours[date.getHours()] += ms;
    data.totalMs += ms; data.totalCount += count;
  }
  // 用 UTC 差值比较两个日期键，避免夏令时导致的 23/25 小时偏差。
  function span(from, to) {
    function part(text) { return text.split('-').map(Number); }
    var a = part(from), b = part(to);
    return Math.round((Date.UTC(b[0], b[1] - 1, b[2]) - Date.UTC(a[0], a[1] - 1, a[2])) / 86400000);
  }
  function marks(data) {
    var map = {};
    data.days.forEach(function (item) { if (item.ms > 0) map[item.date] = item.ms; });
    return map;
  }
  function streak(data, now) {
    var filled = marks(data), date = new Date(now), keys = Object.keys(filled).sort(), current = 0, best = 0, run = 0;
    for (var i = 0; i < keys.length; i++) { run = i && span(keys[i - 1], keys[i]) === 1 ? run + 1 : 1; if (run > best) best = run; }
    // 今天还没开始不算中断，从昨天往前数，连续记录到哪天为止。
    var cursor = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    if (!filled[key(cursor)]) cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1);
    while (filled[key(cursor)]) { current++; cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() - 1); }
    return { current: current, best: Math.max(best, current) };
  }
  function level(ms) { return ms <= 0 ? 0 : ms < 1800000 ? 1 : ms < 3600000 ? 2 : ms < 7200000 ? 3 : 4; }
  // 热力图按周对齐返回紧凑结构：否则每秒推送 371 条富对象约 14KB，超出推送预算。
  // start 是首格日期（周一），today 是今天在数组里的下标，之后的格子属于未来；等级由前端按同一阈值换算。
  function heatmap(data, now, days) {
    var filled = marks(data), date = new Date(now), length = Math.max(7, Math.min(371, Math.floor(days) || 371));
    length -= length % 7;
    var monday = (date.getDay() + 6) % 7, today = length - 7 + monday, ms = [];
    for (var i = 0; i < length; i++) {
      var at = new Date(date.getFullYear(), date.getMonth(), date.getDate() - today + i);
      ms.push(filled[key(at)] || 0);
    }
    var first = new Date(date.getFullYear(), date.getMonth(), date.getDate() - today);
    return { start: key(first), today: today, ms: ms };
  }
  function report(data, range, now) {
    var date = new Date(now), today = day(data, date), length = range === 'day' ? 1 : range === 'month' ? 30 : 7;
    var rows = [], series = [], totalMs = 0, count = 0;
    for (var i = length - 1; i >= 0; i--) {
      // 按本地日期逐日移动，跨夏令时也不漏天。
      var at = new Date(date.getFullYear(), date.getMonth(), date.getDate() - i), item = day(data, at);
      series.push({ label: i === 0 ? '今天' : (at.getMonth() + 1) + '/' + at.getDate(), ms: item ? item.ms : 0 });
      if (!item) continue;
      totalMs += item.ms; count += item.count;
      item.subjects.forEach(function (entry) { var row = rows.find(function (r) { return r.name === entry.name; }); if (!row) { row = { name: entry.name, ms: 0, count: 0 }; rows.push(row); } row.ms += entry.ms; row.count += entry.count; });
    }
    if (length === 1) series = Array.from({ length: 24 }, function (_, hour) { return { label: hour + '时', ms: today ? today.hours[hour] : 0 }; });
    rows.sort(function (a, b) { return b.ms - a.ms; });
    var summary = streak(data, now);
    return { todayMs: today ? today.ms : 0, todayCount: today ? today.count : 0, totalMs: totalMs, count: count, lifetimeMs: data.totalMs, lifetimeCount: data.totalCount, streakCurrent: summary.current, streakBest: summary.best, rows: rows, series: series };
  }
  return { add: add, report: report, streak: streak, heatmap: heatmap };
})();
