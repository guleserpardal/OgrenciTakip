// Ozbakim takibi: sabah / gun icinde / aksam becerileri, buyuk dokunma alanlari.

import { el, toast } from '../util.js';
import * as store from '../store.js';
import { renderTrackerHead, renderTaskList, openTaskForm, renderHiddenTasksBox, noteCard } from './tracker.js';

export function render(host, ctx) {
  const child = ctx.child;
  host.innerHTML = '';
  if (!child) return;

  host.append(el('section', { class: 'card', style: 'background:linear-gradient(135deg,#eafff5,#fff4fb)' }, [
    el('h3', { text: '🫧 Özbakım takip formu', style: 'font-size:16px' }),
    el('p', {
      style: 'color:var(--ink-soft);font-size:13px;font-weight:700;margin-top:4px',
      text: 'Büyük kutulara dokunarak çocuklar kendileri işaretleyebilir. Yanlışlıkla dokunulursa tekrar dokunmak geri alır.',
    }),
  ]));

  host.append(renderTrackerHead(ctx, 'care', child));

  host.append(el('div', { class: 'section-title' }, [
    el('span', { text: '🪥 Günün becerileri' }),
    el('button', {
      class: 'btn small ghost-btn', type: 'button', text: '＋ Beceri',
      onclick: async () => {
        const task = await openTaskForm({ kind: 'care', title: 'Yeni özbakım becerisi' });
        if (!task) return;
        store.addCustomTask(ctx.weekKey, child.id, 'care', task);
        toast('Beceri eklendi 🫧');
        ctx.refresh();
      },
    }),
  ]));

  host.append(renderTaskList(ctx, 'care', child));

  const hiddenBox = renderHiddenTasksBox(ctx, 'care', child);
  if (hiddenBox) host.append(hiddenBox);

  const cw = store.readChildWeek(ctx.weekKey, child.id);
  host.append(noteCard({
    title: `💗 ${child.name} için özbakım notu`,
    hint: 'Bu hafta hangi beceri bağımsızlaştı, hangisinde hatırlatma gerekti?',
    value: cw.careNote,
    placeholder: 'Örn. dişlerini hatırlatmadan fırçaladı.',
    onSave: (v) => store.setChildNote(ctx.weekKey, child.id, 'careNote', v),
    saveLabel: 'Özbakım notunu kaydet',
  }));
}
