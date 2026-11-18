const $ = id => document.getElementById('focus-' + id);
const palette = ['#5579d8', '#d88248', '#4b9a84', '#ab70be', '#d1657e', '#3b99b2', '#b49a3e', '#7972c4', '#7ca35c', '#b57759', '#be5870', '#588dba', '#a78ac7', '#6c9e97', '#d19c68', '#9f6c91', '#7295cc', '#aca35c', '#cd847c', '#689b65'];
const minutes = ms => (ms / 60000).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + ' 分钟';
const svgElement = (tag, attributes) => { const el = document.createElementNS('http://www.w3.org/2000/svg', tag); for (const [key, value] of Object.entries(attributes)) el.setAttribute(key, value); return el; };
export class FocusSubjectChart {
  constructor() {
    this.type = 'bar'; this.colors = new Map(); this.rows = []; this.signature = '';
    for (const button of $('chart-types').querySelectorAll('button')) button.addEventListener('click', () => { this.type = button.dataset.chart; this.visibility(); });
  }
  color(name) {
    if (!this.colors.has(name)) {
      let hash = 0; for (const letter of name) hash = (Math.imul(hash, 31) + letter.codePointAt(0)) >>> 0;
      const used = new Set(this.colors.values()); let color;
      for (let offset = 0; offset < palette.length; offset++) { const candidate = palette[(hash + offset) % palette.length]; if (!used.has(candidate)) { color = candidate; break; } }
      this.colors.set(name, color || `hsl(${(hash + this.colors.size * 137.508) % 360}, 56%, 49%)`);
    }
    return this.colors.get(name);
  }
  visibility() {
    const empty = !this.rows.length;
    $('subject-stats-layout').dataset.empty = String(empty); $('subject-breakdown').hidden = empty;
    $('subject-chart-scroll').hidden = empty || this.type !== 'bar'; $('pie').hidden = empty || this.type !== 'pie';
    for (const button of $('chart-types').querySelectorAll('button')) button.setAttribute('aria-pressed', String(button.dataset.chart === this.type));
  }
  render(rows, subjects) {
    // 先登记全部当前科目，切换范围或按时长重新排序时保留同一配色。
    for (const name of subjects) this.color(name);
    const signature = JSON.stringify(rows); if (signature === this.signature) return;
    this.signature = signature; this.rows = rows.filter(row => row.ms > 0);
    const total = this.rows.reduce((sum, row) => sum + row.ms, 0), max = Math.max(1, ...this.rows.map(row => row.ms));
    const percentage = row => (row.ms / total * 100).toLocaleString('zh-CN', { maximumFractionDigits: 1 }) + '%';
    $('subject-chart').replaceChildren(...this.rows.map(row => {
      const bar = document.createElement('div'), fill = document.createElement('span'), label = document.createElement('small'), value = document.createElement('em');
      const height = Math.max(1, row.ms / max * 100); bar.className = 'focus-subject-bar'; bar.dataset.subject = row.name;
      bar.setAttribute('role', 'img'); bar.setAttribute('aria-label', row.name + '：' + minutes(row.ms));
      fill.style.height = height + '%'; fill.style.backgroundColor = this.color(row.name);
      value.textContent = minutes(row.ms); value.style.bottom = height + '%'; label.textContent = row.name;
      bar.append(fill, value, label); return bar;
    }));
    const svg = svgElement('svg', { viewBox: '0 0 220 220', role: 'img', 'aria-label': '各科目专注时长占比' }); let start = -Math.PI / 2;
    for (const row of this.rows) {
      const angle = row.ms / total * Math.PI * 2, end = start + angle;
      const segment = this.rows.length === 1 ? svgElement('circle', { cx: 110, cy: 110, r: 96 }) : svgElement('path', { d: `M110 110 L${110 + Math.cos(start) * 96} ${110 + Math.sin(start) * 96} A96 96 0 ${angle > Math.PI ? 1 : 0} 1 ${110 + Math.cos(end) * 96} ${110 + Math.sin(end) * 96} Z` });
      segment.setAttribute('fill', this.color(row.name)); segment.setAttribute('stroke', '#fff'); segment.setAttribute('stroke-width', '2'); segment.dataset.subject = row.name;
      const title = svgElement('title', {}); title.textContent = row.name + '：' + minutes(row.ms) + ' · ' + percentage(row); segment.append(title); svg.append(segment); start = end;
    }
    $('pie').replaceChildren(svg);
    $('subject-stats').replaceChildren(...this.rows.map(row => {
      const line = document.createElement('div'), name = document.createElement('span'), dot = document.createElement('i'), value = document.createElement('span');
      line.className = 'focus-stat-row'; name.className = 'focus-stat-name'; dot.className = 'focus-stat-dot'; dot.style.backgroundColor = this.color(row.name); dot.setAttribute('aria-hidden', 'true');
      name.append(dot, document.createTextNode(row.name)); value.textContent = minutes(row.ms) + ' · ' + percentage(row) + ' · ' + row.count + ' 次'; line.append(name, value); return line;
    }));
    this.visibility();
  }
}
