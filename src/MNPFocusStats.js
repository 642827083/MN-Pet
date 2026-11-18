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
    return { todayMs: today ? today.ms : 0, todayCount: today ? today.count : 0, totalMs: totalMs, count: count, lifetimeMs: data.totalMs, lifetimeCount: data.totalCount, rows: rows, series: series };
  }
  return { add: add, report: report };
})();
