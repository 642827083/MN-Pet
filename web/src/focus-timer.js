import { FocusClient } from './focus-client.js';
import { FocusSubjects } from './focus-subjects.js';
const $ = id => document.getElementById('focus-' + id);
function clock(ms, up) {
  const seconds = Math.max(0, up ? Math.floor(ms / 1000) : Math.ceil(ms / 1000)), hours = Math.floor(seconds / 3600);
  return (hours ? hours + ':' : '') + String(Math.floor(seconds / 60) % 60).padStart(2, '0') + ':' + String(seconds % 60).padStart(2, '0');
}
export class FocusTimer extends FocusClient {
  constructor() {
    super('focus-status');
    this.subjects = new FocusSubjects(name => this.request('configureFocus', { action: 'selectSubject', name }), () => this.controls());
    for (const action of ['start', 'pause', 'reset', 'skip', 'record']) $(action).addEventListener('click', () => {
      if (action === 'reset' && (['running', 'paused'].includes(this.state?.state.status) || this.state?.state.mode === 'countup' && this.state.displayMs > 0) && this.confirm !== 'reset') {
        this.confirm = 'reset'; this.controls(); this.status('再次点击确认重置；已保存的统计保留。'); return;
      }
      this.request('focusAction', { action }, false, action === 'record' ? '已保存新增的专注时间' : '');
    });
    for (const button of $('mode').querySelectorAll('button')) button.addEventListener('click', () => this.selectMode(button.dataset.mode));
    this.modeSlider = $('mode').querySelector('.focus-mode-slider');
    if (this.modeSlider) this.modeSlider.style.transition = 'none';
    this.moveModeSlider();
    setTimeout(() => this.settleModeSlider(), 1200);
    $('open-settings').addEventListener('click', () => this.request('openFocusSettings', {}));
    this.controls();
  }
  moveModeSlider() {
    if (!this.modeSlider) return;
    const buttons = [...$('mode').querySelectorAll('button')];
    const index = Math.max(0, buttons.findIndex(button => button.getAttribute('aria-pressed') === 'true'));
    this.modeSlider.style.transform = 'translate3d(' + index * 100 + '%,0,0)';
  }
  selectMode(mode) {
    if (this.busy || !this.modeSlider) return;
    this.applyMode(mode);
    this.request('focusAction', { action: 'mode', mode });
  }
  applyMode(mode) {
    for (const button of $('mode').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.mode === mode));
    this.moveModeSlider();
    this.settleModeSlider();
  }
  settleModeSlider() {
    if (this.modeSettled || !this.modeSlider) return;
    this.modeSettled = true;
    const restore = () => { if (this.modeSlider) this.modeSlider.style.transition = ''; };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(restore); else setTimeout(restore, 16);
  }
  controls() {
    const blocked = !this.ready || this.busy;
    for (const input of $('card').querySelectorAll('button')) input.disabled = blocked || this.subjects.open;
    const locked = ['running', 'paused'].includes(this.state?.state.status);
    if (locked && this.subjects.open) this.subjects.close(false);
    this.subjects.update(this.state?.subjects || [], locked ? this.state.state.subject || this.state.current : this.state?.current || '未分类', blocked || locked);
    $('subject').disabled = blocked || locked;
    $('subject-caption').textContent = locked ? '当前科目 · 已锁定' : '当前科目';
    if (!this.state?.state) return;
    const s = this.state.state, up = s.mode === 'countup';
    for (const button of $('mode').querySelectorAll('button')) button.disabled = !this.ready || this.subjects.open || !['idle', 'completed'].includes(s.status) || s.upAccumMs > 0;
    $('start').hidden = s.status === 'running'; $('start').textContent = s.status === 'paused' ? '继续' : s.status === 'completed' ? '再次计时' : s.mode !== 'pomodoro' ? '开始计时' : s.phase === 'work' ? '开始专注' : '开始休息';
    $('pause').hidden = s.status !== 'running'; $('skip').hidden = s.mode !== 'pomodoro'; $('record').hidden = !up;
    $('record').disabled = blocked || this.subjects.open || up && this.state.displayMs <= s.upRecordedMs;
    $('reset').textContent = this.confirm === 'reset' ? '确认重置' : '重置';
  }
  render(data) {
    if (!this.accept(data)) return;
    const s = data.state, up = s.mode === 'countup', time = clock(data.displayMs, up);
    $('time').textContent = time; $('time').classList.toggle('focus-long-time', time.length > 5);
    $('phase').textContent = data.label;
    $('timer-state').textContent = ({ running: '进行中', paused: '已暂停', idle: '未开始', completed: '已完成' })[s.status];
    $('round').textContent = up ? '仅记录新增时长' : s.mode === 'countdown' ? s.status === 'completed' ? '已自动计入专注统计' : '完成后自动记录专注' : '本轮完成 ' + s.round + ' 次专注';
    $('progress').value = up ? (data.displayMs % 3600000) / 3600000 : Math.min(1, Math.max(0, 1 - data.displayMs / s.totalMs));
    this.applyMode(s.mode);
    $('subject').title = ['running', 'paused'].includes(s.status) ? '计时已开始，完成或重置后才能更改科目' : '当前科目：' + data.current;
    this.controls();
  }
}
