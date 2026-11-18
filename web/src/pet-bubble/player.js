(function () {
  const bubble = document.getElementById('bubble'), name = document.getElementById('name'), value = document.getElementById('value');
  let token = -1;
  // 原项目按主体实际包围盒对齐文字，保留同样的测量方式。
  function measure() {
    const shape = bubble.querySelector('.dshwv-bshape');
    if (!shape || typeof shape.getBBox !== 'function') return;
    const box = shape.getBBox();
    if (!(box.width > 0 && box.height > 0)) return;
    bubble.style.setProperty('--dshw-vx', ((box.x + box.width / 2) / 1026 * 100) + '%');
    bubble.style.setProperty('--dshw-vy', ((box.y + box.height / 2) / 700 * 100) + '%');
  }
  window.MNPPetBubblePage = {
    set(data, nextToken) {
      if (!data || typeof data.open !== 'boolean' || typeof data.title !== 'string' || typeof data.value !== 'string' || !Number.isSafeInteger(nextToken) || nextToken <= token) return false;
      token = nextToken; name.textContent = data.title; value.textContent = data.value;
      document.getElementById('countdown-line').hidden = !data.title && !data.value;
      const time = typeof data.time === 'string' ? data.time : '25:00';
      document.getElementById('focus-time').textContent = time;
      bubble.classList.toggle('mnp-long-time', time.length > 5);
      document.getElementById('focus-phase').textContent = (data.phase || '专注') + ' · ' + ({ running: '进行中', paused: '已暂停', idle: '未开始', completed: '已完成' }[data.status] || '未开始');
      measure();
      // 首次打开先落实关闭态；之后只切换原项目的显示类，延迟和顺序交给原 CSS。
      bubble.getBoundingClientRect(); bubble.classList.toggle('dshwv-pop-open', data.open); return true;
    },
    stop() { bubble.classList.remove('dshwv-pop-open'); return true; }
  };
  measure();
})();
