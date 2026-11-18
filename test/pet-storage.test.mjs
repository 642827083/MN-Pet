import test from 'node:test';
import assert from 'node:assert/strict';
import { pets, pack, picture, plain } from './pet-support.mjs';

const root = '/documents/MN-Pet/', old = '/documents/cn.marginnote.mn-pet/';
const files = ['pet-pack.json', 'custom-pet.json', 'pet-pack-poster.png', 'custom-pet-image.png'];
function imported() {
  const h = pets(), d = h.open(); h.upload(d); h.upload(d, 'image', picture);
  return { h, d };
}

test('直接读取新目录的桌宠存档与缓存，旧目录保持原样', () => {
  const { h } = imported();
  h.files.set(root + files[2], Buffer.from(picture, 'base64')); h.files.set(root + files[3], Buffer.from(picture, 'base64'));
  const expected = new Map(files.map(name => [name, Buffer.from(h.files.get(root + name))]));
  for (const name of files) h.files.set(old + name, Buffer.from('旧目录原文件'));
  const before = new Map(h.files), next = pets({ files: h.files, values: h.values }), d = next.open();
  assert.equal(d.s.settings.source, 'image'); assert.ok(d.s.imageView.image); assert.ok(d.s.petPack);
  for (const name of files) { assert.deepEqual(h.files.get(root + name), expected.get(name)); assert.deepEqual(h.files.get(old + name), before.get(old + name)); }
  assert.equal(next.writes.length, 0);
});

test('仅有旧目录桌宠时不迁移，新导入只写 MN-Pet 且不触碰旧文件', () => {
  const { h } = imported(), previous = new Map(files.slice(0, 2).map(name => [old + name, h.files.get(root + name)]));
  const before = new Map(previous), next = pets({ files: previous, values: h.values }), d = next.open();
  const state = d.command('getPetState');
  assert.equal(state.pack, null); assert.equal(state.image.hasImage, false); assert.equal(state.warning, '');
  assert.equal(next.writes.length, 0); assert.equal(previous.size, before.size);
  next.upload(d, 'image', picture); next.upload(d);
  assert.ok(previous.has(root + 'custom-pet.json')); assert.ok(previous.has(root + 'pet-pack.json'));
  assert.ok(next.writes.every(write => write.path.startsWith(root)));
  for (const [path, bytes] of before) assert.deepEqual(previous.get(path), bytes);
});

for (const source of ['image', 'pack']) test(source + ' 删除清空图片内容与缓存，切回哦鲸鲸并同步窗口，重启不复活，允许重新导入', () => {
  const { h, d } = imported(); d.command('setPetOptions', { source });
  const second = h.open(), state = d.command('getPetState'), expectedRevision = state[source].revision;
  const name = source === 'pack' ? 'pet-pack.json' : 'custom-pet.json';
  const cached = source === 'pack' ? 'pet-pack-poster.png' : 'custom-pet-image.png';
  h.files.set(root + cached, Buffer.from(picture, 'base64'));
  const otherSource = source === 'image' ? 'pack' : 'image', before = plain(state[otherSource]);
  const result = d.command('deletePet', { source, expectedRevision });
  assert.equal(result.settings.source, 'builtin'); assert.equal(result.builtin.name, '哦鲸鲸');
  assert.equal(second.s.settings.source, 'builtin'); assert.equal(second.s.animationUI, null);
  assert.equal(result.image.hasImage && source === 'image', false); if (source === 'pack') assert.equal(result.pack, null);
  assert.deepEqual(plain(result[otherSource]), before);
  assert.equal(h.files.get(root + cached).length, 0); assert.ok(h.files.get(root + name).length < 300);
  assert.throws(() => d.command('getPetAsset', { source, revision: expectedRevision, offset: 0 }), /已变化|没有可读取/);
  const restarted = pets({ files: h.files, values: h.values }).open();
  assert.equal(restarted.s.settings.source, 'builtin'); assert.ok(restarted.s.imageView.image);
  assert.equal(restarted.command('getPetState').warning, '');
  assert.equal(h.upload(d, source, source === 'image' ? picture : undefined).settings.source, source);
});

test('删除非当前角色不改变显示开关、所用角色或其他设置，也不能删除自带角色', () => {
  const { h, d } = imported(); d.command('setPetOptions', { visible: false, size: 90 });
  const before = plain(d.s.settings);
  const result = d.command('deletePet', { source: 'pack', expectedRevision: d.s.petPack.revision });
  assert.deepEqual(plain(result.settings), before);
  const writes = h.writes.length;
  for (const source of ['builtin', '../custom-pet', undefined]) assert.throws(() => d.command('deletePet', { source }), /只能删除/);
  assert.equal(h.writes.length, writes);
});

test('删除失败、过期版本或非设置页面操作保留原角色，不让旧导入任务恢复已删角色', () => {
  const { h, d } = imported(), revision = d.s.customPet.revision, original = Buffer.from(h.files.get(root + 'custom-pet.json'));
  const request = { source: 'image', expectedRevision: revision };
  h.failWrite(root + 'custom-pet.json'); assert.throws(() => d.command('deletePet', request), /删除失败/);
  assert.deepEqual(h.files.get(root + 'custom-pet.json'), original); assert.equal(d.s.settings.source, 'image');
  h.failWrite(''); assert.throws(() => d.command('deletePet', { ...request, expectedRevision: 'stale' }), /已变化/);
  h.files.set(root + 'custom-pet-image.png', Buffer.from(picture, 'base64')); h.failWrite(root + 'custom-pet-image.png');
  assert.throws(() => d.command('deletePet', request), /缓存清理失败/); assert.deepEqual(h.files.get(root + 'custom-pet.json'), original);
  h.failWrite(''); d.controller.activePage = 'gpt'; assert.throws(() => d.command('deletePet', request), /设置页/); d.controller.activePage = 'settings';
  const second = h.open(); second.command('importPetImage', { phase: 'begin', id: 'pending', length: picture.length, expectedRevision: revision, name: '等待导入', style: 'still', anchorX: .5 });
  d.command('deletePet', request); assert.equal(second.s.customPetTransfer, null);
  assert.throws(() => second.command('importPetImage', { phase: 'finish', id: 'pending' }), /已过期/);
});

test('删除新目录角色后不读取旧目录备份，旧备份保持原样', () => {
  const { h, d } = imported(), backup = Buffer.from(h.files.get(root + 'pet-pack.json'));
  d.command('deletePet', { source: 'pack', expectedRevision: d.s.petPack.revision }); h.files.set(old + 'pet-pack.json', backup);
  const next = pets({ files: h.files, values: h.values }).open();
  assert.equal(next.command('getPetState').pack, null); assert.equal(next.command('getPetState').warning, '');
  assert.deepEqual(h.files.get(old + 'pet-pack.json'), backup);
});

test('独立运行环境中早先开始的动作包导入不能跨过删除记录重新保存', () => {
  const h = pets(), d = h.open(), other = pets({ files: h.files, values: h.values }), pending = other.open();
  const text = JSON.stringify(pack);
  pending.command('importPetPack', { phase: 'begin', id: 'old-job', length: text.length, expectedRevision: '' });
  for (let offset = 0; offset < text.length; offset += 32768) pending.command('importPetPack', { phase: 'chunk', id: 'old-job', offset, text: text.slice(offset, offset + 32768) });
  h.upload(d); d.command('deletePet', { source: 'pack', expectedRevision: d.s.petPack.revision });
  assert.throws(() => pending.command('importPetPack', { phase: 'finish', id: 'old-job' }), /其他面板更新/);
  assert.equal(JSON.parse(h.files.get(root + 'pet-pack.json')).deleted, true);
});
