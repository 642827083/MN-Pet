const pending = new Map();
window.__MNP_BRIDGE_RECEIVE__ = function (response) {
  const request = pending.get(response.requestId);
  if (!request) return;
  pending.delete(response.requestId); clearTimeout(request.timer);
  if (response.error) request.reject(new Error(response.error)); else request.resolve(response.payload);
};
export const MNBridge = {
  async send(command, payload = {}) {
    if (window.mn && typeof window.mn.call === 'function') {
      const reply = await window.mn.call(command, payload);
      if (reply && reply.error) throw new Error(reply.error.message || reply.error.code || 'MN 通信失败');
      return reply;
    }
    const requestId = Date.now().toString(36) + '-' + Math.random().toString(36).slice(2);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { pending.delete(requestId); reject(new Error('设置页面连接超时，请重新打开插件')); }, 12000);
      pending.set(requestId, { resolve, reject, timer });
      const frame = document.createElement('iframe'); frame.hidden = true;
      frame.src = 'mnpet://bridge?payload=' + encodeURIComponent(JSON.stringify({ requestId, command, payload, token: window.__MNP_SETTINGS_TOKEN__ }));
      document.body.appendChild(frame); setTimeout(() => frame.remove(), 800);
    });
  }
};
