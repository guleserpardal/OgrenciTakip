// Ogretmen raporu: secili haftanin verisinden A4 rapor uretir,
// Android paylasim menusu ile PDF gonderir ve sistem yazdirma ekranini acar.

import { el, toast, escapeHtml, fmtDate, slugify, addDays, parseDateKey } from '../util.js';
import * as store from '../store.js';
import { printHtml, sharePdf, isNative } from '../native.js';
import { themeOf } from './children.js';

// Rapora dahil edilecek cocuklar. Bos Set = tum aktif cocuklar.
let selection = new Set();

export function render(host, ctx) {
  const children = store.activeChildren();
  host.innerHTML = '';

  if (!children.length) {
    host.append(el('p', { class: 'empty-note', text: 'Rapor için en az bir çocuk profili gerekir.' }));
    return;
  }

  // Silinen/arsivlenen cocuklari secimden dusur.
  const validIds = new Set(children.map((c) => c.id));
  selection = new Set([...selection].filter((id) => validIds.has(id)));

  const selected = selectedChildren(children);

  /* ------------------------------------------------------- kontroller --- */

  const controls = el('section', { class: 'card' }, [
    el('span', { class: 'label', text: 'Öğretmene gönderilecek çıktı' }),
    el('h2', { style: 'font-size:19px;margin-top:2px', text: 'Haftalık evde eğitim raporu' }),
    el('p', {
      style: 'color:var(--ink-soft);font-size:13px;font-weight:700;margin-top:4px',
      text: 'Rapor seçili haftanın işaretlemelerinden otomatik hazırlanır. Uygulama arayüzü çıktıya basılmaz.',
    }),
  ]);

  if (children.length > 1) {
    const chips = el('div', { class: 'chip-row' });
    chips.append(el('button', {
      class: 'choice-chip', type: 'button', text: 'Tüm çocuklar',
      'aria-pressed': String(selection.size === 0),
      onclick: () => { selection.clear(); ctx.refresh(); },
    }));
    for (const child of children) {
      chips.append(el('button', {
        class: 'choice-chip', type: 'button',
        text: `${child.photo ? '🖼' : child.avatar} ${child.name}`,
        'aria-pressed': String(selection.has(child.id)),
        onclick: () => {
          if (selection.has(child.id)) selection.delete(child.id);
          else selection.add(child.id);
          ctx.refresh();
        },
      }));
    }
    controls.append(el('div', { class: 'field', style: 'margin-top:12px' }, [
      el('span', { text: 'Rapora dahil edilecek çocuklar' }),
      chips,
    ]));
  }

  // Her secili cocuk icin ogretmene kisa not.
  for (const child of selected) {
    const cw = store.readChildWeek(ctx.weekKey, child.id);
    const area = el('textarea', { class: 'note', rows: '2', placeholder: 'Örn. E sesinde ilerledik, satır takibinde çalışacağız.' });
    area.value = cw.reportNote || '';
    const commit = () => store.setChildNote(ctx.weekKey, child.id, 'reportNote', area.value.trim());
    area.addEventListener('blur', commit);
    controls.append(el('label', { class: 'field', style: 'margin-top:10px' }, [
      el('span', { text: `${child.name} • öğretmene kısa not` }),
      area,
    ]));
  }

  const actions = el('div', { class: 'btn-row', style: 'margin-top:12px' }, [
    el('button', {
      class: 'btn', type: 'button', text: '📤 Öğretmene Gönder',
      onclick: (e) => onShare(e.currentTarget, ctx, selected),
    }),
    el('button', {
      class: 'btn secondary', type: 'button', text: '🖨️ Yazdır',
      onclick: (e) => onPrint(e.currentTarget, ctx, selected),
    }),
  ]);
  controls.append(actions);
  if (!isNative()) {
    controls.append(el('p', {
      class: 'info-box', style: 'margin-top:10px',
      text: 'Tarayıcıda çalışıyorsunuz: her iki düğme de yazdırma penceresini açar, oradan “PDF olarak kaydet” seçilebilir. '
        + 'Android uygulamasında PDF doğrudan oluşturulup paylaşım menüsüne verilir.',
    }));
  }
  host.append(controls);

  /* --------------------------------------------------------- on izleme --- */

  if (!selected.length) {
    host.append(el('p', { class: 'empty-note', text: 'En az bir çocuk seçin.' }));
    return;
  }

  const sheet = el('section', { class: 'report-sheet' });
  sheet.innerHTML = reportBodyHtml(ctx.weekKey, selected);
  host.append(sheet);
}

function selectedChildren(children) {
  if (!selection.size) return children;
  return children.filter((c) => selection.has(c.id));
}

/* ------------------------------------------------------------ eylemler --- */

function reportFileName(weekKey, selected, ext) {
  const base = selected.length === 1
    ? `${slugify(selected[0].name)}_Evde_Egitim_Raporu_${weekKey}`
    : `Evde_Egitim_Raporu_${weekKey}`;
  return `${base}.${ext}`;
}

async function onShare(button, ctx, selected) {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = '⏳ PDF hazırlanıyor…';
  try {
    const html = standaloneReportHtml(ctx.weekKey, selected);
    const fileName = reportFileName(ctx.weekKey, selected, 'pdf');
    const subject = `Haftalık Evde Eğitim Takip Raporu — ${fmtDate(parseDateKey(ctx.weekKey))}`;
    const res = await sharePdf(html, fileName, { subject, title: subject });
    toast(
      res.via === 'native'
        ? 'PDF hazır, paylaşım menüsü açılıyor 📤'
        : 'Yazdırma ekranından “PDF olarak kaydet” seçebilirsiniz.',
      res.via === 'native' ? 'ok' : 'warn',
    );
  } catch (e) {
    console.error(e);
    toast(`PDF oluşturulamadı: ${e?.message || e}`, 'error');
  } finally {
    button.disabled = false;
    button.textContent = original;
  }
}

async function onPrint(button, ctx, selected) {
  button.disabled = true;
  try {
    const html = standaloneReportHtml(ctx.weekKey, selected);
    await printHtml(html, `Evde Egitim Raporu ${ctx.weekKey}`);
  } catch (e) {
    console.error(e);
    toast(`Yazdırma açılamadı: ${e?.message || e}`, 'error');
  } finally {
    button.disabled = false;
  }
}

/* ------------------------------------------------------- rapor icerigi --- */

function soundSummary(weekKey, selected) {
  const sounds = selected.map((c) => store.getSound(weekKey, c.id)).filter(Boolean);
  if (!sounds.length) return '—';
  const uniq = [...new Set(sounds)];
  if (uniq.length === 1) return uniq[0];
  return selected
    .map((c) => `${c.name}: ${store.getSound(weekKey, c.id) || '—'}`)
    .join(' · ');
}

function taskRows(weekKey, childId, kind) {
  const tasks = kind === 'care'
    ? store.careTasksFor(weekKey, childId)
    : store.homeworkTasksFor(weekKey, childId);
  if (!tasks.length) return '<tr><td colspan="2">Bu hafta için görev tanımlı değil.</td></tr>';
  return tasks.map((t) => {
    const n = store.taskWeeklyCount(weekKey, childId, kind, t.id);
    // Sabah/aksam gibi ayni adli beceriler ogretmen icin ayirt edilebilsin.
    const suffix = kind === 'care' && t.cat ? ` <span class="r-when">(${escapeHtml(t.cat)})</span>` : '';
    return `<tr><td>${escapeHtml(t.icon || '⭐')} ${escapeHtml(t.title)}${suffix}</td><td class="num">${n} / 7</td></tr>`;
  }).join('');
}

function noteBlock(title, text) {
  return `<div class="r-note"><h4>${escapeHtml(title)}</h4><p>${escapeHtml(text || '—')}</p></div>`;
}

/** Rapor govdesi. Hem ekran on izlemesi hem PDF/yazdirma ayni HTML'i kullanir. */
export function reportBodyHtml(weekKey, selected) {
  const start = parseDateKey(weekKey);
  const end = addDays(start, 6);
  const week = store.readWeek(weekKey);

  let html = `
  <div class="r-brand">
    <h1>Haftalık Evde Eğitim Takip Raporu</h1>
    <p>${escapeHtml(selected.map((c) => c.name).join(' • '))}</p>
  </div>
  <div class="r-meta">
    <div class="r-meta-box"><b>Hafta</b><span>${escapeHtml(fmtDate(start))} – ${escapeHtml(fmtDate(end))}</span></div>
    <div class="r-meta-box"><b>Haftanın sesi / hedefi</b><span>${escapeHtml(soundSummary(weekKey, selected))}</span></div>
    <div class="r-meta-box"><b>Rapor tarihi</b><span>${escapeHtml(fmtDate(new Date()))}</span></div>
  </div>`;

  for (const child of selected) {
    const h = store.summary(weekKey, child.id, 'homework');
    const c = store.summary(weekKey, child.id, 'care');
    const cw = store.readChildWeek(weekKey, child.id);
    const r = cw.reflection || { fav: '', hard: '', stars: 0 };
    const stars = '★'.repeat(r.stars || 0) + '☆'.repeat(5 - (r.stars || 0));
    const accent = themeOf(child).accent;
    const sound = store.getSound(weekKey, child.id);

    html += `
    <article class="r-child" style="--ca:${accent}">
      <h2>${escapeHtml(child.photo ? '' : (child.avatar || ''))} ${escapeHtml(child.name)}${child.grade ? ` <small>${escapeHtml(child.grade)}</small>` : ''}</h2>
      ${sound ? `<p class="r-sub">Haftanın sesi / hedefi: <b>${escapeHtml(sound)}</b></p>` : ''}

      <h3>Genel özet</h3>
      <div class="r-stats">
        <div class="r-stat"><span>Ödev tamamlanma</span><strong>${h.pct}%</strong><small>${h.n}/${h.total} işaretleme</small></div>
        <div class="r-stat"><span>Özbakım takibi</span><strong>${c.pct}%</strong><small>${c.n}/${c.total} işaretleme</small></div>
      </div>

      <h3>Ders / etkinlik özeti</h3>
      <table class="r-table">
        <thead><tr><th>Alan</th><th class="num">Tamamlanan gün</th></tr></thead>
        <tbody>${taskRows(weekKey, child.id, 'homework')}</tbody>
      </table>

      <h3>Özbakım özeti</h3>
      <table class="r-table">
        <thead><tr><th>Beceri</th><th class="num">Tamamlanan gün</th></tr></thead>
        <tbody>${taskRows(weekKey, child.id, 'care')}</tbody>
      </table>

      <h3>Çocuğun haftalık değerlendirmesi</h3>
      <div class="r-note">
        <p><b>En sevdiği etkinlik:</b> ${escapeHtml(r.fav || '—')}</p>
        <p><b>Zorlandığı alan:</b> ${escapeHtml(r.hard || '—')}</p>
        <p><b>Kendi verdiği yıldız:</b> <span class="r-stars">${stars}</span></p>
      </div>

      <h3>Veli notları</h3>
      ${noteBlock('Özbakım notu', cw.careNote)}
      ${noteBlock('Anne haftalık notu', week.weekNote)}
      ${cw.parentNote ? noteBlock(`${child.name} için veli notu`, cw.parentNote) : ''}
      ${noteBlock('Öğretmene kısa not', cw.reportNote)}

      <div class="r-teacher">
        <strong>Öğretmen notu / geri bildirim</strong>
        <div class="r-lines"></div>
      </div>
    </article>`;
  }

  return html;
}

/** Yazdirma / PDF icin bagimsiz A4 belgesi. Navigasyon ve butonlar yoktur. */
export function standaloneReportHtml(weekKey, selected) {
  return `<!doctype html>
<html lang="tr">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Haftalık Evde Eğitim Takip Raporu</title>
<style>
  @page { size: A4; margin: 12mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body {
    font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Noto Sans", Arial, sans-serif;
    color: #1f2330;
    font-size: 11pt;
    line-height: 1.42;
    background: #fff;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  h1, h2, h3, h4 { margin: 0; line-height: 1.22; }
  p { margin: 0 0 3pt; }

  .r-brand { text-align: center; border-bottom: 2.5pt solid #f0d5e3; padding-bottom: 7pt; margin-bottom: 10pt; }
  .r-brand h1 { font-size: 16pt; }
  .r-brand p { margin-top: 4pt; color: #5d6274; font-weight: 600; font-size: 10pt; }

  .r-meta { display: flex; gap: 6pt; margin-bottom: 12pt; }
  .r-meta-box { flex: 1; border: 0.6pt solid #ded3e4; border-radius: 4pt; padding: 5pt 6pt; font-size: 9pt; }
  .r-meta-box b { display: block; color: #6b5f7d; font-size: 8pt; text-transform: uppercase; letter-spacing: .04em; }
  .r-meta-box span { font-weight: 700; }

  .r-child { break-inside: auto; padding-bottom: 6pt; }
  .r-child + .r-child { break-before: page; page-break-before: always; }
  .r-child > h2 {
    font-size: 13.5pt;
    padding: 6pt 8pt;
    border-radius: 4pt;
    background: #f7f2fa;
    border-left: 4pt solid var(--ca, #ff78ad);
    margin-bottom: 7pt;
  }
  .r-child > h2 small { font-weight: 600; font-size: 9.5pt; color: #6b6478; }
  .r-sub { font-size: 10pt; color: #4b5162; margin-bottom: 7pt; }
  .r-child h3 {
    font-size: 10.5pt;
    margin: 10pt 0 4pt;
    color: #4a4360;
    border-bottom: 0.6pt solid #eae2ef;
    padding-bottom: 2pt;
    break-after: avoid;
  }

  .r-stats { display: flex; gap: 7pt; }
  .r-stat { flex: 1; border: 0.6pt solid #ded3e4; border-radius: 4pt; padding: 6pt 7pt; }
  .r-stat span { font-size: 8.5pt; color: #6b5f7d; display: block; }
  .r-stat strong { font-size: 17pt; display: block; line-height: 1.1; }
  .r-stat small { font-size: 8.5pt; color: #6b6478; }

  .r-table { width: 100%; border-collapse: collapse; margin-top: 3pt; break-inside: avoid; }
  .r-table th, .r-table td { border: 0.6pt solid #e2dae8; padding: 3.5pt 5pt; font-size: 9.5pt; text-align: left; }
  .r-table th { background: #faf7fc; font-size: 8.5pt; text-transform: uppercase; letter-spacing: .03em; color: #5f5570; }
  .r-table .num { text-align: center; width: 30mm; white-space: nowrap; }
  .r-when { color: #6b6478; font-size: 8.5pt; }

  .r-note { border: 0.6pt solid #e2dae8; border-radius: 4pt; padding: 5pt 7pt; margin-top: 4pt; break-inside: avoid; }
  .r-note h4 { font-size: 9pt; color: #6b5f7d; margin-bottom: 2pt; }
  .r-note p { white-space: pre-wrap; font-size: 9.5pt; color: #33384a; }
  .r-stars { letter-spacing: 1pt; }

  .r-teacher { margin-top: 9pt; border: 1pt dashed #cfc2d8; border-radius: 4pt; padding: 6pt 7pt; break-inside: avoid; }
  .r-teacher strong { display: block; font-size: 9.5pt; margin-bottom: 4pt; color: #4a4360; }
  .r-lines { height: 26mm; background: repeating-linear-gradient(to bottom, transparent 0, transparent 7.5mm, #e6dfec 7.5mm, #e6dfec 7.6mm); }
</style>
</head>
<body>
${reportBodyHtml(weekKey, selected)}
</body>
</html>`;
}
