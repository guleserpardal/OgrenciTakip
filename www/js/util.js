// Kucuk yardimcilar: DOM, tarih, id uretimi, toast, modal/onay.

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = v;
    else if (k === 'html') node.innerHTML = v;
    else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
    else if (v !== null && v !== undefined && v !== false) node.setAttribute(k, v === true ? '' : v);
  }
  for (const c of [].concat(children)) {
    if (c === null || c === undefined) continue;
    node.append(typeof c === 'string' ? document.createTextNode(c) : c);
  }
  return node;
}

export function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>'"]/g, (m) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[m]
  ));
}

/** Verilen tarihin haftasinin pazartesisi (yerel saat, 00:00). */
export function mondayOf(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  x.setDate(x.getDate() - ((x.getDay() + 6) % 7));
  return x;
}

/** Yerel saate gore YYYY-MM-DD. toISOString saat dilimi kaydirdigi icin kullanilmaz. */
export function dateKey(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function parseDateKey(key) {
  const [y, m, d] = String(key).split('-').map(Number);
  const dt = new Date(y, (m || 1) - 1, d || 1);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

export function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

const DATE_FMT = new Intl.DateTimeFormat('tr-TR', { day: '2-digit', month: 'short', year: 'numeric' });
export const fmtDate = (d) => DATE_FMT.format(d);
export const fmtDateIso = (d) => dateKey(d);

/** Bugunun gun indeksi: 0 = Pazartesi. */
export function todayIndex() {
  return (new Date().getDay() + 6) % 7;
}

export function uid(prefix = 'child') {
  const rnd = (globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`);
  return `${prefix}-${rnd}`;
}

/** Turkce karakterleri dosya adinda guvenli hale getirir. */
export function slugify(v) {
  const map = { 'ç': 'c', 'Ç': 'C', 'ğ': 'g', 'Ğ': 'G', 'ı': 'i', 'İ': 'I', 'ö': 'o', 'Ö': 'O', 'ş': 's', 'Ş': 'S', 'ü': 'u', 'Ü': 'U' };
  return String(v ?? '')
    .replace(/[çÇğĞıİöÖşŞüÜ]/g, (m) => map[m])
    .replace(/[^A-Za-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Rapor';
}

export function pct(done, total) {
  return total > 0 ? Math.round((done / total) * 100) : 0;
}

/* ---------------------------------------------------------------- toast --- */

let toastTimer = null;
export function toast(message, kind = 'ok') {
  let host = $('#toastHost');
  if (!host) {
    host = el('div', { id: 'toastHost', class: 'toast-host' });
    document.body.append(host);
  }
  host.innerHTML = '';
  const node = el('div', { class: `toast toast-${kind}`, role: 'status', text: message });
  host.append(node);
  requestAnimationFrame(() => node.classList.add('show'));
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    node.classList.remove('show');
    setTimeout(() => node.remove(), 260);
  }, 2400);
}

/* ---------------------------------------------------------------- modal --- */

/**
 * Icerigi modal olarak acar. `render(close)` bir DOM dugumu dondurur.
 * close(value) cagrildiginda promise value ile cozulur.
 */
export function openModal(render, { titleText = '', dismissible = true } = {}) {
  return new Promise((resolve) => {
    const overlay = el('div', { class: 'modal-overlay' });
    let settled = false;
    const close = (value) => {
      if (settled) return;
      settled = true;
      overlay.classList.remove('show');
      setTimeout(() => overlay.remove(), 200);
      document.removeEventListener('keydown', onKey);
      resolve(value);
    };
    const onKey = (e) => { if (e.key === 'Escape' && dismissible) close(undefined); };

    const sheet = el('div', { class: 'modal-sheet', role: 'dialog', 'aria-modal': 'true' });
    if (titleText) sheet.append(el('h3', { class: 'modal-title', text: titleText }));
    sheet.append(render(close));
    overlay.append(sheet);
    overlay.addEventListener('click', (e) => { if (e.target === overlay && dismissible) close(undefined); });
    document.addEventListener('keydown', onKey);
    document.body.append(overlay);
    requestAnimationFrame(() => overlay.classList.add('show'));
    const focusable = sheet.querySelector('input, textarea, button');
    if (focusable && !('ontouchstart' in window)) focusable.focus();
  });
}

/** Onay diyalogu. true/false doner. */
export function confirmDialog({ title, message, confirmText = 'Evet', cancelText = 'Vazgeç', danger = false, extra = null }) {
  return openModal((close) => {
    const body = el('div', { class: 'modal-body' }, [
      el('p', { class: 'modal-message', text: message }),
    ]);
    if (extra) body.append(extra);
    body.append(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn ghost-btn', type: 'button', text: cancelText, onclick: () => close(false) }),
      el('button', { class: `btn ${danger ? 'danger' : ''}`, type: 'button', text: confirmText, onclick: () => close(true) }),
    ]));
    return body;
  }, { titleText: title }).then((v) => v === true);
}

/** Tek satirlik metin sorar. Iptalde null doner. */
export function promptDialog({ title, label, value = '', placeholder = '', multiline = false, required = true, confirmText = 'Kaydet' }) {
  return openModal((close) => {
    const field = multiline
      ? el('textarea', { rows: 3, placeholder })
      : el('input', { type: 'text', placeholder, maxlength: 80 });
    field.value = value;
    const err = el('div', { class: 'field-error' });
    const submit = () => {
      const v = field.value.trim();
      if (required && !v) { err.textContent = 'Bu alan boş olamaz.'; field.focus(); return; }
      close(v);
    };
    const form = el('form', { class: 'modal-body', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('label', { class: 'field' }, [el('span', { text: label }), field]),
      err,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Vazgeç', onclick: () => close(null) }),
        el('button', { class: 'btn', type: 'submit', text: confirmText }),
      ]),
    ]);
    return form;
  }, { titleText: title }).then((v) => (v === undefined ? null : v));
}

/* ------------------------------------------------------------ konfeti --- */

/** Gorev tamamlaninca kucuk yildiz patlamasi. Performansi dusurmemesi icin kisa ve DOM-hafif. */
export function celebrate(anchor) {
  if (!anchor || !anchor.getBoundingClientRect) return;
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches) return;
  const r = anchor.getBoundingClientRect();
  const host = el('div', { class: 'confetti-host' });
  host.style.left = `${r.left + r.width / 2}px`;
  host.style.top = `${r.top + r.height / 2}px`;
  const glyphs = ['⭐', '✨', '🌟', '💫'];
  for (let i = 0; i < 6; i++) {
    const p = el('span', { class: 'confetti', text: glyphs[i % glyphs.length] });
    const angle = (Math.PI * 2 * i) / 6 + Math.random() * 0.6;
    const dist = 34 + Math.random() * 26;
    p.style.setProperty('--dx', `${Math.cos(angle) * dist}px`);
    p.style.setProperty('--dy', `${Math.sin(angle) * dist - 12}px`);
    p.style.animationDelay = `${i * 18}ms`;
    host.append(p);
  }
  document.body.append(host);
  setTimeout(() => host.remove(), 900);
}

/** Basit debounce. */
export function debounce(fn, wait = 250) {
  let t = null;
  const wrapped = (...args) => {
    clearTimeout(t);
    t = setTimeout(() => { t = null; fn(...args); }, wait);
  };
  wrapped.flush = (...args) => { if (t) { clearTimeout(t); t = null; fn(...args); } };
  wrapped.pending = () => t !== null;
  return wrapped;
}
