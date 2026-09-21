// Anne takibi: kayitli tum cocuklarin ozeti tek ekranda + haftalik tablo +
// haftalik anne notu. Yeni eklenen cocuklar otomatik olarak burada gorunur.

import { DAYS, FULL_DAYS, CARE_GROUPS } from '../constants.js';
import { el, toast } from '../util.js';
import * as store from '../store.js';
import { themeOf, avatarNode } from './children.js';
import { noteCard, openTaskForm } from './tracker.js';

export function render(host, ctx) {
  const children = store.activeChildren();
  host.innerHTML = '';

  host.append(el('section', { class: 'card' }, [
    el('span', { class: 'label', text: 'Anne görünümü' }),
    el('h2', {
      style: 'font-size:19px;margin-top:2px',
      text: children.length > 1
        ? `${children.length} çocuğu tek ekrandan takip et`
        : 'Haftalık takip özeti',
    }),
    el('p', {
      style: 'color:var(--ink-soft);font-size:13px;font-weight:700;margin-top:4px',
      text: 'Tablodaki kutucuklara dokunarak buradan da işaretleme yapabilirsiniz.',
    }),
  ]));

  if (!children.length) {
    host.append(el('p', { class: 'empty-note', text: 'Aktif çocuk profili yok. Profil menüsünden ekleyebilirsiniz.' }));
    return;
  }

  host.append(summaryGrid(ctx, children));
  host.append(tableCard(ctx, children, 'homework', '📚 Ödev haftalık görünümü'));
  host.append(tableCard(ctx, children, 'care', '🪥 Özbakım haftalık görünümü'));

  const week = store.readWeek(ctx.weekKey);
  host.append(noteCard({
    title: '📝 Haftalık anne notu',
    hint: 'Bu hafta iyi gidenler, zorlandıkları alanlar, gelecek haftaya not…',
    value: week.weekNote,
    rows: 4,
    placeholder: 'Tüm hafta için ortak not',
    onSave: (v) => store.setWeekNote(ctx.weekKey, v),
    saveLabel: 'Anne notunu kaydet',
  }));

  // Cocuk bazli veli notu (rapora her cocugun kendi bolumunde girer).
  host.append(el('div', { class: 'section-title', text: '🧡 Çocuğa özel veli notları' }));
  for (const child of children) {
    const cw = store.readChildWeek(ctx.weekKey, child.id);
    host.append(noteCard({
      title: `${child.avatar && !child.photo ? `${child.avatar} ` : ''}${child.name}`,
      hint: 'Yalnızca bu çocuğun rapor bölümünde görünür.',
      value: cw.parentNote,
      rows: 2,
      placeholder: 'Örn. bu hafta okumaya isteği arttı.',
      onSave: (v) => store.setChildNote(ctx.weekKey, child.id, 'parentNote', v),
      saveLabel: 'Notu kaydet',
    }));
  }
}

/* ------------------------------------------------------------- ozetler --- */

function summaryGrid(ctx, children) {
  const grid = el('div', { class: 'summary-grid', 'data-parent-summary': '1' });
  for (const child of children) {
    const t = themeOf(child);
    const h = store.summary(ctx.weekKey, child.id, 'homework');
    const c = store.summary(ctx.weekKey, child.id, 'care');
    const card = el('div', { class: 'summary-card' }, [
      el('div', { class: 'head' }, [avatarNode(child, 'av'), el('span', { text: child.name })]),
      el('div', { class: 'big', text: `${h.pct}%` }),
      el('div', { class: 'line', text: `Ödev • ${h.n}/${h.total}` }),
      el('div', { class: 'mini-bar' }, [el('span', { style: `width:${h.pct}%` })]),
      el('div', { class: 'line', style: 'margin-top:8px', text: `Özbakım • ${c.pct}% (${c.n}/${c.total})` }),
      el('div', { class: 'mini-bar' }, [el('span', { style: `width:${c.pct}%` })]),
    ]);
    card.style.setProperty('--c1', t.accent);
    card.style.setProperty('--c2', t.deep);
    grid.append(card);
  }
  return grid;
}

/* -------------------------------------------------------------- tablo --- */

/** Tum cocuklarin gorevlerinin birlesimi; her cocugun kendi listesi farkli olabilir. */
function unionTasks(ctx, children, kind) {
  const byId = new Map();
  for (const child of children) {
    const tasks = kind === 'care'
      ? store.careTasksFor(ctx.weekKey, child.id)
      : store.homeworkTasksFor(ctx.weekKey, child.id);
    for (const t of tasks) {
      if (!byId.has(t.id)) byId.set(t.id, { ...t, childIds: new Set([child.id]) });
      else byId.get(t.id).childIds.add(child.id);
    }
  }
  const all = [...byId.values()];
  if (kind !== 'care') return all;
  return CARE_GROUPS.flatMap((cat) => all.filter((t) => t.cat === cat))
    .concat(all.filter((t) => !CARE_GROUPS.includes(t.cat)));
}

function tableCard(ctx, children, kind, title) {
  const tasks = unionTasks(ctx, children, kind);

  const key = el('div', { class: 'child-key' });
  for (const child of children) {
    const span = el('span', { text: `${initials(child, children)} = ${child.name}` });
    span.style.setProperty('--k', themeOf(child).accent);
    key.append(span);
  }

  const table = el('table', { class: 'grid-table' });
  const thead = el('thead');
  const r1 = el('tr', {}, [el('th', { class: 'rowhead', text: kind === 'care' ? 'Beceri' : 'Etkinlik' })]);
  for (const d of DAYS) r1.append(el('th', { colspan: String(children.length), text: d }));
  const r2 = el('tr', {}, [el('th', { class: 'rowhead' })]);
  for (let i = 0; i < 7; i++) {
    for (const child of children) {
      const th = el('th', { text: initials(child, children), title: `${child.name} — ${FULL_DAYS[i]}` });
      th.style.color = themeOf(child).deep;
      r2.append(th);
    }
  }
  thead.append(r1, r2);
  table.append(thead);

  const tbody = el('tbody');
  for (const task of tasks) {
    const tr = el('tr');
    tr.append(el('td', { class: 'rowhead', text: `${task.icon || '⭐'} ${task.title}` }));
    for (let i = 0; i < 7; i++) {
      for (const child of children) {
        const td = el('td');
        if (!task.childIds.has(child.id)) {
          td.textContent = '–';
          td.style.color = '#d8d0e2';
        } else {
          td.append(miniCheck(ctx, child, kind, task.id, i));
        }
        tr.append(td);
      }
    }
    tbody.append(tr);
  }
  table.append(tbody);

  if (!tasks.length) {
    return el('section', { class: 'card' }, [
      el('h3', { text: title, style: 'font-size:16px;margin-bottom:8px' }),
      el('p', { class: 'empty-note', text: 'Bu hafta için görev yok.' }),
    ]);
  }

  return el('section', { class: 'card' }, [
    el('div', { class: 'section-title', style: 'margin:0 0 8px' }, [
      el('span', { text: title }),
      kind === 'homework' ? el('button', {
        class: 'btn small ghost-btn', type: 'button', text: '＋ Ödev görevi ekle',
        onclick: () => addTaskForEveryone(ctx, children, 'homework'),
      }) : null,
    ]),
    key,
    el('div', { class: 'table-wrap' }, [table]),
  ]);
}

function miniCheck(ctx, child, kind, taskId, dayIndex) {
  const done = store.isDone(ctx.weekKey, child.id, kind, taskId, dayIndex);
  const btn = el('button', {
    class: `mini-check${done ? ' done' : ''}`,
    type: 'button',
    'aria-pressed': String(done),
    'aria-label': `${child.name} — ${FULL_DAYS[dayIndex]}`,
    text: '✓',
  });
  btn.style.setProperty('--mc', themeOf(child).accent);
  btn.addEventListener('click', () => {
    const next = store.toggleDone(ctx.weekKey, child.id, kind, taskId, dayIndex);
    btn.classList.toggle('done', next);
    btn.setAttribute('aria-pressed', String(next));
    ctx.refreshParentSummary();
  });
  return btn;
}

/** Ayni gorevi secilen cocuklara ekler (anne ekranindan pratik ekleme). */
async function addTaskForEveryone(ctx, children, kind) {
  const task = await openTaskForm({ kind, title: 'Yeni ödev görevi' });
  if (!task) return;
  for (const child of children) store.addCustomTask(ctx.weekKey, child.id, kind, task);
  toast(children.length > 1 ? `Görev ${children.length} çocuğa eklendi ⭐` : 'Görev eklendi ⭐');
  ctx.refresh();
}

/** Tablo basligi icin kisa etiket; ayni harfle baslayan adlarda ayrisir. */
function initials(child, children) {
  const first = [...child.name.trim()][0]?.toLocaleUpperCase('tr') || '?';
  const clash = children.filter((c) => ([...c.name.trim()][0]?.toLocaleUpperCase('tr') || '?') === first);
  if (clash.length < 2) return first;
  const idx = clash.findIndex((c) => c.id === child.id);
  return `${first}${idx + 1}`;
}
