import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, plain, picture } from './pet-support.mjs';

const tap = (h, d) => h.call(d.addon, 'petTap', { state: 3 });
const flush = () => new Promise(resolve => setImmediate(resolve));

test('按当地日历天数倒计时，包含当天、过去、跨年和闰年，不按剩余小时进位', () => {
  const model = pets().context.MNPPetCountdown;
  const event = { name: '考研', date: '2026-12-19' };
  for (const hour of [0, 12, 23]) assert.deepEqual(plain(model.describe(event, new Date(2026, 11, 18, hour))), { ready: true, days: 1, title: '离考研还有', value: '1 天' });
  assert.equal(model.describe(event, new Date(2026, 11, 19)).value, '就是今天');
  assert.deepEqual(plain(model.describe(event, new Date(2026, 11, 20))), { ready: true, days: -1, title: '考研已过', value: '1 天' });
  assert.equal(model.describe({ name: '元旦', date: '2027-01-01' }, new Date(2026, 11, 31, 23)).days, 1);
  assert.equal(model.describe({ name: '三月', date: '2028-03-01' }, new Date(2028, 1, 28)).days, 2);
  assert.equal(model.validDate('2028-02-29'), true);
  for (const date of ['2026-02-29', '2026-04-31', '2026-13-01', '12.19', '0000-01-01']) assert.equal(model.validDate(date), false);
  assert.equal(model.midnight(new Date(2026, 11, 18, 23, 59, 59)), 1.1);
});

test('名称和日期独立持久化，允许分步填写与清空，无效输入不覆盖原值', () => {
  const h = pets(), d = h.open(), before = JSON.stringify(d.s.settings);
  assert.deepEqual(plain(d.command('getPetState').countdown), { name: '', date: '' });
  d.command('setPetCountdown', { name: '考研', date: '' });
  assert.equal(h.context.MNPPetCountdown.describe(h.context.MNPPetCountdown.read()).ready, false);
  d.command('setPetCountdown', { name: '考研', date: '2026-12-19' });
  for (const patch of [{ name: 'a'.repeat(25), date: '' }, { name: '考研', date: '2026-02-29' }, { name: '坏\n名', date: '' }]) assert.throws(() => d.command('setPetCountdown', patch), /有效日期/);
  assert.deepEqual(plain(pets({ values: h.values }).open().command('getPetState').countdown), { name: '考研', date: '2026-12-19' });
  assert.equal(JSON.stringify(d.s.settings), before); assert.equal(h.files.size, 0);
  d.command('setPetCountdown', { name: '', date: '' });
  assert.deepEqual(plain(h.context.MNPPetCountdown.read()), { name: '', date: '' });
  d.controller.activePage = 'deepseek'; assert.throws(() => d.command('setPetCountdown', { name: '考研', date: '' }), /设置页/);
});

test('点击气泡跨日自动更新，设置同步到多个窗口；关闭、后台和销毁释放计时器', () => {
  const h = pets(), d = h.open(), other = h.open();
  let now = new Date(2026, 11, 18, 23, 59, 59).getTime();
  h.context.Date = class extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } };
  d.command('setPetCountdown', { name: '考研', date: '2026-12-19' });
  tap(h, d); tap(h, other);
  assert.equal(d.s.countdownBubble.bubbleMessage.title, '离考研还有'); assert.equal(d.s.countdownBubble.bubbleMessage.value, '1 天');
  assert.equal(d.s.countdownDayTimer.seconds, 1.1);
  assert.equal(d.s.countdownBubble.userInteractionEnabled, false);
  assert.match(d.s.countdownBubble.loaded.url.path, /pet-bubble\/index.html$/);
  now += 1100; d.s.countdownDayTimer.fire(); assert.equal(d.s.countdownBubble.bubbleMessage.value, '就是今天');
  d.command('setPetCountdown', { name: '复试', date: '2026-12-21' });
  for (const scene of [d, other]) { assert.equal(scene.s.countdownBubble.bubbleMessage.title, '离复试还有'); assert.equal(scene.s.countdownBubble.bubbleMessage.value, '2 天'); }
  const stale = d.s.countdownDayTimer; tap(h, d);
  assert.equal(stale.valid, false); assert.equal(d.s.countdownShown, false); stale.fire(); d.s.countdownCloseTimer.fire(); assert.equal(d.s.countdownBubble.superview, null);
  tap(h, d); h.call(d.addon, 'sceneWillResignActive');
  assert.equal(d.s.countdownDayTimer, null); assert.ok(!d.s.countdownCloseTimer); assert.equal(d.s.countdownBubble.superview, null);
  h.call(other.addon, 'sceneDidDisconnect'); assert.equal(other.s.countdownBubble, null);
});

test('气泡不覆盖菜单；拖动、切换角色和窗口重挂载时收起，按压动作仍保留', () => {
  const h = pets(), d = h.open(); tap(h, d);
  assert.ok(d.s.petSquash); assert.ok(d.s.countdownBubble.superview);
  assert.ok(d.s.menuButton.layer.zPosition > d.s.countdownBubble.layer.zPosition);
  h.call(d.addon, 'petMenu'); assert.equal(d.s.countdownShown, false); assert.ok(d.s.menu);
  tap(h, d); assert.equal(d.s.countdownShown, false); assert.ok(d.s.menu);
  h.call(d.addon, 'petMenu'); tap(h, d);
  h.call(d.addon, 'petPan', { state: 1, translationInView: () => ({ x: 0, y: 0 }) }); assert.equal(d.s.countdownShown, false);
  d.s.dragOrigin = null; tap(h, d); h.upload(d, 'image', picture); assert.equal(d.s.countdownShown, false);
  tap(h, d); const parent = d.s.view.superview;
  d.addon.window = new h.context.UIView({ x: 0, y: 0, width: 800, height: 600 });
  h.context.MNPPets.layout(d.addon); assert.notEqual(d.s.view.superview, parent); assert.equal(d.s.countdownShown, false);
});

test('四角与中间均保留原项目气泡和角色的比例与左侧连接，不另行挪到上方或侧边', () => {
  const geometry = pets().context.MNPPetBubble.geometry;
  for (const [width, height] of [[320, 480], [390, 844], [844, 390], [1024, 768], [1366, 1024]]) {
    for (const [px, py] of [[0, 0], [1, 0], [0, 1], [1, 1], [.5, .5]]) {
      const pet = { x: px * (width - 112), y: py * (height - 112), width: 112, height: 112 };
      const plan = geometry({ width, height }, pet), unit = plan.width / 1026;
      assert.equal(plan.width, pet.width / .5945);
      assert.equal(plan.x + plan.width, pet.x + pet.width);
      assert.equal(plan.y + plan.width, pet.y + pet.height);
      assert.ok(plan.x + 442 * unit < pet.x + pet.width * .1);
      assert.ok(plan.y + 646 * unit > pet.y + pet.height * .3);
    }
  }
});

test('设置名称、日期即时保存、回车与清空可用，外部更新不覆盖正在输入的草稿', async t => {
  const { settingsHTML } = await resources(), h = pets(), d = h.open(), calls = [];
  const dom = new JSDOM(settingsHTML, { runScripts: 'dangerously', url: 'https://settings.invalid/', beforeParse(window) {
    window.scrollTo = () => {};
    window.mn = { call: async (name, payload) => { calls.push({ name, payload }); return plain(d.command(name, payload)); } };
  } });
  t.after(() => dom.window.close()); await flush();
  const doc = dom.window.document, name = doc.getElementById('pet-countdown-name'), date = doc.getElementById('pet-countdown-date');
  assert.equal(name.disabled, false); name.value = '考研'; name.dispatchEvent(new dom.window.Event('input')); name.dispatchEvent(new dom.window.Event('change')); await flush();
  date.value = '2026-12-19'; date.dispatchEvent(new dom.window.Event('change')); await flush();
  assert.deepEqual(plain(h.context.MNPPetCountdown.read()), { name: '考研', date: '2026-12-19' });
  name.value = '草稿'; name.dispatchEvent(new dom.window.Event('input'));
  dom.window.__MNP_PET_STATE__(plain(d.command('getPetState'))); assert.equal(name.value, '草稿');
  doc.getElementById('pet-countdown-form').dispatchEvent(new dom.window.Event('submit', { cancelable: true })); await flush();
  assert.equal(h.context.MNPPetCountdown.read().name, '草稿');
  doc.getElementById('pet-countdown-clear').click(); await flush();
  assert.deepEqual(plain(h.context.MNPPetCountdown.read()), { name: '', date: '' });
  assert.equal(calls.filter(item => item.name === 'setPetCountdown').length, 4);
});
