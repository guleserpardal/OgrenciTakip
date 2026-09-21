// Uygulama girisi: baslatma, hafta/gun durumu, gorunum yonlendirme.

import { $, el, toast, mondayOf, addDays, parseDateKey, dateKey, fmtDate, todayIndex } from './util.js';
import * as store from './store.js';
import { applyTheme, avatarNode, renderChildStrip, openProfileMenu, renderOnboarding } from './views/children.js';
import { openSettings } from './views/settings.js';
import * as homeworkView from './views/homework.js';
import * as careView from './views/care.js';
import * as parentView from './views/parent.js';
import * as reportView from './views/report.js';
import { renderTrackerHead } from './views/tracker.js';
import { setupSafeArea } from './native.js';
import { nativePlugin } from './plugins.js';

const VIEWS = {
  homework: { render: homeworkView.render, host: '#view-homework', title: (c) => `${genitive(c.name)} Bu Haftası`, strip: true },
  care: { render: careView.render, host: '#view-care', title: (c) => `${genitive(c.name)} Özbakımı`, strip: true },
  parent: { render: parentView.render, host: '#view-parent', title: () => 'Anne Takibi', strip: false },
  report: { render: reportView.render, host: '#view-report', title: () => 'Öğretmen Raporu', strip: false },
};

/** Turkce iyelik eki: Elis'in, Lila'nın, Ömer'in, Buğra'nın. */
export function genitive(name) {
  const raw = String(name || '').trim();
  if (!raw) return '';
  const lower = raw.toLocaleLowerCase('tr');
  const vowels = 'aeıioöuü';
  let last = '';
  for (const ch of lower) if (vowels.includes(ch)) last = ch;
  const suffixByVowel = { a: 'ın', 'ı': 'ın', e: 'in', i: 'in', o: 'un', u: 'un', 'ö': 'ün', 'ü': 'ün' };
  const suffix = suffixByVowel[last] || 'in';
  const endsWithVowel = vowels.includes(lower[lower.length - 1]);
  return `${raw}'${endsWithVowel ? `n${suffix}` : suffix}`;
}

/* ------------------------------------------------------------- durum --- */

const app = {
  weekKey: store.weekKeyFor(new Date()),
  dayIndex: todayIndex(),
  view: 'homework',
};

const ctx = {
  get weekKey() { return app.weekKey; },
  get dayIndex() { return app.dayIndex; },
  get view() { return app.view; },
  get child() { return store.getActiveChild(); },
  get childId() { return store.getActiveChild()?.id || null; },
  setDay(i) {
    app.dayIndex = Math.max(0, Math.min(6, i));
    renderActiveView();
  },
  setWeekKey(key) {
    app.weekKey = key;
    // Bu haftaya donuldugunde bugunun gunu secili gelsin.
    if (key === store.weekKeyFor(new Date())) app.dayIndex = todayIndex();
    refresh();
  },
  shiftWeek(weeks) {
    ctx.setWeekKey(dateKey(addDays(parseDateKey(app.weekKey), weeks * 7)));
  },
  setView(name) {
    if (!VIEWS[name]) return;
    app.view = name;
    refresh();
  },
  refresh,
  refreshProgress() {
    const host = $(VIEWS[app.view]?.host || '#view-homework');
    const head = host?.querySelector('[data-head]');
    const child = ctx.child;
    if (!head || !child) return;
    const kind = head.getAttribute('data-head');
    head.replaceWith(renderTrackerHead(ctx, kind, child));
  },
  refreshParentSummary() {
    const grid = $('#view-parent [data-parent-summary]');
    if (!grid) return;
    // parent.js'in ozet bolumunu yeniden uret.
    const fresh = document.createElement('div');
    parentView.render(fresh, ctx);
    const next = fresh.querySelector('[data-parent-summary]');
    if (next) grid.replaceWith(next);
  },
};

/* ------------------------------------------------------------- cizim --- */

function renderWeekBar() {
  const start = parseDateKey(app.weekKey);
  const end = addDays(start, 6);
  $('#weekDates').textContent = `${fmtDate(start)} – ${fmtDate(end)}`;
  const thisMonday = mondayOf(new Date());
  const diff = Math.round((start - thisMonday) / 86400000 / 7);
  $('#weekLabel').textContent = diff === 0 ? 'Bu hafta'
    : diff === 1 ? 'Gelecek hafta'
      : diff === -1 ? 'Geçen hafta'
        : `${Math.abs(diff)} hafta ${diff > 0 ? 'sonra' : 'önce'}`;
  $('#todayWeek').hidden = diff === 0;
}

function renderChrome() {
  const child = ctx.child;
  applyTheme(child);

  const chipAvatar = $('#chipAvatar');
  chipAvatar.innerHTML = '';
  if (child) {
    const node = avatarNode(child, 'inner');
    if (child.photo) chipAvatar.append(node.firstChild);
    else chipAvatar.textContent = child.avatar || '🙂';
  } else {
    chipAvatar.textContent = '🙂';
  }

  $('#chipName').textContent = child?.name || '—';
  const others = store.activeChildren().length - 1;
  $('#chipSub').textContent = child?.grade
    || (others > 0 ? `${others} profil daha` : 'profil ayarları');

  const def = VIEWS[app.view];
  $('#pageTitle').textContent = child ? def.title(child) : def.title({ name: '' });

  const strip = $('#childStrip');
  if (def.strip) renderChildStrip(strip, ctx);
  else { strip.innerHTML = ''; strip.hidden = true; }

  for (const btn of document.querySelectorAll('.nav-btn')) {
    const active = btn.dataset.view === app.view;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', String(active));
  }
}

function renderActiveView() {
  const def = VIEWS[app.view];
  for (const [name, v] of Object.entries(VIEWS)) {
    $(v.host).hidden = name !== app.view;
  }
  def.render($(def.host), ctx);
}

function refresh() {
  const children = store.activeChildren();
  if (!children.length) {
    $('#app').hidden = true;
    renderOnboarding($('#onboarding'), ctx);
    return;
  }
  $('#onboarding').hidden = true;
  $('#onboarding').innerHTML = '';
  $('#app').hidden = false;
  renderWeekBar();
  renderChrome();
  renderActiveView();
}

/* -------------------------------------------------------------- olaylar --- */

function wireChrome() {
  $('#prevWeek').addEventListener('click', () => ctx.shiftWeek(-1));
  $('#nextWeek').addEventListener('click', () => ctx.shiftWeek(1));
  $('#todayWeek').addEventListener('click', () => ctx.setWeekKey(store.weekKeyFor(new Date())));
  $('#profileChip').addEventListener('click', () => openProfileMenu(ctx));
  $('#openSettings').addEventListener('click', () => openSettings(ctx));
  for (const btn of document.querySelectorAll('.nav-btn')) {
    btn.addEventListener('click', () => ctx.setView(btn.dataset.view));
  }

  // Yatay kaydirma ile hafta degistirme (ana icerik alaninda).
  let touchX = null;
  let touchY = null;
  const main = $('#views');
  main.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) { touchX = null; return; }
    touchX = e.touches[0].clientX;
    touchY = e.touches[0].clientY;
  }, { passive: true });
  main.addEventListener('touchend', (e) => {
    if (touchX === null) return;
    const dx = e.changedTouches[0].clientX - touchX;
    const dy = e.changedTouches[0].clientY - touchY;
    touchX = null;
    // Tablo gibi yatay kaydirilabilir alanlarda devreye girmesin.
    if (e.target.closest('.table-wrap, .child-strip, textarea, input')) return;
    if (Math.abs(dx) > 90 && Math.abs(dx) > Math.abs(dy) * 2) ctx.shiftWeek(dx < 0 ? 1 : -1);
  }, { passive: true });
}

function wireLifecycle() {
  const flush = () => { store.saveNow().catch(() => {}); };
  document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });
  window.addEventListener('pagehide', flush);
  window.addEventListener('beforeunload', flush);

  const appPlugin = nativePlugin('App');
  if (appPlugin) {
    appPlugin.addListener('appStateChange', ({ isActive }) => {
      if (!isActive) flush();
      else {
        // Uygulama gun degisimi sonrasi one gelirse bugune hizala.
        const nowWeek = store.weekKeyFor(new Date());
        if (app.weekKey === nowWeek && app.dayIndex !== todayIndex()) {
          app.dayIndex = todayIndex();
          renderActiveView();
        }
      }
    });
    // Geri tusu: acik modal varsa once onu kapat.
    appPlugin.addListener('backButton', ({ canGoBack }) => {
      const overlay = document.querySelector('.modal-overlay');
      if (overlay) {
        document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
        return;
      }
      if (app.view !== 'homework') { ctx.setView('homework'); return; }
      if (canGoBack) history.back();
      else appPlugin.exitApp?.();
    });
  }
}

/* ----------------------------------------------------------------- init --- */

async function boot() {
  try {
    const { migration } = await store.initStore();
    wireChrome();
    wireLifecycle();
    setupSafeArea().catch(() => {});
    refresh();

    if (migration?.migrated) {
      const names = migration.children.join(', ');
      setTimeout(() => toast(
        `Eski kayıtlar taşındı: ${migration.weeks} hafta, ${migration.children.length} profil (${names}) ✅`,
      ), 500);
    }
  } catch (e) {
    console.error('Baslatma hatasi', e);
    const box = $('#bootError');
    box.hidden = false;
    box.textContent = `Uygulama başlatılamadı: ${e?.message || e}`;
  }
}

// Konsoldan dogrulama ve testler icin.
globalThis.EvdeEgitim = { store, ctx, app, genitive };

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();
