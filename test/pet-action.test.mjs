import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { pets, pack, plain } from './pet-support.mjs';

// 复用真实夹具素材复制出四种动作，避免手工伪造 WebP。
function action(id, label) {
  return { id, label, file: 'actions/' + id + '.webp', count: 60, duration: 10 };
}
function build(ids) {
  const webp = readFileSync('test/fixtures/pet-idle.webp').toString('base64');
  const files = { 'poster.png': readFileSync('test/fixtures/pet-poster.png').toString('base64') };
  ids.forEach(id => { files['actions/' + id + '.webp'] = webp; });
  return { schema: 1, manifest: {
    schema: 1, id: 'fixture-actions', name: '夹具动作', author: 'PC2005-cloud', version: '1.0.0', format: 'animated-webp',
    frameSize: 128, visualAnchorX: 0.58984375, poster: 'poster.png',
    actions: ids.map(id => action(id, id))
  }, files, license: readFileSync('test/fixtures/pet-LICENSE.txt', 'utf8') };
}
const fourPack = () => build(['idle', 'focus', 'rest', 'drag']);

// h.open() 已经触发过一次 mountTimer；时间基准固定，便于断言。
function setup(pack, start = new Date(2026, 10, 17, 9).getTime()) {
  const h = pets(); let now = start;
  class Fixed extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  h.context.Date = Fixed;
  const d = h.open();
  if (pack) h.upload(d, 'pack', pack);
  // 每次 pulse 由 focusTimer 推动；advance 只移动时钟，由调用方决定是否 pulse。
  const advance = ms => { now += ms; };
  const pulse = () => { const timer = d.s.focusTimer; assert.ok(timer, '计时器应处于运行状态'); timer.fire(); };
  const act = (op, args = {}) => plain(d.command('focusAction', { action: op, ...args }));
  const config = (op, args = {}) => plain(d.command('configureFocus', { action: op, ...args }));
  const playing = () => d.s.petActionTarget || '';
  return { h, d, act, config, advance, pulse, playing };
}

test('待机、专注、休息按计时状态切换动作', () => {
  const p = setup(fourPack());
  assert.equal(p.playing(), 'idle');

  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'focus', '专注运行中播放专注动作');

  p.act('pause'); p.pulse();
  assert.equal(p.playing(), 'idle', '暂停回到待机');

  // 重置后才能改时长：运行中改的数值下一轮才生效。
  p.act('reset'); p.pulse();
  p.config('settings', { values: { workMinutes: 1, shortBreakMinutes: 1, autoStartBreak: true } });
  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'focus');
  // 工作段到点后自动开始短休息，动作应切到休息。
  p.advance(61000); p.pulse();
  assert.equal(p.playing(), 'rest', '短休息自动开始时播放休息动作');
});

test('只有待机素材的旧包保持待机，不因状态变化报错', () => {
  const p = setup(pack);
  assert.equal(p.playing(), 'idle');
  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'idle', '没有专注素材时回落待机');
  assert.equal(p.d.s.animationWarning, '');
});

test('拖动播放拖动动作，松手后恢复计时状态对应的动作', () => {
  const p = setup(fourPack());
  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'focus');

  const gesture = { state: 1, translationInView: () => ({ x: 0, y: 0 }) };
  p.h.call(p.d.addon, 'petPan', gesture);
  assert.equal(p.playing(), 'drag');
  gesture.state = 3; p.h.call(p.d.addon, 'petPan', gesture);
  assert.equal(p.playing(), 'focus', '松手回到专注动作');
});

test('点击反馈在 happy/wave/shy/bow/sleep/step 中随机挑一个，不碰四类状态动作', () => {
  const p = setup(build(['idle', 'drag', 'focus', 'rest', 'happy', 'wave', 'shy', 'bow', 'sleep', 'step']));
  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'focus');
  const seen = new Set();
  const clickable = ['happy', 'wave', 'shy', 'bow', 'sleep', 'step'];
  for (let i = 0; i < 40; i++) {
    p.h.call(p.d.addon, 'petTap', { state: 3 });
    seen.add(p.d.s.petActionId);
    assert.equal(p.d.s.petActionHold, true, '点击动作播放期间挂起状态同步');
    p.d.s.petActionTimer.fire();
    assert.equal(p.d.s.petActionHold, false, '播完交还状态机');
  }
  assert.deepEqual([...seen].sort(), clickable.slice().sort(), '点击只在六个反馈动作里挑');
  assert.equal(p.playing(), 'focus', '点击结束后回到当前计时状态动作');
});

test('只有 sleep 和 step 的包也能被点击触发，不再回落到回弹', () => {
  const p = setup(build(['idle', 'sleep', 'step']));
  assert.equal(p.playing(), 'idle');
  const seen = new Set();
  for (let i = 0; i < 20; i++) {
    p.h.call(p.d.addon, 'petTap', { state: 3 });
    seen.add(p.d.s.petActionId);
    p.d.s.petActionTimer.fire();
  }
  assert.deepEqual([...seen].sort(), ['sleep', 'step'], '两种情况都可达');
  assert.equal(p.playing(), 'idle', '播完回到待机');
});

test('只有四类状态动作的包点击走回弹，不改变动作记忆', () => {
  const p = setup(fourPack());
  p.act('start'); p.pulse();
  assert.equal(p.playing(), 'focus');
  p.h.call(p.d.addon, 'petTap', { state: 3 });
  assert.equal(p.d.s.petActionId, 'bounce', '没有反馈动作时播放回弹');
  assert.equal(p.d.s.petActionHold, false, '回弹不进入挂起状态');
  assert.equal(p.playing(), 'focus', '点击期间保持当前动作');
  p.pulse();
  assert.equal(p.playing(), 'focus');
});

test('动作标识白名单接受 focus 与 rest，并拒绝未知标识', () => {
  const p = setup(fourPack());
  const model = p.h.context.MNPPetPackModel;
  const base = { schema: 1, id: 'x', name: 'x', author: 'x', version: '1', format: 'animated-webp', frameSize: 128, visualAnchorX: .5, poster: 'poster.png' };
  assert.deepEqual(model.manifest({ ...base, actions: [action('idle', '待机'), action('focus', '专注'), action('rest', '休息'), action('drag', '拖动')] }).actions.map(a => a.id), ['idle', 'focus', 'rest', 'drag']);
  assert.throws(() => model.manifest({ ...base, actions: [action('idle', '待机'), action('study', '学习')] }), /动作名称、路径无效或重复/);
  assert.ok(p.d.s.petPack, '四动作包本身可正常导入');
});
