import { FocusClient } from './focus-client.js';
import { FocusSubjectChart } from './focus-subject-chart.js';
const $ = id => document.getElementById('focus-' + id);
const durationKeys = ['countdownMinutes', 'workMinutes', 'shortBreakMinutes', 'longBreakMinutes', 'roundsPerCycle'];
const boolKeys = ['autoStartBreak', 'autoStartWork'];
const minutes = ms => (ms / 60000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 分钟';
// 热力图排布参数，与 settings-panel.css 里格子的 gap 保持一致。
// 宽度够时全部 53 周都画出来（不滚动、全览）；宽度不够时按最小边长反推最多能放几列，
// 只从最早一侧裁掉整周，最近日期始终保留在右侧。
const heatGap = 3;
const heatMinCell = 8;
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
    this.heat = heat && Array.isArray(heat.ms) && heat.ms.length ? heat : null;
    // 面板宽度变化时要重算能画多少列，否则会被裁掉的旧列一直留在页面上。
    if (!this.heatObserver && typeof ResizeObserver === 'function') {
      this.heatObserver = new ResizeObserver(() => this.paintHeatmap());
      this.heatObserver.observe($('heatmap'));
      window.addEventListener('pagehide', () => this.heatObserver.disconnect(), { once: true });
    }
    this.paintHeatmap();
  }
  // 按可用宽度决定画多少列：从最近一周往前取整周，放不下的部分直接不画，所以热力图不需要横向滚动。
  // 宽度读不到时（面板还没显示）先按全年画一次，等 ResizeObserver 报出真实宽度再重画。
  paintHeatmap() {
    const heat = this.heat, box = $('heatmap'), months = $('heatmap-months');
    if (!heat) { box.replaceChildren(); months.replaceChildren(); this.heatSignature = ''; return; }
    const days = heat.ms, total = Math.ceil(days.length / 7), width = box.clientWidth;
    // 先按最小边长算出这行宽度最多放几列；放得下就全画（全览），放不下才从最早一侧裁整周。
    const fit = width > 0 ? Math.max(1, Math.floor((width + heatGap) / (heatMinCell + heatGap))) : total;
    const columns = Math.min(total, fit);
    const first = (total - columns) * 7;
    const size = width > 0 ? (width - (columns - 1) * heatGap) / columns : 0;
    // 每秒都会收到同一份热力图，用轻量滚动哈希判断是否真的变了，避免整表重绘。
    let hash = 0;
    for (const ms of days) hash = (Math.imul(hash, 31) + ms) | 0;
    const signature = heat.start + ':' + heat.today + ':' + days.length + ':' + hash + ':' + columns + ':' + Math.round(size);
    if (signature === this.heatSignature) return;
    this.heatSignature = signature;
    // 列宽由脚本算出后写进 CSS 变量，格子和月标签共用同一套列宽，永远对齐。
    // 变量挂在滚动容器上，月标签行与格子行是兄弟节点，只有共同父级才能让两者取到同一个值。
    if (size > 0) (box.closest('.focus-heatmap-scroll') || box).style.setProperty('--mnp-heat-cell', size.toFixed(2) + 'px');
    const part = heat.start.split('-').map(Number);
    const cells = [];
    for (let index = first; index < days.length; index++) {
      const at = new Date(part[0], part[1] - 1, part[2] + index);
      const cell = document.createElement('span'); cell.className = 'focus-heatmap-cell';
      const future = index > heat.today;
      if (future) cell.dataset.future = 'true'; else cell.dataset.level = String(this.heatLevel(days[index]));
      const label = (at.getMonth() + 1) + '月' + at.getDate() + '日' + (future ? '：尚未到来' : '：' + minutes(days[index]));
      cell.title = label; cell.setAttribute('aria-label', label);
      cells.push(cell);
    }
    box.replaceChildren(...cells);
    box.setAttribute('aria-label', '近 ' + columns + ' 周专注热力图');
    // 月标签与格子列一一对应：只在首格月份和上一列不同的列上标注，裁掉左侧后仍以可见列重新计算。
    // 列很窄时相邻两个月份会挤在一起，所以按一列的实际宽度算出至少隔多少列才放得下，放不下就跳过一个。
    const marks = [], span = Math.ceil(24 / (size + heatGap));
    let previous = -1, labelled = -span;
    for (let column = 0; column < columns; column++) {
      const at = new Date(part[0], part[1] - 1, part[2] + first + column * 7);
      if (at.getMonth() !== previous) {
        previous = at.getMonth();
        if (column - labelled >= span) { marks.push((at.getMonth() + 1) + '月'); labelled = column; } else marks.push('');
      } else marks.push('');
    }
    months.replaceChildren(...marks.map(text => { const span = document.createElement('span'); span.textContent = text; return span; }));
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
