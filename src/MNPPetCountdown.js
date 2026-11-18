var MNPPetCountdown = (function () {
  function validDate(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    var parts = value.split('-').map(Number), date = new Date(parts[0], parts[1] - 1, parts[2]);
    return parts[0] >= 1900 && parts[0] <= 9999 && date.getFullYear() === parts[0] && date.getMonth() === parts[1] - 1 && date.getDate() === parts[2];
  }
  function normalize(raw) {
    raw = raw || {};
    return { name: typeof raw.name === 'string' ? raw.name.replace(/[\x00-\x1f\x7f]/g, '').trim().slice(0, 24) : '', date: validDate(raw.date) ? raw.date : '' };
  }
  function read() { try { return normalize(JSON.parse(MNPNative.preference('pet.countdown', '{}'))); } catch (_) { return normalize({}); } }
  function write(input) {
    if (!input || typeof input.name !== 'string' || input.name.length > 24 || /[\x00-\x1f\x7f]/.test(input.name) || typeof input.date !== 'string' || input.date && !validDate(input.date)) throw new Error('请输入 24 字以内的名称，并选择有效日期');
    var result = normalize(input); MNPNative.save('pet.countdown', JSON.stringify(result)); return result;
  }
  function describe(value, now) {
    var data = normalize(value); now = now || new Date();
    if (!data.name || !data.date) return { ready: false, title: '', value: '' };
    var parts = data.date.split('-').map(Number);
    // 按本地年月日计算日序号，避免夏令时和剩余小时影响天数。
    var days = Math.round((Date.UTC(parts[0], parts[1] - 1, parts[2]) - Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
    return { ready: true, days: days, title: days < 0 ? data.name + '已过' : days === 0 ? data.name : '离' + data.name + '还有', value: days === 0 ? '就是今天' : Math.abs(days) + ' 天' };
  }
  function midnight(now) { return Math.max(.1, (new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1).getTime() - now.getTime()) / 1000 + .1); }
  return { read: read, write: write, describe: describe, midnight: midnight, validDate: validDate };
})();
