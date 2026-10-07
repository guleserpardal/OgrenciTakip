// Odev ve ozbakim ekranlarinin paylastigi parcalar:
// gun seridi, ilerleme karti ve dokunmatik gorev listesi.

import { DAYS, FULL_DAYS, CARE_GROUPS, CARE_GROUP_ICON } from '../constants.js';
import { el, toast, celebrate, todayIndex, openModal, confirmDialog, addDays, parseDateKey } from '../util.js';
import * as store from '../store.js';

/** Ilerleme karti + gun seridi: isaretleme sonrasi tek parca halinde yenilenir. */
export function renderTrackerHead(ctx, kind, child) {
  const head = el('div', { class: 'tracker-head', 'data-head': kind });
  head.append(renderProgressCard(ctx, kind, child));
  head.append(renderDayStrip(ctx, kind, child));
  return head;
}

export function renderProgressCard(ctx, kind, child) {
  const s = store.summary(ctx.weekKey, child.id, kind);
  const day = store.daySummary(ctx.weekKey, child.id, kind, ctx.dayIndex);
  const subtitle = kind === 'care'
    ? `${FULL_DAYS[ctx.dayIndex]} • bugün ${day.n}/${day.total} beceri`
    : `${FULL_DAYS[ctx.dayIndex]} • bugün ${day.n}/${day.total} görev`;

  return el('div', { class: 'progress-card' }, [
    el('div', { class: 'progress-top' }, [
      el('div', {}, [
        el('div', { class: 'who', text: `${child.name}` }),
        el('div', { class: 'meta', text: subtitle }),
      ]),
      el('div', { class: 'big', text: `${s.pct}%` }),
    ]),
    el('div', { class: 'bar' }, [el('span', { style: `width:${s.pct}%` })]),
    el('div', { class: 'meta', style: 'margin-top:6px', text: `Haftalık: ${s.n}/${s.total} işaretleme` }),
  ]);
}

export function renderDayStrip(ctx, kind, child) {
  const strip = el('div', { class: 'day-strip', role: 'group', 'aria-label': 'Gün seçimi' });
  const today = todayIndex();
  const isThisWeek = ctx.weekKey === store.weekKeyFor(new Date());
  for (let i = 0; i < 7; i++) {
    const d = store.daySummary(ctx.weekKey, child.id, kind, i);
    const cls = d.total === 0 ? '' : d.n === 0 ? '' : d.n >= d.total ? 'full' : 'partial';
    const btn = el('button', {
      class: `day${isThisWeek && i === today ? ' today' : ''}`,
      type: 'button',
      'aria-pressed': String(i === ctx.dayIndex),
      'aria-label': `${FULL_DAYS[i]} — ${d.n}/${d.total}`,
      onclick: () => ctx.setDay(i),
    }, [
      el('span', { text: DAYS[i] }),
      el('span', { class: `dot ${cls}` }),
    ]);
    strip.append(btn);
  }
  return strip;
}

/**
 * Gorev listesi. kind: 'homework' | 'care'
 * Ozbakimda gorevler grup basliklariyla bolunur.
 */
export function renderTaskList(ctx, kind, child) {
  const host = el('div', {});
  const tasks = kind === 'care'
    ? store.careTasksFor(ctx.weekKey, child.id)
    : store.homeworkTasksFor(ctx.weekKey, child.id);

  if (!tasks.length) {
    host.append(el('p', { class: 'empty-note', text: 'Bu hafta için görev kalmadı. Aşağıdan yeni görev ekleyebilirsiniz.' }));
    return host;
  }

  let list = el('div', { class: 'task-list' });
  let lastCat = null;

  for (const task of tasks) {
    if (kind === 'care' && task.cat !== lastCat) {
      if (list.childElementCount) host.append(list);
      list = el('div', { class: 'task-list' });
      const icon = CARE_GROUP_ICON[task.cat] || '🌼';
      host.append(el('div', { class: 'care-group', text: `${icon} ${task.cat}` }));
      lastCat = task.cat;
    }
    list.append(taskCard(ctx, kind, child, task));
  }
  host.append(list);
  return host;
}

function taskCard(ctx, kind, child, task) {
  const isDefault = kind === 'care' ? store.isDefaultCareTask(task.id) : store.isDefaultHomeworkTask(task.id);
  const done = store.isDone(ctx.weekKey, child.id, kind, task.id, ctx.dayIndex);

  const check = el('button', {
    class: 'check-btn',
    type: 'button',
    'aria-pressed': String(done),
    'aria-label': `${task.title} — ${done ? 'tamamlandı, geri almak için dokun' : 'tamamlandı olarak işaretle'}`,
    text: done ? '★' : '✓',
  });

  const card = el('article', { class: `task-card${done ? ' done' : ''}${isDefault ? '' : ' custom'}` }, [
    el('span', { class: 'task-icon', text: task.icon || '⭐' }),
    el('div', { class: 'task-copy' }, [
      el('h3', { text: task.title }),
      el('p', { text: task.desc || '' }),
    ]),
    check,
  ]);

  check.addEventListener('click', () => {
    const next = store.toggleDone(ctx.weekKey, child.id, kind, task.id, ctx.dayIndex);
    // Yerel guncelleme: tum ekrani yeniden cizmeden hizli geri bildirim.
    card.classList.toggle('done', next);
    check.textContent = next ? '★' : '✓';
    check.setAttribute('aria-pressed', String(next));
    if (next) celebrate(check);
    ctx.refreshProgress();
  });

  card.append(el('button', {
    class: 'task-edit',
    type: 'button',
    'aria-label': `${task.title} görevini düzenle`,
    title: 'Düzenle / kaldır',
    text: '⋯',
    onclick: () => openTaskMenu(ctx, kind, child, task, isDefault),
  }));

  return card;
}

async function openTaskMenu(ctx, kind, child, task, isDefault) {
  const kindLabel = kind === 'care' ? 'beceri' : 'görev';
  const choice = await openModal((close) => el('div', { class: 'modal-body' }, [
    el('p', { class: 'modal-message', text: `${task.icon || '⭐'} ${task.title}` }),
    el('div', { class: 'modal-list' }, [
      isDefault ? null : el('button', {
        class: 'btn ghost-btn block', type: 'button', text: '✏️ Düzenle',
        onclick: () => close('edit'),
      }),
      el('button', {
        class: 'btn ghost-btn block', type: 'button',
        text: isDefault ? `🙈 Bu ${kindLabel}i bu haftada gizle` : `🗑️ Bu ${kindLabel}i sil`,
        onclick: () => close('remove'),
      }),
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn ghost-btn', type: 'button', text: 'Kapat', onclick: () => close(undefined) }),
    ]),
  ]), { titleText: 'Görev işlemleri' });

  if (choice === 'edit') {
    const updated = await openTaskForm({
      kind,
      title: `${kindLabel === 'beceri' ? 'Beceriyi' : 'Görevi'} düzenle`,
      value: task,
    });
    if (updated) {
      store.updateCustomTask(ctx.weekKey, child.id, kind, task.id, updated);
      toast('Görev güncellendi.');
      ctx.refresh();
    }
    return;
  }

  if (choice === 'remove') {
    const ok = await confirmDialog({
      title: isDefault ? 'Bu haftada gizlensin mi?' : 'Silinsin mi?',
      message: isDefault
        ? `"${task.title}" yalnızca ${child.name} için bu haftada listeden kaldırılır. Diğer haftalar ve diğer çocuklar etkilenmez.`
        : `"${task.title}" ve bu haftaya ait işaretlemeleri silinir.`,
      confirmText: isDefault ? 'Gizle' : 'Sil',
      danger: !isDefault,
    });
    if (!ok) return;
    store.removeTask(ctx.weekKey, child.id, kind, task.id);
    toast(isDefault ? 'Listeden kaldırıldı.' : 'Görev silindi.', 'warn');
    ctx.refresh();
  }
}

/** Yeni / duzenlenen gorev formu. Iptalde null doner. */
export function openTaskForm({ kind, title, value = null }) {
  const EMOJI = kind === 'care'
    ? ['🧼', '🧴', '🛁', '🧹', '🪞', '🧦', '🥛', '🍎', '🎒', '⭐']
    : ['🧩', '🔤', '🔢', '📖', '✏️', '🎨', '🎵', '🧪', '🌍', '⭐'];

  return openModal((close) => {
    const titleInput = el('input', { type: 'text', placeholder: kind === 'care' ? 'Örn. Yüzümü kremledim' : 'Örn. Ritim çalışması', maxlength: '80' });
    titleInput.value = value?.title || '';
    const descInput = el('input', { type: 'text', placeholder: 'Kısa açıklama', maxlength: '160' });
    descInput.value = value?.desc || '';
    const err = el('div', { class: 'field-error' });
    const draft = { icon: value?.icon || EMOJI[0], cat: value?.cat || CARE_GROUPS[0] };

    const iconWrap = el('div', { class: 'avatars' });
    const paintIcons = () => {
      iconWrap.innerHTML = '';
      for (const e of EMOJI) {
        iconWrap.append(el('button', {
          class: 'avatar-opt', type: 'button', text: e,
          'aria-pressed': String(draft.icon === e),
          'aria-label': `Simge ${e}`,
          onclick: () => { draft.icon = e; paintIcons(); },
        }));
      }
    };
    paintIcons();

    let catField = null;
    if (kind === 'care') {
      const select = el('select', {});
      for (const c of CARE_GROUPS) {
        const opt = el('option', { value: c, text: c });
        if (draft.cat === c) opt.selected = true;
        select.append(opt);
      }
      select.addEventListener('change', () => { draft.cat = select.value; });
      catField = el('label', { class: 'field' }, [el('span', { text: 'Zaman dilimi' }), select]);
    }

    const submit = () => {
      const t = titleInput.value.trim();
      if (!t) { err.textContent = 'Görev adı gerekli.'; titleInput.focus(); return; }
      close({ title: t, desc: descInput.value.trim(), icon: draft.icon, cat: draft.cat });
    };

    return el('form', { class: 'modal-body', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('label', { class: 'field' }, [el('span', { text: 'Görev adı *' }), titleInput]),
      el('label', { class: 'field' }, [el('span', { text: 'Açıklama' }), descInput]),
      catField,
      el('div', { class: 'field' }, [el('span', { text: 'Simge' }), iconWrap]),
      err,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Vazgeç', onclick: () => close(null) }),
        el('button', { class: 'btn', type: 'submit', text: 'Kaydet' }),
      ]),
    ]);
  }, { titleText: title }).then((v) => v || null);
}

/** Bu cocuk-hafta icin gizlenmis varsayilan gorevleri geri getirme kutusu. */
export function renderHiddenTasksBox(ctx, kind, child) {
  const hidden = store.hiddenTasksFor(ctx.weekKey, child.id, kind);
  if (!hidden.length) return null;
  const row = el('div', { class: 'btn-row', style: 'margin-top:8px' });
  for (const t of hidden) {
    row.append(el('button', {
      class: 'btn small ghost-btn', type: 'button', text: `↩︎ ${t.icon} ${t.title}`,
      onclick: () => {
        store.restoreHiddenTask(ctx.weekKey, child.id, kind, t.id);
        toast('Listeye geri eklendi.');
        ctx.refresh();
      },
    }));
  }
  return el('div', { class: 'card' }, [
    el('div', { class: 'label', text: 'Bu hafta gizlenenler' }),
    row,
  ]);
}

/** Notu kaydeden, otomatik kayit destekli metin alani. */
export function noteCard({ title, hint, value, placeholder, rows = 3, onSave, saveLabel = 'Kaydet' }) {
  const area = el('textarea', { class: 'note', rows: String(rows), placeholder: placeholder || '' });
  area.value = value || '';
  const card = el('section', { class: 'card' }, [
    el('h3', { text: title, style: 'font-size:16px;margin-bottom:6px' }),
    hint ? el('p', { style: 'color:var(--ink-soft);font-size:12.5px;font-weight:700;margin-bottom:8px', text: hint }) : null,
    area,
    el('div', { class: 'btn-row', style: 'margin-top:10px' }, [
      el('button', {
        class: 'btn small', type: 'button', text: saveLabel,
        onclick: () => { onSave(area.value.trim()); toast('Kaydedildi 💗'); },
      }),
    ]),
  ]);
  // Odak kaybinda sessiz kayit: kullanici butona basmayi unutursa veri kaybolmasin.
  area.addEventListener('blur', () => {
    const v = area.value.trim();
    if (v !== (value || '')) onSave(v);
  });
  return card;
}

/** Hafta araligini insan diliyle yazar. */
export function weekRangeText(weekKey) {
  const start = parseDateKey(weekKey);
  return { start, end: addDays(start, 6) };
}
