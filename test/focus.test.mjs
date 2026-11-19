import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { pets, plain } from './pet-support.mjs';
import { resources } from '../scripts/bundle.mjs';
const path = '/documents/MN-Pet/pomodoro.json';
const flush = () => new Promise(resolve => setImmediate(resolve));
function setup(existing) {
  const h = pets(existing); let now = new Date(2026, 10, 17, 9).getTime();
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  const d = h.open();
  return { h, d, advance(ms) { now += ms; }, setTime(value) { now = value; }, read: range => plain(d.command('getFocusState', { range: range || 'week' })),
    act: (action, args = {}) => plain(d.command('focusAction', { action, ...args })), config: (action, args = {}) => plain(d.command('configureFocus', { action, ...args })) };
}

test('时间戳计时、暂停续计和跨窗口重启，关闭气泡或隐藏桌宠继续计时', () => {
  const p = setup(), { h, d } = p;
  assert.equal(p.read().displayMs, 1500000); assert.equal(h.files.size, 0);
  p.act('start'); p.advance(32123); assert.equal(p.read().displayMs, 1500000 - 32123);
  assert.equal(p.act('pause').state.status, 'paused'); p.advance(60000); assert.equal(p.read().displayMs, 1467877);
  p.act('start'); h.call(d.addon, 'petTap', { state: 3 });
  p.advance(1000); d.s.focusTimer.fire(); assert.equal(d.s.countdownBubble.bubbleMessage.time, '24:27');
  h.call(d.addon, 'petTap', { state: 3 }); d.command('setPetOptions', { visible: false });
  p.advance(1000); assert.equal(p.read().displayMs, 1465877);
  const second = h.open(); assert.equal(second.command('getFocusState', {}).state.endAt, p.read().state.endAt);
  const restored = setup({ files: h.files, values: h.values }); restored.advance(94123);
  assert.equal(restored.read().displayMs, p.read().displayMs);
  assert.ok(h.writes.every(w => w.path.startsWith('/documents/MN-Pet/') && w.atomic));
});

test('专注短休息长休息完整循环，跳过不计数，完成自动记录且多窗口不重复结算', () => {
  const p = setup(), other = p.h.open(); p.config('settings', { values: { workMinutes: 1, shortBreakMinutes: 1, longBreakMinutes: 2, roundsPerCycle: 2 } });
  p.act('start'); p.advance(60000); let state = p.read();
  assert.equal(state.state.phase, 'short'); assert.equal(state.state.status, 'running'); assert.equal(state.stats.todayCount, 1);
  assert.equal(other.command('getFocusState', {}).stats.todayCount, 1); assert.equal(p.h.hud.length, 1);
  p.advance(60000); state = p.read(); assert.equal(state.state.phase, 'work'); assert.equal(state.state.status, 'idle');
  p.act('start'); p.advance(60000); state = p.read(); assert.equal(state.state.phase, 'long'); assert.equal(state.displayMs, 120000); assert.equal(state.stats.todayCount, 2);
  p.advance(120000); state = p.read(); assert.equal(state.state.phase, 'work'); assert.equal(state.state.round, 0);
  state = p.act('skip'); assert.equal(state.state.phase, 'short'); assert.equal(state.stats.todayCount, 2);
  state = p.act('reset'); assert.equal(state.state.phase, 'work'); assert.equal(state.stats.lifetimeMs, 120000);
});

test('后台停止原生刷新，恢复按真实时间校正；长时间离开不补跑多轮', () => {
  const p = setup(), { h, d } = p; p.act('start'); const old = d.s.focusTimer;
  h.addonClass.statics.applicationDidEnterBackground(); assert.equal(old.valid, false); assert.equal(d.s.focusTimer, null);
  p.advance(1500000 + 600001); h.addonClass.statics.applicationWillEnterForeground();
  const state = p.read(); assert.equal(state.state.phase, 'short'); assert.equal(state.state.status, 'idle'); assert.equal(state.stats.todayCount, 1);
  assert.match(h.hud.at(-1), /手动开始/);
  h.call(d.addon, 'sceneDidDisconnect'); assert.equal(d.s.focusTimer, null); assert.equal(h.timers.some(t => t.valid), false);
});

test('正计时暂停和增量记录，重复记录不双算，重置不删除已有统计', () => {
  const p = setup(); p.act('mode', { mode: 'countup' }); p.act('start'); p.advance(61321);
  let s = p.act('record'); assert.equal(s.stats.todayMs, 61321); assert.equal(s.stats.todayCount, 1); assert.equal(s.displayMs, 61321);
  assert.equal(p.act('record').stats.todayMs, 61321); p.advance(10000); p.act('pause'); p.advance(60000);
  assert.equal(p.read().displayMs, 71321); s = p.act('record'); assert.equal(s.stats.todayMs, 71321); assert.equal(s.stats.todayCount, 1);
  p.act('start'); p.advance(10000); p.act('reset'); s = p.read(); assert.equal(s.displayMs, 0); assert.equal(s.stats.todayMs, 71321);
  p.act('start'); p.advance(1000); s = p.act('record'); assert.equal(s.stats.todayCount, 2);
  assert.throws(() => p.act('mode', { mode: 'pomodoro' }), /重置/);
});

test('科目归档锁定当前一次，科目预设持久化、删除保留统计，暂停时修改不覆盖本轮', () => {
  const p = setup(); p.config('addSubject', { name: '数学' }); p.config('savePreset', { values: { workMinutes: 1, shortBreakMinutes: 2, longBreakMinutes: 3, roundsPerCycle: 2 } });
  assert.equal(p.read().displayMs, 60000); assert.equal(p.read().hasPreset, true);
  p.act('start'); p.advance(5000); p.act('pause'); p.config('settings', { values: { workMinutes: 2 } });
  assert.equal(p.read().displayMs, 55000); assert.equal(p.read().state.totalMs, 60000);
  assert.throws(() => p.config('addSubject', { name: '英语' }), /完成或重置/); p.act('start'); p.advance(55000);
  let s = p.read(); assert.equal(s.stats.rows[0].name, '数学');
  p.act('reset');
  p.config('removeSubject', { name: '数学' }); assert.equal(p.read().stats.rows[0].name, '数学');
  s = p.config('addSubject', { name: '__proto__' }); assert.ok(s.subjects.includes('__proto__'));
  p.config('savePreset', { values: { workMinutes: 3 } });
  p.config('settings', { values: { alertOnFinish: true } }); assert.equal(p.read().settings.workMinutes, 3);
  s = p.config('clearPreset'); assert.equal(s.hasPreset, false); assert.equal(s.settings.workMinutes, 2);
  const file = p.h.files.get(path); assert.ok(file); assert.equal(JSON.parse(file).presets.some(row => row.name === '数学'), false);
});

test('连续专注天数按本地日期统计，今天未开始不断连，热力图按周对齐下发毫秒', () => {
  const p = setup(); p.act('mode', { mode: 'countup' });
  assert.equal(p.read().stats.streakCurrent, 0); assert.equal(p.read().stats.streakBest, 0);
  const heat = p.read().heatmap;
  // 371 天按 7 取整并向前补到周一，因此首格固定是周一、末尾可能落在未来。
  assert.equal(heat.ms.length, 371); assert.equal(heat.start, '2025-11-17'); assert.equal(heat.today, 365);
  assert.equal(heat.ms[heat.today], 0);
  p.act('start'); p.advance(60000); p.act('record');
  let s = p.read(); assert.equal(s.stats.streakCurrent, 1); assert.equal(s.stats.streakBest, 1);
  assert.equal(s.heatmap.ms[s.heatmap.today], 60000); assert.equal(s.heatmap.ms[s.heatmap.today - 1], 0);
  // 次日没有记录时，昨天开始的连击仍然算数，不会因为今天还没开始就清零。
  p.act('reset'); p.setTime(new Date(2026, 10, 18, 9).getTime());
  s = p.read(); assert.equal(s.stats.streakCurrent, 1); assert.equal(s.heatmap.start, '2025-11-17'); assert.equal(s.heatmap.today, 366); assert.equal(s.heatmap.ms[s.heatmap.today], 0);
  p.act('start'); p.advance(2400000); p.act('record');
  s = p.read(); assert.equal(s.stats.streakCurrent, 2); assert.equal(s.stats.streakBest, 2); assert.equal(s.heatmap.ms[s.heatmap.today], 2400000);
  // 断开一天后从今天重新开始计数，历史最长保持。
  p.act('reset'); p.setTime(new Date(2026, 10, 21, 9).getTime());
  p.act('start'); p.advance(60000); p.act('record');
  s = p.read(); assert.equal(s.stats.streakCurrent, 1); assert.equal(s.stats.streakBest, 2);
  assert.equal(s.heatmap.ms.filter(ms => ms > 0).length, 3);
});

test('状态和统计同一文件原子保存，写入失败保留原状态，重试只记录一次', () => {
  const p = setup(); p.act('start'); const before = Buffer.from(p.h.files.get(path)); p.advance(1500000);
  p.h.failWrite(path); assert.throws(() => p.read(), /保存失败/); assert.deepEqual(p.h.files.get(path), before);
  p.h.failWrite(''); assert.equal(p.read().stats.todayCount, 1); assert.equal(p.read().stats.todayCount, 1);
  const beforeInvalid = Buffer.from(p.h.files.get(path));
  for (const values of [{ workMinutes: 0 }, { roundsPerCycle: 1 }, { autoStartWork: 'yes' }, { unknown: 1 }]) assert.throws(() => p.config('settings', { values }));
  assert.deepEqual(p.h.files.get(path), beforeInvalid);
  p.h.files.set(path, Buffer.from('{bad')); assert.throws(() => p.act('reset'), /无法读取/); assert.equal(p.h.files.get(path).toString(), '{bad');
});

test('日期统计补齐缺失天、分小时和科目占用，完成时归档，超过一小时正常显示', () => {
  const p = setup(); p.act('mode', { mode: 'countup' }); p.act('start'); p.advance(3661000); p.act('record');
  let s = p.read('day'); assert.equal(s.stats.series.length, 24); assert.equal(s.stats.series[10].ms, 3661000);
  assert.equal(p.h.context.MNPFocus.format(s.displayMs, true), '1:01:01');
  p.act('reset'); p.setTime(new Date(2026, 10, 18, 9).getTime()); p.act('start'); p.advance(1000); p.act('record');
  s = p.read('week'); assert.equal(s.stats.series.length, 7); assert.equal(s.stats.totalMs, 3662000); assert.equal(s.stats.todayMs, 1000);
  assert.equal(p.read('month').stats.series.length, 30);
});

test('独立运行环境共享同一份状态和统计，到期只结算一次，提醒开关走原生接口', () => {
  const p = setup(); p.config('settings', { values: { alertOnFinish: true } }); p.act('start');
  const alerts = []; p.h.context.UIAlertView = { showWithTitleMessageStyleCancelButtonTitleOtherButtonTitlesTapBlock: (...args) => alerts.push(args) };
  p.advance(1500000); p.read(); assert.equal(alerts.length, 1); assert.match(alerts[0][1], /专注结束/);
  const q = setup({ files: p.h.files, values: p.h.values }); q.advance(1500000);
  assert.equal(q.read().stats.todayCount, 1); assert.equal(q.read().state.status, 'running'); assert.equal(q.h.hud.length, 0);
  const before = p.h.files.get(path); q.d.controller.visible = false;
  assert.throws(() => q.act('reset'), /设置页/); assert.deepEqual(q.h.files.get(path), before);
});

test('正计时已经保存的时长在系统时间回拨时不倒扣，也不重复记录', () => {
  const p = setup(); p.act('mode', { mode: 'countup' }); p.act('start'); p.advance(120000); p.act('record');
  p.advance(-60000); assert.equal(p.act('record').stats.todayMs, 120000); p.act('pause');
  assert.equal(p.read().displayMs, 120000); p.act('start'); p.advance(1000); assert.equal(p.act('record').stats.todayMs, 121000);
});

test('倒计时暂停续计、结束自动入账且只记一次，完成后可以换科目并再次开始', () => {
  const p = setup(); p.config('addSubject', { name: '数学' }); p.config('settings', { values: { countdownMinutes: 1 } });
  let s = p.act('mode', { mode: 'countdown' }); assert.equal(s.displayMs, 60000); assert.equal(s.label, '倒计时');
  assert.throws(() => p.act('skip'), /没有可跳过/);
  p.act('start'); p.advance(25000); p.act('pause'); p.advance(3600000); assert.equal(p.read().displayMs, 35000);
  p.config('settings', { values: { countdownMinutes: 2 } }); assert.equal(p.read().state.totalMs, 60000);
  p.act('start'); p.advance(35000);
  const before = Buffer.from(p.h.files.get(path)); p.h.failWrite(path);
  assert.throws(() => p.read(), /保存失败/); assert.deepEqual(p.h.files.get(path), before); p.h.failWrite('');
  s = p.read(); assert.equal(s.state.status, 'completed'); assert.equal(s.displayMs, 0);
  assert.equal(s.stats.todayCount, 1); assert.equal(s.stats.todayMs, 60000); assert.equal(s.stats.rows[0].name, '数学');
  assert.match(p.h.hud.at(-1), /倒计时结束.*已保存/);
  assert.equal(p.read().stats.todayCount, 1); assert.equal(p.h.open().command('getFocusState', {}).stats.todayCount, 1);
  const restored = setup({ files: p.h.files, values: p.h.values }); assert.equal(restored.read().state.status, 'completed');
  p.config('addSubject', { name: '英语' }); s = p.act('start'); assert.equal(s.displayMs, 120000); assert.equal(s.state.subject, '英语');
  p.advance(1000); p.act('reset'); assert.equal(p.read().stats.todayCount, 1);
});

test('三种模式开始或暂停后均拒绝跨窗口更改科目、添加或删除，重置与完成后解锁', () => {
  for (const mode of ['countdown', 'pomodoro', 'countup']) {
    const p = setup(), other = p.h.open(); p.config('addSubject', { name: '数学' });
    p.config('settings', { values: { autoStartBreak: false, countdownMinutes: 1, workMinutes: 1 } }); p.act('mode', { mode });
    p.act('start');
    for (const paused of [false, true]) {
      if (paused) p.act('pause');
      const before = Buffer.from(p.h.files.get(path));
      for (const [action, name] of [['selectSubject', '未分类'], ['addSubject', '英语'], ['removeSubject', '数学']]) {
        assert.throws(() => other.command('configureFocus', { action, name }), /完成或重置/);
      }
      assert.equal(p.read().current, '数学'); assert.deepEqual(p.h.files.get(path), before);
    }
    p.act('reset'); p.config('selectSubject', { name: '未分类' });
    if (mode !== 'countup') { p.act('start'); p.advance(60000); p.read(); p.config('selectSubject', { name: '数学' }); assert.equal(p.read().current, '数学'); }
  }
});

test('主面板时间页管理设置与统计，小计时器操作计时，后台推送保留时长草稿', async t => {
  const p = setup(), { focusHTML, settingsHTML } = await resources();
  const make = html => new JSDOM(html, { runScripts: 'dangerously', beforeParse(window) { window.scrollTo = () => {}; window.mn = { call: async (name, args) => plain(p.d.command(name, args)) }; } });
  const main = make(settingsHTML), timer = make(focusHTML);
  t.after(() => { main.window.close(); timer.window.close(); }); await flush();
  const doc = main.window.document, el = id => doc.getElementById('focus-' + id), quick = id => timer.window.document.getElementById('focus-' + id);
  const emit = (id, event) => el(id).dispatchEvent(new main.window.Event(event, { bubbles: true, cancelable: true }));
  doc.getElementById('settings-time-tab').click();
  assert.equal(quick('start').disabled, false); quick('start').click(); await flush(); assert.equal(p.read().state.status, 'running');
  main.window.__MNP_FOCUS_STATE__(p.read()); assert.equal(el('subject').disabled, true); assert.equal(el('subject-name').disabled, true);
  assert.equal(el('subject-lock').hidden, false); assert.equal(el('range').disabled, false);
  p.advance(1200); timer.window.__MNP_FOCUS_STATE__(p.read()); assert.equal(quick('time').textContent, '24:59');
  quick('pause').click(); await flush(); assert.equal(quick('start').textContent, '继续');
  el('workMinutes').value = '30'; emit('workMinutes', 'input'); main.window.__MNP_FOCUS_STATE__(p.read()); assert.equal(el('workMinutes').value, '30');
  emit('settings', 'submit'); await flush(); assert.equal(p.read().settings.workMinutes, 30); assert.equal(p.read().state.totalMs, 1500000);
  quick('reset').click(); assert.equal(quick('reset').textContent, '确认重置'); quick('reset').click(); await flush(); assert.equal(quick('time').textContent, '30:00');
  main.window.__MNP_FOCUS_STATE__(p.read()); assert.equal(el('subject').disabled, false);
  el('subject-name').value = '<科目>'; emit('add-subject', 'submit'); await flush(); assert.equal(p.read().current, '<科目>'); assert.equal(doc.querySelector('科目'), null);
  el('save-preset').click(); await flush(); assert.equal(p.read().hasPreset, true);
  quick('mode-countup').click(); await flush(); quick('start').click(); await flush(); p.advance(60000); timer.window.__MNP_FOCUS_STATE__(p.read());
  quick('record').click(); await flush(); main.window.__MNP_FOCUS_STATE__(p.read()); assert.match(el('today').textContent, /1 分钟/); assert.match(el('subject-stats').textContent, /<科目>/);
  assert.equal(el('streak-current').textContent, '1 天'); assert.equal(el('streak-best').textContent, '1 天');
  const cells = el('heatmap').children; assert.equal(cells.length, 371);
  const index = p.read().heatmap.today;
  assert.equal(cells[index].dataset.level, '1'); assert.match(cells[index].title, /1 分钟/);
  assert.equal(cells[index - 1].dataset.level, '0');
  // 今天之后的格子属于未来，不参与等级显示。
  assert.equal(cells[index + 1].dataset.future, 'true');
  assert.equal(el('heatmap-months').children.length, 53);
  el('range').value = 'day'; emit('range', 'change'); await flush(); assert.equal(el('chart').children.length, 24);
  quick('pause').click(); await flush(); quick('reset').click(); quick('reset').click(); await flush();
  quick('mode-pomodoro').click(); await flush(); assert.equal(p.read().state.mode, 'pomodoro');
});
