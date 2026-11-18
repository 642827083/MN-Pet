const $ = id => document.getElementById('focus-' + id);
export class FocusSubjects {
  constructor(select, changed) {
    this.select = select; this.changed = changed; this.names = []; this.current = ''; this.page = 0; this.open = false; this.blocked = true;
    $('subject').addEventListener('click', () => this.show());
    $('subject-back').addEventListener('click', () => this.close());
    $('subject-prev').addEventListener('click', () => { this.page--; this.render(); });
    $('subject-next').addEventListener('click', () => { this.page++; this.render(); });
    $('subject-picker').addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); this.close(); }
      if (event.key === 'Tab') {
        const buttons = [...$('subject-picker').querySelectorAll('button:not(:disabled)')], first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
      }
    });
    window.addEventListener('resize', () => { if (this.open) this.render(); });
  }
  pageSize() { return Math.max(1, Math.min(5, Math.floor((window.innerHeight - 100) / 38))); }
  update(names, current, blocked) {
    const changed = JSON.stringify(names) !== JSON.stringify(this.names) || this.current !== current;
    this.names = names; this.current = current; this.blocked = blocked;
    $('subject-name').textContent = current;
    if (this.open && changed) this.render();
    for (const button of $('subject-picker').querySelectorAll('button')) button.disabled = blocked || button.dataset.unavailable === 'true';
    $('subject-back').disabled = false;
  }
  show() {
    if (this.blocked || this.open) return;
    this.open = true; this.page = Math.floor(Math.max(0, this.names.indexOf(this.current)) / this.pageSize());
    $('subject-status').textContent = ''; $('subject-picker').hidden = false;
    $('subject').setAttribute('aria-expanded', 'true'); $('card').setAttribute('aria-hidden', 'true'); document.body.classList.add('focus-picker-open');
    this.render(); this.changed(); $('subject-list').querySelector('[aria-checked=true]')?.focus({ preventScroll: true });
  }
  close(restoreFocus = true) {
    if (!this.open) return;
    this.open = false; $('subject-picker').hidden = true; $('subject').setAttribute('aria-expanded', 'false');
    $('card').removeAttribute('aria-hidden'); document.body.classList.remove('focus-picker-open'); this.changed();
    if (restoreFocus) $('subject').focus({ preventScroll: true });
  }
  render() {
    const size = this.pageSize(), pages = Math.max(1, Math.ceil(this.names.length / size));
    this.page = Math.min(Math.max(0, this.page), pages - 1);
    $('subject-list').replaceChildren(...this.names.slice(this.page * size, (this.page + 1) * size).map(name => {
      const button = document.createElement('button'); button.type = 'button'; button.setAttribute('role', 'menuitemradio');
      button.setAttribute('aria-checked', String(name === this.current)); button.textContent = name; button.title = name; button.disabled = this.blocked;
      button.addEventListener('click', async () => {
        if (this.blocked) return;
        if (name === this.current) { this.close(); return; }
        if (await this.select(name)) this.close(); else $('subject-status').textContent = $('status').textContent;
      });
      return button;
    }));
    for (const [id, unavailable] of [['prev', this.page === 0], ['next', this.page === pages - 1]]) {
      const button = $('subject-' + id); button.dataset.unavailable = String(unavailable); button.disabled = unavailable || this.blocked;
    }
    $('subject-page').textContent = (this.page + 1) + ' / ' + pages;
  }
}
