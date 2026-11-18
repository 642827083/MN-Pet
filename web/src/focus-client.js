import { MNBridge } from './lib/mnBridge.js';
export class FocusClient {
  constructor(statusId) {
    this.statusElement = document.getElementById(statusId);
    this.ready = false; this.busy = false; this.dirty = false; this.disposed = false; this.confirm = '';
    window.__MNP_FOCUS_STATE__ = data => this.render(data);
    window.addEventListener('pagehide', () => { this.disposed = true; }, { once: true });
  }
  status(text, error = false) {
    this.statusElement.textContent = text; this.statusElement.dataset.error = String(error);
    this.statusElement.dispatchEvent(new Event('mnp:focus-status', { bubbles: true }));
  }
  refresh() { return this.request('getFocusState', {}); }
  accept(data) {
    if (this.disposed || !data) return false;
    if (data.error) { this.ready = false; this.status(data.error, true); this.controls(); return false; }
    if (!data.state || this.state && data.capturedAt < this.state.capturedAt) return false;
    if (!this.ready && this.statusElement.dataset.error === 'true') this.status('');
    this.state = data; this.ready = true; return true;
  }
  async request(command, payload, saved = false, message = '') {
    if (this.busy || this.disposed) return false;
    this.busy = true; this.controls();
    try {
      const data = await MNBridge.send(command, this.range ? { ...payload, range: this.range } : payload);
      if (this.disposed) return false;
      if (saved) this.dirty = false;
      this.confirm = ''; if (data?.state || data?.error) this.render(data); this.status(message); return true;
    } catch (error) { if (!this.disposed) this.status(error.message, true); return false; }
    finally { this.busy = false; if (!this.disposed) this.controls(); }
  }
}
