import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain } from './pet-support.mjs';
const { settingsHTML } = await resources(), flush = () => new Promise(resolve => setImmediate(resolve));
async function page(t, seeded = false) {
  const h = pets(), now = new Date(2026, 10, 17, 12).getTime(), calls = [];
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  if (seeded) {
    const data = h.context.MNPFocusStore.read(); data.subjects = ['未分类', '数学', '英语', '<科目>'];
    for (const [name, ms, at] of [['数学', 60000, now - 86400000], ['英语', 180000, now], ['<科目>', 30000, now - 86400000]]) h.context.MNPFocusStats.add(data, ms, name, 1, at);
    h.context.MNPFocusStore.write(data);
  }
  const d = h.open(), dom = new JSDOM(settingsHTML, { runScripts: 'dangerously', beforeParse(window) {
    window.mn = { call: async (name, args) => { calls.push({ name, args }); return plain(d.command(name, args)); } };
  } });
  t.after(() => { dom.window.close(); h.context.MNPPets.dispose(d.addon); }); await flush();
  const el = id => dom.window.document.getElementById('focus-' + id);
  const emit = (id, type) => el(id).dispatchEvent(new dom.window.Event(type, { bubbles: true, cancelable: true }));
  return { h, d, dom, el, emit, calls };
}

test('两种计时设置各自提交和校验，保留另一部分草稿，失败可重试，提醒独立保存', async t => {
  const { d, el, emit } = await page(t);
  assert.notEqual(el('countdownMinutes').closest('form'), el('workMinutes').closest('form'));
  el('countdownMinutes').value = '7'; emit('countdownMinutes', 'input'); el('workMinutes').value = '40'; emit('workMinutes', 'input');
  emit('countdown-settings', 'submit'); await flush();
  let settings = d.command('getFocusState', {}).settings;
  assert.equal(settings.countdownMinutes, 7); assert.equal(settings.workMinutes, 25); assert.equal(el('workMinutes').value, '40'); assert.match(el('countdown-status').textContent, /已保存/);
  emit('settings', 'submit'); await flush(); settings = d.command('getFocusState', {}).settings;
  assert.equal(settings.workMinutes, 40); assert.equal(settings.countdownMinutes, 7);
  el('countdownMinutes').value = '11'; emit('countdownMinutes', 'input'); el('workMinutes').value = '0'; emit('workMinutes', 'input');
  emit('settings', 'submit'); await flush(); assert.match(el('pomodoro-status').textContent, /超出范围/);
  assert.equal(el('workMinutes').value, '0'); assert.equal(el('countdownMinutes').value, '11');
  emit('countdown-settings', 'submit'); await flush(); assert.equal(d.command('getFocusState', {}).settings.countdownMinutes, 11); assert.equal(el('workMinutes').value, '0');
  el('workMinutes').value = '45'; emit('workMinutes', 'input'); el('alertOnFinish').checked = true; emit('alertOnFinish', 'change'); await flush();
  settings = d.command('getFocusState', {}).settings; assert.equal(settings.alertOnFinish, true); assert.equal(settings.workMinutes, 40); assert.equal(el('workMinutes').value, '45');
  emit('settings', 'submit'); await flush(); assert.equal(d.command('getFocusState', {}).settings.workMinutes, 45);
});

test('柱状图按科目汇总且比例正确，图表与图例配色一致，切换不写入统计，单科扇形图正常', async t => {
  const { h, dom, el, emit, calls } = await page(t, true), doc = dom.window.document;
  const bars = [...el('subject-chart').children]; assert.equal(bars.length, 3);
  assert.deepEqual(bars.map(bar => bar.dataset.subject), ['英语', '数学', '<科目>']);
  assert.equal(parseFloat(bars[0].querySelector('span').style.height), 100);
  assert.ok(Math.abs(parseFloat(bars[1].querySelector('span').style.height) - 100 / 3) < .001);
  const colors = Object.fromEntries(bars.map(bar => [bar.dataset.subject, bar.querySelector('span').style.backgroundColor]));
  assert.equal(new Set(Object.values(colors)).size, 3); assert.equal(doc.querySelector('科目'), null);
  const writes = h.writes.length, requests = calls.length;
  el('chart-types').querySelector('[data-chart=pie]').click();
  assert.equal(el('subject-chart-scroll').hidden, true); assert.equal(el('pie').hidden, false);
  const paths = [...el('pie').querySelectorAll('path')]; assert.equal(paths.length, 3);
  assert.match(paths[0].querySelector('title').textContent, /英语.*3 分钟.*66.7%/);
  for (const path of paths) { const probe = doc.createElement('span'); probe.style.backgroundColor = path.getAttribute('fill'); assert.equal(probe.style.backgroundColor, colors[path.dataset.subject]); }
  assert.equal(calls.length, requests); assert.equal(h.writes.length, writes);
  el('range').value = 'day'; emit('range', 'change'); await flush();
  assert.equal(el('pie').querySelectorAll('circle').length, 1); assert.match(el('pie').textContent, /英语.*100%/);
  el('range').value = 'week'; emit('range', 'change'); await flush();
  for (const bar of el('subject-chart').children) assert.equal(bar.querySelector('span').style.backgroundColor, colors[bar.dataset.subject]);
  assert.equal(el('pie').hidden, false); assert.equal(el('chart').children.length, 7);
});

test('无数据时两种图表均显示空状态，多科目更新后配色不同且图表不会被科目文本注入', async t => {
  const { dom, d, el } = await page(t);
  el('chart-types').querySelector('[data-chart=pie]').click(); assert.equal(el('subject-chart-scroll').hidden, true); assert.equal(el('pie').hidden, true); assert.equal(el('empty').hidden, false);
  const data = plain(d.command('getFocusState', {})); data.subjects = Array.from({ length: 20 }, (_, i) => '科目' + i);
  data.stats.rows = data.subjects.map((name, i) => ({ name, ms: 60000 * (i + 1), count: 1 })); data.stats.totalMs = 12600000;
  dom.window.__MNP_FOCUS_STATE__(data);
  assert.equal(el('pie').querySelectorAll('path').length, 20); assert.equal(el('empty').hidden, true);
  const colors = [...el('pie').querySelectorAll('path')].map(path => path.getAttribute('fill')); assert.equal(new Set(colors).size, 20);
});
