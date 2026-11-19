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
  // 与原生同一套阈值：0 无、30 分钟以下轻、1 小时以下中、2 小时以下高、其余很高。
  heatLevel(ms) { return ms <= 0 ? 0 : ms < 1800000 ? 1 : ms < 3600000 ? 2 : ms < 7200000 ? 3 : 4; }
  // 原生只下发起点、今天下标与毫秒数组，日期在这里按天累加还原，避免推送富对象。
  renderHeatmap(heat) {
    const days = heat && Array.isArray(heat.ms) ? heat.ms : [];
    if (!days.length) { $('heatmap').replaceChildren(); $('heatmap-months').replaceChildren(); return; }
    // 每秒都会收到同一份热力图，用轻量滚动哈希判断是否真的变了，避免整表重绘。
    let hash = 0;
    for (const ms of days) hash = (Math.imul(hash, 31) + ms) | 0;
    const signature = heat.start + ':' + heat.today + ':' + days.length + ':' + hash;
    if (signature === this.heatSignature) return;
    this.heatSignature = signature;
    const part = heat.start.split('-').map(Number);
    const origin = new Date(part[0], part[1] - 1, part[2]);
    const box = days.map((ms, index) => {
      const at = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + index);
      const cell = document.createElement('span'); cell.className = 'focus-heatmap-cell';
      const future = index > heat.today;
      if (future) cell.dataset.future = 'true'; else cell.dataset.level = String(this.heatLevel(ms));
      const label = (at.getMonth() + 1) + '月' + at.getDate() + '日' + (future ? '：尚未到来' : '：' + minutes(ms));
      cell.title = label; cell.setAttribute('aria-label', label);
      return cell;
    });
    $('heatmap').replaceChildren(...box);
    // 月标签按列定位：只在每列首格所在月份与上一列不同的列上标注。
    // 这里不加抽稀：月份之间相隔 4 列以上，只要 CSS 里月标签与格子的列宽定义一致就不会压字。
    const columns = Math.ceil(days.length / 7), marks = [];
    for (let column = 0; column < columns; column++) marks.push('');
    let previous = -1;
    for (let column = 0; column < columns; column++) {
      const at = new Date(origin.getFullYear(), origin.getMonth(), origin.getDate() + column * 7);
      if (at.getMonth() !== previous) { marks[column] = (at.getMonth() + 1) + '月'; previous = at.getMonth(); }
    }
    $('heatmap-months').replaceChildren(...marks.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
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
    $('streak-current').textContent = stats.streakCurrent + ' 天'; $('streak-best').textContent = stats.streakBest + ' 天';
    this.renderHeatmap(data.heatmap);
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
