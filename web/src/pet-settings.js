import { MNBridge } from './lib/mnBridge.js';
import { readPetPack } from './pet-pack-file.js';
import { ImagePetEditor, loadPetFile, loadPetImage } from './pet-image-editor.js';
const $ = id => document.getElementById(id);
export class PetSettings {
  constructor() {
    this.busy = false; this.ready = false; this.disposed = false; this.previewToken = 0;
    $('pet-pack-button').addEventListener('click', () => $('pet-pack-file').click());
    $('pet-image-button').addEventListener('click', () => $('pet-image-file').click());
    $('pet-pack-file').addEventListener('change', () => this.importPack($('pet-pack-file').files[0]));
    $('pet-image-file').addEventListener('change', () => this.openImage($('pet-image-file').files[0]));
    $('pet-visible').addEventListener('change', () => this.options({ visible: $('pet-visible').checked }));
    $('pet-menu-mode').addEventListener('change', () => this.options({ menuButtonMode: $('pet-menu-mode').value }));
    for (const id of ['pet-countdown-name', 'pet-countdown-date']) {
      $(id).addEventListener('input', () => { this.countdownDirty = true; });
      $(id).addEventListener('change', () => this.saveCountdown());
    }
    $('pet-countdown-form').addEventListener('submit', event => { event.preventDefault(); this.saveCountdown(); });
    $('pet-countdown-clear').addEventListener('click', () => { $('pet-countdown-name').value = ''; $('pet-countdown-date').value = ''; this.countdownDirty = true; this.saveCountdown(); });
    $('pet-edit').addEventListener('click', () => this.editImage());
    for (const id of ['size', 'opacity']) {
      $('pet-' + id).addEventListener('input', () => this.values());
      $('pet-' + id).addEventListener('change', () => this.options({ [id]: Number($('pet-' + id).value) / (id === 'opacity' ? 100 : 1) }));
    }
    for (const source of ['builtin', 'pack', 'image']) $('pet-use-' + source).addEventListener('click', () => this.options({ source }));
    $('pet-delete').addEventListener('click', () => this.remove());
    $('pet-delete-cancel').addEventListener('click', () => { this.deleting = null; this.controls(); this.status(''); });
    $('pet-zoom').addEventListener('input', () => { this.editor.zoom = Number($('pet-zoom').value) / 100; this.editor.draw(); $('pet-zoom-value').textContent = $('pet-zoom').value + '%'; });
    $('pet-reset').addEventListener('click', () => { this.editor.reset(); $('pet-zoom').value = 100; $('pet-zoom-value').textContent = '100%'; });
    $('pet-cancel').addEventListener('click', () => this.closeEditor());
    $('pet-confirm').addEventListener('click', () => this.importImage());
    $('pet-editor').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.closeEditor(); }
      if (event.key !== 'Tab') return;
      const targets = Array.from($('pet-editor').querySelectorAll('button:not(:disabled),input:not(:disabled),[tabindex="0"]'));
      const index = targets.indexOf(document.activeElement);
      if (!targets.length) { event.preventDefault(); return; }
      if (event.shiftKey && index <= 0 || !event.shiftKey && (index < 0 || index === targets.length - 1)) {
        event.preventDefault(); targets[event.shiftKey ? targets.length - 1 : 0].focus();
      }
    });
    this.editorViewport = () => {
      const viewport = window.visualViewport;
      if ($('pet-editor').hidden || !viewport) return;
      $('pet-editor').style.top = viewport.offsetTop + 'px';
      $('pet-editor').style.height = viewport.height + 'px';
    };
    window.visualViewport?.addEventListener('resize', this.editorViewport);
    window.visualViewport?.addEventListener('scroll', this.editorViewport);
    window.__MNP_PET_STATE__ = result => this.render(result);
    window.__MNP_PET_REFRESH__ = () => this.refresh();
    window.addEventListener('pagehide', () => this.dispose(), { once: true });
    this.refresh();
  }
  status(text, error = false) {
    if (this.disposed) return;
    for (const id of ['pet-status', 'pet-editor-status']) { $(id).textContent = text; $(id).dataset.error = String(error); }
  }
  values() { $('pet-size-value').textContent = $('pet-size').value; $('pet-opacity-value').textContent = $('pet-opacity').value + '%'; }
  controls() {
    const editing = !$('pet-editor').hidden;
    for (const id of ['pet-visible', 'pet-size', 'pet-opacity', 'pet-menu-mode', 'pet-use-pack', 'pet-use-image']) $(id).disabled = !this.ready || this.busy || editing || !this.state?.available;
    // 即使当前类型尚不存在，已保存的另一种角色仍可切换使用。
    $('pet-use-pack').disabled = !this.ready || this.busy || editing || !this.state?.pack;
    $('pet-use-builtin').disabled = !this.ready || this.busy || editing || !this.state?.builtin;
    $('pet-use-image').disabled = !this.ready || this.busy || editing || !this.state?.image?.hasImage;
    for (const id of ['pet-pack-button', 'pet-image-button', 'pet-pack-file', 'pet-image-file']) $(id).disabled = !this.ready || this.busy || editing;
    for (const id of ['pet-countdown-name', 'pet-countdown-date', 'pet-countdown-clear']) $(id).disabled = !this.ready || this.busy || editing;
    for (const id of ['pet-name', 'pet-zoom', 'pet-reset', 'pet-cancel', 'pet-confirm']) $(id).disabled = this.busy;
    if (this.editor) this.editor.disabled = this.busy;
    $('pet-settings').setAttribute('aria-busy', String(this.busy));
    $('pet-editor').setAttribute('aria-busy', String(this.busy));
    $('pet-confirm').textContent = this.busy ? this.editorMode === 'edit' ? '正在保存…' : '正在导入…' : this.editorMode === 'edit' ? '保存修改' : '确认导入';
    const source = this.state?.settings.source, meta = source === 'pack' ? this.state.pack : this.state?.image;
    $('pet-delete-row').hidden = !this.state?.available || !['pack', 'image'].includes(source);
    $('pet-edit').hidden = source !== 'image' || !this.state?.image?.hasImage;
    $('pet-edit').disabled = !this.ready || this.busy || editing;
    $('pet-delete').disabled = !this.ready || this.busy || editing;
    $('pet-delete-cancel').disabled = this.busy;
    $('pet-delete').textContent = this.deleting ? '确认删除' : '删除当前桌宠';
    $('pet-delete').setAttribute('aria-label', (this.deleting ? '确认删除 ' : '删除 ') + (source === 'pack' ? meta?.manifest.name || '动作桌宠' : meta?.name || '图片桌宠'));
    $('pet-delete-cancel').hidden = !this.deleting;
  }
  render(result) {
    if (this.disposed || !result?.settings) return;
    this.state = result; this.ready = true;
    if (!this.countdownDirty) {
      $('pet-countdown-name').value = result.countdown?.name || '';
      $('pet-countdown-date').value = result.countdown?.date || '';
    }
    $('pet-visible').checked = result.settings.visible; $('pet-size').value = result.settings.size; $('pet-opacity').value = Math.round(result.settings.opacity * 100); this.values();
    $('pet-menu-mode').value = result.settings.menuButtonMode === 'tap' ? 'tap' : 'always';
    const source = result.settings.source, meta = source === 'builtin' ? result.builtin : source === 'pack' ? result.pack : result.image;
    if (this.deleting && (this.deleting.source !== source || this.deleting.expectedRevision !== meta?.revision)) this.deleting = null;
    $('pet-current').textContent = result.available ? source === 'pack' ? meta.manifest.name : meta.name : '选择你的桌宠';
    $('pet-detail').textContent = result.available ? source === 'builtin' ? '自带桌宠' : source === 'pack' ? `${meta.manifest.author} · ${meta.manifest.actions.length} 组动作 · 播放待机动画` : '图片桌宠 · 静态显示' : '导入动作包或图片，显示在 MN 学习界面。';
    $('pet-sources').hidden = !result.builtin && !result.pack && !result.image?.hasImage;
    $('pet-use-builtin').textContent = result.builtin?.name || '哦鲸鲸';
    $('pet-use-pack').textContent = result.pack?.manifest.name || '动作桌宠'; $('pet-use-image').textContent = result.image?.hasImage ? result.image.name : '图片桌宠';
    for (const type of ['builtin', 'pack', 'image']) {
      const button = $('pet-use-' + type);
      button.hidden = type === 'builtin' ? !result.builtin : type === 'pack' ? !result.pack : !result.image?.hasImage;
      button.setAttribute('aria-pressed', String(type === source && result.available)); button.title = button.textContent;
    }
    this.controls(); this.preview(source, result.available ? meta.revision : '');
    if (result.warning) this.status(result.warning, true);
  }
  async refresh() {
    if (this.busy || this.disposed || !$('pet-editor').hidden) return;
    try { const result = await MNBridge.send('getPetState'); this.render(result); this.status(result.warning || '', !!result.warning); }
    catch (error) { this.status(error.message, true); }
  }
  async preview(source, revision) {
    const key = source + ':' + revision; if (this.previewKey === key) return;
    this.previewKey = key; const token = ++this.previewToken;
    $('pet-preview-image').hidden = true; $('pet-preview-image').removeAttribute('src'); $('pet-empty').hidden = false; $('pet-empty').textContent = revision ? '读取预览…' : '尚未导入';
    if (!revision) return;
    try {
      const text = await this.readAsset(source, revision, () => token === this.previewToken);
      if (this.disposed || token !== this.previewToken) return;
      $('pet-preview-image').src = 'data:image/png;base64,' + text; $('pet-preview-image').hidden = false; $('pet-empty').hidden = true;
    } catch (error) { if (token === this.previewToken && !this.disposed) { this.previewKey = ''; $('pet-empty').textContent = '预览暂不可用'; this.status(error.message, true); } }
  }
  async readAsset(source, revision, current = () => true) {
    let text = '', total;
    do {
      const reply = await MNBridge.send('getPetAsset', { source, revision, offset: text.length });
      if (this.disposed || !current()) throw new Error('桌宠图片读取已取消');
      if (reply.revision !== revision || reply.offset !== text.length || !Number.isSafeInteger(reply.total) || reply.total > 2796204 || reply.total < 1 || typeof reply.chunk !== 'string' || !reply.chunk.length || reply.chunk.length > 32768 || text.length + reply.chunk.length > reply.total || total && total !== reply.total) throw new Error('桌宠预览数据不完整');
      total = reply.total; text += reply.chunk;
    } while (text.length < total);
    if (!/^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/.test(text)) throw new Error('桌宠预览图片格式无效');
    return text;
  }
  async saveCountdown() {
    if (this.busy || !this.ready || this.disposed) return;
    const payload = { name: $('pet-countdown-name').value.trim(), date: $('pet-countdown-date').value };
    if (payload.name.length > 24 || /[\x00-\x1f\x7f]/.test(payload.name)) { this.status('请输入 24 字以内的名称', true); return; }
    this.busy = true; this.controls();
    try {
      const result = await MNBridge.send('setPetCountdown', payload);
      if (this.disposed) return;
      this.countdownDirty = false; this.render(result); this.status('倒计时已保存');
    } catch (error) { this.countdownDirty = true; this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) this.controls(); }
  }
  async options(patch) {
    if (this.busy || !this.ready) return; this.deleting = null; this.busy = true; this.controls();
    try { this.render(await MNBridge.send('setPetOptions', patch)); this.status(this.state.warning || '桌宠设置已生效', !!this.state.warning); }
    catch (error) { this.render(this.state); this.status(error.message, true); }
    finally { this.busy = false; this.controls(); }
  }
  async remove() {
    if (this.busy || !this.ready || !$('pet-editor').hidden) return;
    const source = this.state.settings.source, meta = source === 'pack' ? this.state.pack : this.state.image;
    if (!this.state.available || !['pack', 'image'].includes(source)) return;
    if (!this.deleting) {
      this.deleting = { source, expectedRevision: meta.revision };
      this.controls(); this.status('确认删除“' + (source === 'pack' ? meta.manifest.name : meta.name) + '”？删除后需要重新导入。'); return;
    }
    const request = this.deleting; this.busy = true; this.controls();
    try {
      this.render(await MNBridge.send('deletePet', request)); this.deleting = null; this.status('桌宠已删除，已切回自带角色“哦鲸鲸”');
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; this.controls(); }
  }
  async transfer(command, text, metadata) {
    const id = 'pet-' + Date.now() + '-' + Math.random().toString(36).slice(2); this.importId = id;
    try {
      await MNBridge.send(command, { phase: 'begin', id, length: text.length, ...metadata });
      for (let offset = 0; offset < text.length; offset += 32768) {
        if (this.disposed) throw new Error('导入已取消');
        this.status(`正在导入 ${Math.round(offset / text.length * 100)}%…`);
        await MNBridge.send(command, { phase: 'chunk', id, offset, text: text.slice(offset, offset + 32768) });
      }
      if (this.disposed) throw new Error('导入已取消');
      return await MNBridge.send(command, { phase: 'finish', id });
    } catch (error) { await MNBridge.send('cancelPetImport', { id }).catch(() => {}); throw error; }
    finally { this.importId = ''; }
  }
  async importPack(file) {
    if (!file || this.busy || !this.ready) return;
    this.deleting = null; this.busy = true; this.controls(); this.status('正在检查桌宠包…');
    const expectedRevision = this.state.pack?.revision || this.state.packRevision || '';
    try {
      const record = await readPetPack(file); if (this.disposed) return;
      this.render(await this.transfer('importPetPack', JSON.stringify(record), { expectedRevision }));
      this.status(this.state.warning || '动作包已导入并显示', !!this.state.warning);
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) { $('pet-pack-file').value = ''; this.controls(); } }
  }
  async openImage(file) {
    if (!file || this.busy || !this.ready) return;
    this.deleting = null; this.busy = true; this.controls(); this.status('正在打开图片…');
    const revision = this.state.image?.revision || '';
    try {
      const image = await loadPetFile(file); if (this.disposed) return;
      this.startEditor(image, (file.name.replace(/\.[^.]+$/, '').slice(0, 24) || '我的桌宠').replace(/[\x00-\x1f\x7f]/g, ''), revision, false);
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) { $('pet-image-file').value = ''; this.controls(); } }
  }
  async editImage() {
    if (this.busy || !this.ready || this.state.settings.source !== 'image' || !this.state.image?.hasImage || !$('pet-editor').hidden) return;
    const meta = { ...this.state.image };
    this.deleting = null; this.busy = true; this.controls(); this.status('正在读取桌宠图片…');
    try {
      const text = await this.readAsset('image', meta.revision);
      const image = await loadPetImage('data:image/png;base64,' + text);
      if (this.disposed) return;
      if (this.state.image?.revision !== meta.revision || this.state.settings.source !== 'image') throw new Error('桌宠已变化，请重新选择后编辑');
      this.startEditor(image, meta.name, meta.revision, true);
    } catch (error) { this.status(error.message, true); }
    finally { this.busy = false; if (!this.disposed) this.controls(); }
  }
  startEditor(image, name, revision, editing) {
    if (!this.editor) this.editor = new ImagePetEditor($('pet-crop'), () => {});
    this.editorMode = editing ? 'edit' : 'import'; this.editorOrigin = editing ? 'pet-edit' : 'pet-image-button';
    this.draftRevision = revision; this.editor.setImage(image, editing); $('pet-name').value = name;
    $('pet-editor-title').textContent = editing ? '编辑桌宠' : '导入桌宠';
    $('pet-editor-help').textContent = editing ? '调整当前图片的位置与缩放，保存后替换当前桌宠。' : '拖动图片调整位置，确认后显示为你的桌宠。';
    $('pet-zoom').value = 100; $('pet-zoom-value').textContent = '100%';
    this.returnScroll = window.scrollY;
    $('settings-main').hidden = true; document.body.classList.add('pet-editing'); $('pet-editor').hidden = false;
    $('pet-editor-content').scrollTop = 0; this.editorViewport(); this.status('');
    $('pet-editor-title').focus({ preventScroll: true });
  }
  leaveEditor(showCurrent = false) {
    if (this.editor) this.editor.clear();
    $('pet-editor').hidden = true; $('settings-main').hidden = false; document.body.classList.remove('pet-editing');
    window.scrollTo(0, showCurrent ? 0 : this.returnScroll || 0);
  }
  closeEditor() {
    if (this.busy) return;
    this.leaveEditor(); this.controls(); this.status(''); $(this.editorOrigin || 'pet-image-button').focus({ preventScroll: true });
  }
  async importImage() {
    if (this.busy || !this.editor?.image) return;
    const name = $('pet-name').value.trim();
    if (!name || name.length > 24 || /[\x00-\x1f\x7f]/.test(name)) { this.status('请输入 1–24 字的桌宠名称', true); return; }
    let picture; try { picture = this.editor.export(); } catch (error) { this.status(error.message, true); return; }
    const editing = this.editorMode === 'edit'; this.busy = true; this.controls();
    try {
      const result = await this.transfer('importPetImage', picture.base64, { expectedRevision: this.draftRevision, name, style: 'still', anchorX: picture.anchorX });
      if (this.disposed) return;
      this.leaveEditor(true); this.render(result); this.status(this.state.warning || (editing ? '桌宠修改已保存' : '图片已导入并显示'), !!this.state.warning);
    } catch (error) { this.status(error.message, true); }
    finally {
      this.busy = false;
      if (!this.disposed) { this.controls(); if ($('pet-editor').hidden) $(this.editorOrigin || 'pet-image-button').focus({ preventScroll: true }); }
    }
  }
  dispose() {
    this.disposed = true; ++this.previewToken; if (this.editor) this.editor.clear();
    window.visualViewport?.removeEventListener('resize', this.editorViewport);
    window.visualViewport?.removeEventListener('scroll', this.editorViewport);
    if (this.importId) MNBridge.send('cancelPetImport', { id: this.importId }).catch(() => {});
  }
}
