import { MNBridge } from './lib/mnBridge.js';
export class AboutSettings {
  constructor() {
    this.links = Array.from(document.querySelectorAll('[data-about-open]'));
    for (const button of this.links) button.addEventListener('click', () => this.open(button));
  }
  status(text, error = false) {
    const target = document.getElementById('about-status');
    if (!target) return;
    target.textContent = text; target.dataset.error = String(error);
  }
  async open(button) {
    this.status('');
    try { await MNBridge.send('openAboutLink', { target: button.dataset.aboutOpen }); }
    catch (error) { this.status(String(error?.message || error), true); }
  }
}
