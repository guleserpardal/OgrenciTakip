// Ayarlar: yedegi disa aktar / geri yukle, profil yonetimi, veri ozeti.

import { el, toast, openModal, confirmDialog, fmtDate, dateKey } from '../util.js';
import * as store from '../store.js';
import { shareTextFile } from '../native.js';
import { openChildForm, openProfileMenu, avatarNode } from './children.js';

/* ------------------------------------------------------- disa aktarma --- */

export async function exportBackupFile() {
  try {
    const payload = store.exportBackup();
    const json = JSON.stringify(payload, null, 2);
    const fileName = `EvdeEgitimTakip_Yedek_${dateKey(new Date())}.json`;
    const res = await shareTextFile(fileName, json, 'application/json', 'Evde Eğitim Takip yedeği');
    toast(res.via === 'native' ? 'Yedek hazır, paylaşım menüsü açılıyor 💾' : `Yedek indirildi: ${fileName}`);
    return true;
  } catch (e) {
    console.error(e);
    toast(`Yedek oluşturulamadı: ${e?.message || e}`, 'error');
    return false;
  }
}

/* ------------------------------------------------------- geri yukleme --- */

function parseBackup(text) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch {
    throw new Error('Dosya geçerli bir JSON değil.');
  }
  const data = payload?.data ?? payload;
  if (!data || typeof data !== 'object' || (!data.children && !data.weeks)) {
    throw new Error('Bu dosya Evde Eğitim Takip yedeği gibi görünmüyor.');
  }
  const childCount = Object.keys(data.children || {}).length;
  const weekCount = Object.keys(data.weeks || {}).length;
  return { payload, childCount, weekCount, exportedAt: payload?.exportedAt || null };
}

export async function openRestoreDialog(ctx) {
  const picked = await openModal((close) => {
    const fileInput = el('input', { type: 'file', accept: 'application/json,.json', style: 'display:none' });
    const pasteArea = el('textarea', { class: 'note', rows: '4', placeholder: 'Yedek dosyasının içeriğini buraya yapıştırabilirsiniz…' });
    const err = el('div', { class: 'field-error' });
    const status = el('p', { style: 'font-weight:700;font-size:13px;margin-top:6px' });
    let loaded = null;

    const accept = (text, sourceLabel) => {
      try {
        loaded = parseBackup(text);
        err.textContent = '';
        status.textContent = `${sourceLabel}: ${loaded.childCount} çocuk, ${loaded.weekCount} hafta`
          + (loaded.exportedAt ? ` • ${fmtDate(new Date(loaded.exportedAt))}` : '');
      } catch (e) {
        loaded = null;
        status.textContent = '';
        err.textContent = e.message;
      }
    };

    fileInput.addEventListener('change', () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onerror = () => { err.textContent = 'Dosya okunamadı.'; };
      reader.onload = () => accept(String(reader.result), file.name);
      reader.readAsText(file);
    });
    pasteArea.addEventListener('input', () => {
      const v = pasteArea.value.trim();
      if (v.length > 20) accept(v, 'Yapıştırılan yedek');
      else { loaded = null; status.textContent = ''; err.textContent = ''; }
    });

    const go = (mode) => {
      if (!loaded) { err.textContent = 'Önce bir yedek seçin veya yapıştırın.'; return; }
      close({ ...loaded, mode });
    };

    return el('div', { class: 'modal-body' }, [
      el('p', { class: 'modal-message', text: 'Daha önce dışa aktardığınız JSON yedeğini seçin.' }),
      fileInput,
      el('button', { class: 'btn block secondary', type: 'button', text: '📂 Yedek dosyası seç', onclick: () => fileInput.click() }),
      el('div', { class: 'modal-divider' }),
      el('label', { class: 'field' }, [el('span', { text: 'veya içeriği yapıştır' }), pasteArea]),
      status,
      err,
      el('div', { class: 'modal-divider' }),
      el('div', { class: 'modal-list' }, [
        el('button', { class: 'btn block', type: 'button', text: '♻️ Mevcut verinin yerine yükle', onclick: () => go('replace') }),
        el('button', { class: 'btn block ghost-btn', type: 'button', text: '➕ Mevcut veriyle birleştir', onclick: () => go('merge') }),
      ]),
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Vazgeç', onclick: () => close(undefined) }),
      ]),
    ]);
  }, { titleText: 'Yedeği Geri Yükle' });

  if (!picked) return false;

  const current = store.getState();
  const currentChildren = Object.keys(current?.children || {}).length;
  const currentWeeks = Object.keys(current?.weeks || {}).length;

  const message = picked.mode === 'replace'
    ? `Yedekteki ${picked.childCount} çocuk ve ${picked.weekCount} hafta yüklenecek.\n\n`
      + `Şu anda cihazda ${currentChildren} çocuk ve ${currentWeeks} hafta var ve BUNLARIN ÜZERİNE YAZILACAK.`
    : `Yedekteki ${picked.childCount} çocuk ve ${picked.weekCount} hafta mevcut verinin üzerine eklenecek.\n\n`
      + 'Aynı ad ve sınıftaki profiller eşleştirilir; diğerleri yeni profil olarak eklenir. Mevcut kayıtlar silinmez.';

  const ok = await confirmDialog({
    title: picked.mode === 'replace' ? 'Üzerine yazılsın mı?' : 'Birleştirilsin mi?',
    message,
    confirmText: picked.mode === 'replace' ? 'Üzerine yaz' : 'Birleştir',
    danger: picked.mode === 'replace',
    extra: currentWeeks > 0 && picked.mode === 'replace'
      ? el('button', {
        class: 'btn small secondary', type: 'button', text: '💾 Önce mevcut veriyi yedekle',
        onclick: (e) => { e.preventDefault(); exportBackupFile(); },
      })
      : null,
  });
  if (!ok) return false;

  try {
    const res = await store.importBackup(picked.payload, picked.mode);
    toast(`Geri yükleme tamam: ${res.children} çocuk, ${res.weeks} hafta ✅`);
    ctx.refresh();
    return true;
  } catch (e) {
    console.error(e);
    toast(`Geri yükleme başarısız: ${e?.message || e}`, 'error');
    return false;
  }
}

/* ---------------------------------------------------------- ayar sayfasi --- */

export function openSettings(ctx) {
  return openModal((close) => {
    const body = el('div', { class: 'modal-body' });
    const children = store.allChildren();
    const weeks = store.weeksWithData();

    body.append(el('div', { class: 'label', text: 'Profiller' }));
    const list = el('div', { class: 'modal-list', style: 'margin-top:6px' });
    for (const child of children) {
      const row = el('div', { class: 'modal-row' });
      row.append(avatarNode(child, 'av'));
      row.append(el('div', { class: 'who' }, [
        el('b', { text: child.name }),
        el('small', { text: [child.grade, child.archived ? 'arşivlendi' : null].filter(Boolean).join(' • ') || 'profil' }),
      ]));
      row.append(el('button', {
        class: 'mini-action', type: 'button', text: '✏️',
        'aria-label': `${child.name} profilini düzenle`,
        onclick: () => close({ edit: child.id }),
      }));
      list.append(row);
    }
    if (!children.length) list.append(el('p', { class: 'empty-note', text: 'Profil yok.' }));
    body.append(list);
    body.append(el('button', {
      class: 'btn block ghost-btn', type: 'button', text: '＋ Çocuk Ekle',
      style: 'margin-top:8px',
      onclick: () => close({ add: true }),
    }));

    body.append(el('div', { class: 'modal-divider' }));
    body.append(el('div', { class: 'label', text: 'Yedekleme' }));
    body.append(el('p', {
      style: 'color:var(--ink-soft);font-size:12.5px;font-weight:700;margin:6px 0 10px',
      text: 'Yedek dosyası bütün çocuk profillerini, tüm haftaları ve ayarları içerir. Telefon değişirse geçmiş kayıtlar kaybolmaz.',
    }));
    body.append(el('div', { class: 'modal-list' }, [
      el('button', { class: 'btn block secondary', type: 'button', text: '💾 Yedeği Dışa Aktar', onclick: () => close({ exportBackup: true }) }),
      el('button', { class: 'btn block ghost-btn', type: 'button', text: '📥 Yedeği Geri Yükle', onclick: () => close({ restore: true }) }),
    ]));

    body.append(el('div', { class: 'modal-divider' }));
    body.append(el('div', { class: 'label', text: 'Kayıtlı veri' }));
    body.append(el('p', {
      style: 'font-weight:700;font-size:13px;margin-top:6px',
      text: `${children.length} profil • ${weeks.length} haftada kayıt var`,
    }));
    if (weeks.length) {
      const latest = weeks[0];
      const oldest = weeks[weeks.length - 1];
      body.append(el('p', {
        style: 'color:var(--ink-soft);font-weight:700;font-size:12.5px',
        text: `En eski: ${fmtDate(oldest.date)} • En yeni: ${fmtDate(latest.date)}`,
      }));
      body.append(el('button', {
        class: 'btn small ghost-btn', type: 'button', text: '🗓️ Kayıtlı haftalara git',
        style: 'margin-top:8px',
        onclick: () => close({ weekPicker: true }),
      }));
    }

    body.append(el('div', { class: 'modal-divider' }));
    body.append(el('p', {
      class: 'info-box',
      text: 'Uygulama tamamen çevrimdışı çalışır. Veriler yalnızca bu telefonda saklanır; '
        + 'internet bağlantısı veya hesap gerekmez.',
    }));

    body.append(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn ghost-btn', type: 'button', text: 'Kapat', onclick: () => close(undefined) }),
    ]));
    return body;
  }, { titleText: '⚙️ Ayarlar' }).then(async (result) => {
    if (!result) return;
    if (result.add) return openChildForm(ctx, null);
    if (result.edit) return openChildForm(ctx, result.edit);
    if (result.exportBackup) return exportBackupFile();
    if (result.restore) return openRestoreDialog(ctx);
    if (result.weekPicker) return openWeekPicker(ctx);
  });
}

/* ----------------------------------------------------- hafta seciciligi --- */

export function openWeekPicker(ctx) {
  return openModal((close) => {
    const weeks = store.weeksWithData();
    const list = el('div', { class: 'modal-list' });
    if (!weeks.length) list.append(el('p', { class: 'empty-note', text: 'Henüz kayıt yok.' }));
    for (const w of weeks.slice(0, 60)) {
      list.append(el('button', {
        class: 'modal-row', type: 'button',
        'aria-selected': String(w.key === ctx.weekKey),
        onclick: () => close(w.key),
      }, [
        el('span', { class: 'av', text: '🗓️' }),
        el('div', { class: 'who' }, [
          el('b', { text: fmtDate(w.date) }),
          el('small', { text: `hafta başı ${w.key}` }),
        ]),
      ]));
    }
    return el('div', { class: 'modal-body' }, [
      list,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Kapat', onclick: () => close(undefined) }),
      ]),
    ]);
  }, { titleText: 'Kayıtlı haftalar' }).then((weekKey) => {
    if (weekKey) ctx.setWeekKey(weekKey);
  });
}
