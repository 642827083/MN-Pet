import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pets, plain } from './pet-support.mjs';
const path = '/documents/MN-Pet/pomodoro.json';
const fixture = readFileSync('test/fixtures/focus-misplaced-presets.json');
const original = JSON.parse(fixture), now = original.state.upStartAt + original.state.upRecordedMs;
const backupPath = '/documents/MN-Pet/pomodoro-backup-' + now + '-1.json';
function setup(bytes = fixture) {
  const h = pets({ files: new Map([[path, Buffer.from(bytes)]]) });
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  return h;
}
const backups = h => [...h.files.keys()].filter(name => name.includes('pomodoro-backup-'));

test('真实错位存档先备份再修复，保留统计、科目、设置和计时，重复读取不重复备份', () => {
  const h = setup(), result = plain(h.context.MNPFocus.read());
  assert.equal(result.stats.lifetimeMs, 67318); assert.equal(result.stats.lifetimeCount, 1);
  assert.equal(result.displayMs, 67318); assert.deepEqual(result.state, original.state);
  assert.deepEqual(result.subjects, original.subjects); assert.equal(result.current, original.current);
  const repaired = JSON.parse(h.files.get(path));
  assert.deepEqual(repaired.days, original.days); assert.deepEqual(repaired.settings, { countdownMinutes: 25, ...original.settings }); assert.deepEqual(repaired.presets, []);
  assert.equal(backups(h).length, 1); assert.deepEqual(h.files.get(backupPath), fixture);
  assert.equal(h.writes[0].path, backupPath); assert.equal(h.writes[1].path, path);
  h.context.MNPFocus.read(); assert.equal(backups(h).length, 1);
  h.context.MNPFocus.action({ action: 'record' }); assert.equal(h.context.MNPFocus.read().stats.lifetimeMs, 67318);
  h.context.MNPFocus.action({ action: 'reset' }); assert.equal(h.context.MNPFocus.read().stats.lifetimeMs, 67318);
});

test('错位项与正常科目预设混在一起时，只移除与统计完全一致的错位项', () => {
  const valid = { name: '数学', values: { workMinutes: 40, shortBreakMinutes: 5, longBreakMinutes: 15, roundsPerCycle: 4 } };
  const data = { ...original, presets: [valid, { ...original.days[0] }] }, h = setup(JSON.stringify(data));
  const result = h.context.MNPFocus.read();
  assert.equal(result.settings.workMinutes, 40); assert.equal(result.stats.lifetimeMs, 67318);
  assert.deepEqual(JSON.parse(h.files.get(path)).presets, [valid]);
});

test('备份失败或恢复保存失败时不覆盖原存档，重试也不重复累计统计', () => {
  const h = setup(); h.failWrite(backupPath);
  assert.throws(() => h.context.MNPFocus.read(), /备份/); assert.deepEqual(h.files.get(path), fixture);
  h.failWrite(path); assert.throws(() => h.context.MNPFocus.read(), /保存失败/);
  assert.deepEqual(h.files.get(path), fixture); assert.equal(backups(h).length, 1); assert.deepEqual(h.files.get(backups(h)[0]), fixture);
  h.failWrite(''); assert.equal(h.context.MNPFocus.read().stats.lifetimeMs, 67318);
});

test('统计损坏或预设无法确定来源时拒绝修复并保留原文件', () => {
  const invalidValues = [
    { ...original, days: [{ ...original.days[0], hours: [] }] },
    { ...original, presets: [{ ...original.days[0], ms: 1 }] },
    { ...original, presets: [{ name: '数学' }] }
  ];
  for (const value of invalidValues) {
    const bytes = Buffer.from(JSON.stringify(value)), h = setup(bytes);
    assert.throws(() => h.context.MNPFocus.read(), /损坏/); assert.deepEqual(h.files.get(path), bytes); assert.equal(h.writes.length, 0);
  }
});

test('计时存档不经原生对象转换，统计与预设独立，中文和表情正常往返', () => {
  const h = pets(); let clock = now;
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [clock])); } static now() { return clock; } };
  // 原生对象转换在共享空数组时可能串用内容；计时存档只能经文本边界。
  h.context.NSJSONSerialization.JSONObjectWithDataOptions = () => { throw Error('不应走原生对象解码'); };
  h.context.NSJSONSerialization.dataWithJSONObjectOptions = () => { throw Error('不应走原生对象编码'); };
  h.context.MNPFocus.configure({ action: 'addSubject', name: '数学🍅' });
  h.context.MNPFocus.action({ action: 'mode', mode: 'countup' }); h.context.MNPFocus.action({ action: 'start' });
  for (let i = 0; i < 50; i++) {
    clock += 1000; h.context.MNPFocus.action({ action: 'record' });
    assert.equal(h.context.MNPFocus.read().stats.lifetimeMs, (i + 1) * 1000);
    const data = JSON.parse(h.files.get(path)); assert.deepEqual(data.presets, []); assert.equal(data.days[0].subjects[0].name, '数学🍅');
  }
  const data = h.context.MNPFocusStore.read(); assert.notEqual(data.days, data.presets); assert.equal(data.current, '数学🍅');
});

test('编码结果异常时在替换前阻止保存', () => {
  const h = setup(JSON.stringify({ ...original, presets: [] })), before = h.files.get(path), encode = h.context.NSData.dataWithStringEncoding;
  h.context.NSData.dataWithStringEncoding = (_text, encoding) => encode('{}', encoding);
  assert.throws(() => h.context.MNPFocus.action({ action: 'reset' }), /编码/);
  assert.deepEqual(h.files.get(path), before);
});
