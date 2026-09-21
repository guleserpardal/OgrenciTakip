// Odev takibi ekrani: haftanin sesi, ilerleme, gun secimi, gorev listesi ve
// cocugun kendi haftalik degerlendirmesi.

import { el, toast, debounce } from '../util.js';
import * as store from '../store.js';
import { renderTrackerHead, renderTaskList, openTaskForm, renderHiddenTasksBox } from './tracker.js';

export function render(host, ctx) {
  const child = ctx.child;
  host.innerHTML = '';
  if (!child) return;

  host.append(soundCard(ctx, child));

  host.append(renderTrackerHead(ctx, 'homework', child));

  host.append(el('div', { class: 'section-title' }, [
    el('span', { text: '📚 Günün ödevleri' }),
    el('button', {
      class: 'btn small ghost-btn', type: 'button', text: '＋ Görev',
      onclick: async () => {
        const task = await openTaskForm({ kind: 'homework', title: 'Yeni ödev görevi' });
        if (!task) return;
        store.addCustomTask(ctx.weekKey, child.id, 'homework', task);
        toast('Görev eklendi ⭐');
        ctx.refresh();
      },
    }),
  ]));

  host.append(renderTaskList(ctx, 'homework', child));

  const hiddenBox = renderHiddenTasksBox(ctx, 'homework', child);
  if (hiddenBox) host.append(hiddenBox);

  host.append(reflectionCard(ctx, child));
}

/* --------------------------------------------------------- haftanin sesi --- */

function soundCard(ctx, child) {
  const own = store.getOwnSound(ctx.weekKey, child.id);
  const effective = store.getSound(ctx.weekKey, child.id);
  const input = el('input', {
    type: 'text',
    maxlength: '24',
    'aria-label': 'Bu haftanın sesi veya öğrenme hedefi',
    placeholder: 'Örn. E e',
  });
  input.value = effective;

  const hint = el('div', { class: 'focus-hint' });
  const paintHint = () => {
    const cur = store.getOwnSound(ctx.weekKey, child.id);
    hint.textContent = cur
      ? `${child.name} • bu haftaya kaydedildi`
      : effective
        ? `${child.name} • önceki haftadan devraldı, kaydedince bu haftaya yazılır`
        : `${child.name} • bu hafta için henüz ses girilmedi`;
  };
  paintHint();

  const commit = (silent = false) => {
    const v = input.value.trim();
    if (v === store.getOwnSound(ctx.weekKey, child.id)) return;
    store.setSound(ctx.weekKey, child.id, v);
    paintHint();
    if (!silent) toast(v ? `Haftanın sesi kaydedildi: ${v}` : 'Haftanın sesi temizlendi.');
    ctx.refreshProgress();
  };

  const autoCommit = debounce(() => commit(true), 900);
  input.addEventListener('input', autoCommit);
  input.addEventListener('blur', () => { autoCommit.flush(); commit(true); });

  return el('section', { class: 'focus-card' }, [
    el('div', { class: 'grow' }, [
      el('span', { class: 'label', text: 'Bu haftanın sesi / hedefi' }),
      input,
      hint,
    ]),
    el('button', {
      class: 'btn small', type: 'button', text: 'Kaydet',
      onclick: () => { autoCommit.flush(); input.blur(); commit(false); },
    }),
  ]);
}

/* -------------------------------------------- cocugun haftalik degerlendirmesi --- */

function reflectionCard(ctx, child) {
  const cw = store.readChildWeek(ctx.weekKey, child.id);
  const r = cw.reflection || { fav: '', hard: '', stars: 0 };

  const fav = el('textarea', { rows: '2', placeholder: 'Örn. hikâye okumak' });
  fav.value = r.fav || '';
  const hard = el('textarea', { rows: '2', placeholder: 'Örn. satırda yazmak' });
  hard.value = r.hard || '';

  const starsWrap = el('div', { class: 'stars', role: 'group', 'aria-label': 'Haftanın yıldızları' });
  const paintStars = () => {
    const current = store.readChildWeek(ctx.weekKey, child.id).reflection.stars || 0;
    starsWrap.innerHTML = '';
    for (let n = 1; n <= 5; n++) {
      starsWrap.append(el('button', {
        class: 'star', type: 'button', text: '★',
        'aria-pressed': String(n <= current),
        'aria-label': `${n} yıldız`,
        onclick: () => {
          // Ayni yildiza tekrar dokunmak sifirlar.
          store.setReflection(ctx.weekKey, child.id, { stars: current === n ? 0 : n });
          paintStars();
        },
      }));
    }
  };
  paintStars();

  const saveText = (silent) => {
    store.setReflection(ctx.weekKey, child.id, { fav: fav.value.trim(), hard: hard.value.trim() });
    if (!silent) toast('Notlar kaydedildi 💗');
  };
  fav.addEventListener('blur', () => saveText(true));
  hard.addEventListener('blur', () => saveText(true));

  return el('section', { class: 'card' }, [
    el('h3', { text: `✨ ${child.name} için haftanın minik notları`, style: 'font-size:16px;margin-bottom:10px' }),
    el('label', { class: 'field' }, [el('span', { text: 'Bu hafta en sevdiğim etkinlik' }), fav]),
    el('label', { class: 'field' }, [el('span', { text: 'Bu hafta zorlandığım şey' }), hard]),
    el('div', { class: 'field' }, [el('span', { text: 'Kendi değerlendirmem (1–5 yıldız)' }), starsWrap]),
    el('button', { class: 'btn', type: 'button', text: 'Notları kaydet', onclick: () => saveText(false) }),
  ]);
}
