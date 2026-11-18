import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { resources } from '../scripts/bundle.mjs';
import { pets, picture, plain } from './pet-support.mjs';
const { settingsHTML } = await resources();

test('独立标识和文件目录不读写 Ai Bridge 数据，不包含 AI 服务或工作流业务', () => {
  const previousSettings = JSON.stringify({ visible: false, size: 64, source: 'image' });
  const values = new Map([['cn.marginnote.ai-bridge.pet.settings', previousSettings]]);
  const original = Buffer.from('Ai Bridge 原有桌宠文件');
  const files = new Map([['/documents/AI-Bridge/custom-pet.json', original]]);
  const h = pets({ values, files }), d = h.open();
  assert.equal(d.s.settings.visible, true); assert.equal(d.s.settings.source, 'builtin');
  h.upload(d, 'image', picture); d.command('setPetOptions', { size: 96 }); d.command('setPetCountdown', { name: '考研', date: '2026-12-19' });
  assert.equal(values.get('cn.marginnote.ai-bridge.pet.settings'), previousSettings);
  assert.ok(values.has('cn.marginnote.mn-pet.pet.settings'));
  assert.ok(values.has('cn.marginnote.mn-pet.pet.countdown'));
  assert.deepEqual(files.get('/documents/AI-Bridge/custom-pet.json'), original);
  assert.ok(h.writes.every(item => item.path.startsWith('/documents/MN-Pet/')));
  for (const name of ['AIBPets','AIBNative','MNPWorkflows','MNPWorkflowRunner','MNPExternalWorkflows','MNPUpload','MNPNotes']) assert.equal(h.context[name], undefined);
  for (const name of ['petRunWorkflow','petManageWorkflows','receiveExternalWorkflow']) assert.equal(h.addonClass.methods[name], undefined);
});

test('右上角按钮展开独立计时面板，反复开关复用页面且不创建存档', () => {
  const h = pets(), d = h.open(), values = plain(Array.from(h.values));
  for (let i = 0; i < 3; i++) {
    h.call(d.addon, 'petMenu'); assert.ok(d.s.menu.superview); assert.equal(d.s.focusController.kind, 'focus'); assert.match(d.s.focusController.settingsView.loaded.html, /id="focus-card"/);
    assert.equal(d.s.menuButton.accessibilityLabel, '收起菜单');
    h.call(d.addon, 'petMenu'); assert.equal(d.s.menu, null); assert.equal(d.s.menuButton.accessibilityLabel, '展开菜单');
  }
  assert.equal(h.files.size, 0); assert.equal(h.writes.length, 0); assert.deepEqual(plain(Array.from(h.values)), values);
});

test('独立设置只展示桌宠功能，ID 唯一，删除工作流与 AI 网页入口', t => {
  const dom = new JSDOM(settingsHTML); t.after(() => dom.window.close()); const doc = dom.window.document;
  assert.equal(doc.title, 'MN Pet 设置');
  const ids = Array.from(doc.querySelectorAll('[id]'), item => item.id); assert.equal(new Set(ids).size, ids.length);
  assert.equal(doc.querySelectorAll('[role=tab]').length, 4); assert.equal(doc.querySelector('#focus-card'), null); assert.equal(doc.querySelector('#workflows-panel'), null);
  assert.equal(doc.querySelector('#navigation-panel'), null); assert.equal(doc.querySelector('textarea'), null);
  assert.match(doc.querySelector('label[for=pet-menu-mode]').textContent, /菜单按钮/);
  assert.doesNotMatch(doc.body.textContent.replace(/<script[\s\S]*/, ''), /执行工作流|DeepSeek|Gemini|豆包/);
  assert.equal(doc.querySelector('#pet-countdown-date').type, 'date');
});

test('桥接仅接受本项目设置页与令牌，其他协议、视图和业务命令不生效', () => {
  const h = pets(), d = h.open(), c = d.controller;
  const request = (command, token = c.settingsToken) => 'mnpet://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId: 'test', token, command, payload: { size: 98 } }));
  assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions', 'wrong'), c.settingsView), false);
  assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions'), new h.context.UIView({ x: 0, y: 0, width: 1, height: 1 })), false);
  assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions').replace('mnpet:', 'mnaddon:'), c.settingsView), false);
  assert.equal(d.s.settings.size, 112);
  assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions'), c.settingsView), true); assert.equal(d.s.settings.size, 98);
  assert.equal(h.context.MNPWebCommands.local(c, request('getWorkflows'), c.settingsView), true);
  assert.ok(c.settingsView.scripts.at(-1).includes('不支持的桌宠设置命令'));
  c.visible = false; assert.equal(h.context.MNPWebCommands.local(c, request('setPetOptions'), c.settingsView), false);
});
