import { FocusClient } from './focus-client.js';
import { FocusSubjectChart } from './focus-subject-chart.js';
const $ = id => document.getElementById('focus-' + id);
const durationKeys = ['countdownMinutes', 'workMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'roundsPerCycle'];
const boolKeys = ['autoStartBreak', 'autoStartWork'];
const minutes = ms => (ms / 60000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 分钟';
function summaryTime(id, ms) {
  const unit = document.createElement('span'); unit.className = 'focus-summary-unit'; unit.textContent = ' 分钟';
  $(id).replaceChildren(document.createTextNode((ms / 60000).toLocaleString('zh-CN', { maximumFractionDigits: 1 })), unit);
}
export class FocusSettings extends FocusClient {
  constructor() {
    super('focus-status');
    this.range = 'week';
    this.drafts = new Set(); this.feedback = 'status'; this.subjectChart = new FocusSubjectChart();
    for (const key of [...durationKeys, ...boolKeys]) $(key).addEventListener('input', () => {
      this.drafts.add(key); this.dirty = true; $(key === 'countdownMinutes' ? 'countdown-status' : 'pomodoro-status').textContent = ''; this.controls();
    });
    $('countdown-settings').addEventListener('submit', event => {
      event.preventDefault(); this.configure({ action: 'settings', values: this.values(['countdownMinutes']) }, this.savedMessage('倒计时'), ['countdownMinutes'], 'countdown-status');
    });
    $('settings').addEventListener('submit', event => {
      event.preventDefault(); const keys = [...durationKeys.filter(key => key !== 'countdownMinutes'), ...boolKeys];
      this.configure({ action: 'settings', values: this.values(keys) }, this.savedMessage('番茄钟'), keys, 'pomodoro-status');
    });
    $('alertOnFinish').addEventListener('change', () => this.configure({ action: 'settings', values: { alertOnFinish: $('alertOnFinish').checked } }, '提醒设置已保存'));
    $('subject').addEventListener('change', () => this.configure({ action: 'selectSubject', name: $('subject').value }, '', [...durationKeys, ...boolKeys]));
    $('add-subject').addEventListener('submit', event => {
      event.preventDefault(); const name = $('subject-name').value.trim();
      if (!name) { this.status('请输入科目名称', true); return; }
      this.configure({ action: 'addSubject', name }, '科目已添加', [...durationKeys, ...boolKeys]).then(ok => { if (ok) $('subject-name').value = ''; });
    });
    $('remove-subject').addEventListener('click', () => {
      if (this.confirm !== 'remove') { this.confirm = 'remove'; this.controls(); this.status('再次点击确认删除当前科目；已保存的历史统计保留。'); return; }
      this.configure({ action: 'removeSubject', name: this.state.current }, '科目已删除，历史记录已保留', [...durationKeys, ...boolKeys]);
    });
    $('save-preset').addEventListener('click', () => this.configure({ action: 'savePreset', values: this.values(durationKeys) }, '已保存当前科目的专属时长', durationKeys));
    $('clear-preset').addEventListener('click', () => this.configure({ action: 'clearPreset' }, '已改为使用全局时长', durationKeys));
    $('range').addEventListener('change', () => { this.feedback = 'stats-status'; this.range = $('range').value; this.request('getFocusState', {}); });
    this.controls();
  }
  values(keys) { return Object.fromEntries(keys.map(key => [key, boolKeys.includes(key) ? $(key).checked : Number($(key).value)])); }
  savedMessage(label) { return label + '设置已保存' + (['running', 'paused'].includes(this.state?.state.status) ? '，下次计时生效' : ''); }
  async configure(payload, message = '', cleared = [], feedback = 'status') {
    if (this.busy || !this.ready) return false;
    this.feedback = feedback;
    const ok = await this.request('configureFocus', payload, false, message);
    if (ok) { for (const key of cleared) this.drafts.delete(key); this.dirty = this.drafts.size > 0; this.render(this.state); }
    else if (this.state) { $('alertOnFinish').checked = this.state.settings.alertOnFinish; }
    return ok;
  }
  status(text, error = false) {
    super.status(text, error);
    this.statusElement.hidden = this.feedback !== 'status';
    for (const id of ['countdown-status', 'pomodoro-status', 'stats-status']) {
      $(id).textContent = id === this.feedback || id === 'stats-status' && error ? text : ''; $(id).dataset.error = String(error);
    }
  }
  controls() {
    const countdownDirty = this.drafts.has('countdownMinutes'), pomodoroDirty = [...this.drafts].some(key => key !== 'countdownMinutes');
    $('countdown-card').dataset.dirty = String(countdownDirty); $('pomodoro-card').dataset.dirty = String(pomodoroDirty);
    $('countdown-draft').textContent = countdownDirty ? '未保存' : '单次专注'; $('pomodoro-draft').textContent = pomodoroDirty ? '未保存' : '专注与休息循环';
    const blocked = !this.ready || this.busy || document.body.classList.contains('pet-editing');
    for (const input of document.getElementById('focus-settings-panel').querySelectorAll('input,button,select')) input.disabled = blocked;
    $('range').disabled = blocked;
    for (const button of $('chart-types').querySelectorAll('button')) button.disabled = blocked;
    const locked = ['running', 'paused'].includes(this.state?.state.status);
    for (const input of [$('subject'), $('subject-name'), $('remove-subject'), ...$('add-subject').querySelectorAll('button')]) input.disabled = blocked || locked;
    $('subject-lock').hidden = !locked;
    if (!this.state?.state || blocked) return;
    $('remove-subject').textContent = this.confirm === 'remove' ? '确认删除科目' : '删除科目';
    $('clear-preset').hidden = !this.state.hasPreset;
  }
  render(data) {
    if (!this.accept(data)) return;
    const subjectSignature = JSON.stringify(data.subjects);
    if (this.subjectSignature !== subjectSignature) {
      $('subject').replaceChildren(...data.subjects.map(name => { const option = document.createElement('option'); option.value = name; option.textContent = name; return option; }));
      this.subjectSignature = subjectSignature;
    }
    $('subject').value = data.current;
    for (const key of durationKeys) if (!this.drafts.has(key)) $(key).value = data.settings[key];
    for (const key of boolKeys) if (!this.drafts.has(key)) $(key).checked = data.settings[key];
    $('alertOnFinish').checked = data.settings.alertOnFinish;
    $('preset-hint').textContent = data.hasPreset ? '“' + data.current + '”使用专属时长，保存时会同时更新。' : '当前使用全局时长，可为此科目保存专属时长。';
    const stats = data.stats;
    this.subjectChart.render(stats.rows, data.subjects);
    summaryTime('today-time', stats.todayMs); summaryTime('range-time', stats.totalMs); summaryTime('lifetime-time', stats.lifetimeMs);
    $('today-count').textContent = stats.todayCount + ' 次'; $('range-count').textContent = stats.count + ' 次'; $('lifetime-count').textContent = stats.lifetimeCount + ' 次';
    $('range-label').textContent = { day: '今天', week: '最近 7 天', month: '最近 30 天' }[this.range];
    const signature = JSON.stringify(stats);
    if (signature !== this.statsSignature) {
      this.statsSignature = signature; const max = Math.max(60000, ...stats.series.map(row => row.ms));
      $('chart').dataset.range = this.range;
      $('chart').replaceChildren(...stats.series.map(row => {
        const bar = document.createElement('div'); bar.className = 'focus-bar'; bar.title = row.label + '：' + minutes(row.ms);
        bar.setAttribute('aria-label', bar.title);
        const fill = document.createElement('span'); fill.style.height = Math.max(row.ms > 0 ? 2 : 0, row.ms / max * 100) + '%';
        const label = document.createElement('small'); label.textContent = row.label; bar.append(fill, label); return bar;
      }));
      $('empty').hidden = stats.totalMs > 0;
    }
    this.controls();
  }
}
