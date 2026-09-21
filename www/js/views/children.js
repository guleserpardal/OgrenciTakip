// Cocuk profilleri: onboarding, hizli gecis seridi, profil menusu,
// ekleme / duzenleme / arsivleme / silme. Hicbir yerde isme gore is mantigi yok.

import { THEMES, THEME_ORDER, AVATARS } from '../constants.js';
import { $, el, toast, openModal, confirmDialog } from '../util.js';
import * as store from '../store.js';

/** Aktif cocugun temasini CSS degiskenlerine yazar. */
export function applyTheme(child) {
  const t = THEMES[child?.theme] || THEMES[THEME_ORDER[0]];
  const root = document.documentElement.style;
  root.setProperty('--accent', t.accent);
  root.setProperty('--accent-soft', t.soft);
  root.setProperty('--accent-deep', t.deep);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t.accent);
}

export function themeOf(child) {
  return THEMES[child?.theme] || THEMES[THEME_ORDER[0]];
}

/** Avatar gorseli: fotograf varsa onu, yoksa emojiyi dondurur. */
export function avatarNode(child, className = 'av') {
  const host = el('span', { class: className });
  if (child?.photo) host.append(el('img', { src: child.photo, alt: '' }));
  else host.textContent = child?.avatar || '🙂';
  return host;
}

/* ------------------------------------------------------- hizli gecis --- */

export function renderChildStrip(host, ctx) {
  const children = store.activeChildren();
  host.innerHTML = '';
  // Tek cocukta serit gereksiz yer kaplamasin.
  if (children.length <= 1) {
    host.hidden = true;
    return;
  }
  host.hidden = false;
  for (const child of children) {
    const t = themeOf(child);
    const selected = child.id === ctx.childId;
    const tab = el('button', {
      class: 'child-tab',
      type: 'button',
      role: 'tab',
      'aria-selected': String(selected),
      onclick: () => {
        if (child.id === ctx.childId) return;
        store.setActiveChild(child.id);
        ctx.refresh();
      },
    }, [avatarNode(child, 'tab-avatar'), el('span', { text: child.name })]);
    tab.style.setProperty('--tab-accent', t.accent);
    tab.style.setProperty('--tab-soft', t.soft);
    tab.style.setProperty('--tab-deep', t.deep);
    host.append(tab);
  }
  host.append(el('button', {
    class: 'child-tab add-tab',
    type: 'button',
    title: 'Çocuk ekle',
    'aria-label': 'Çocuk ekle',
    text: '＋',
    onclick: () => openChildForm(ctx, null),
  }));
}

/* ------------------------------------------------------- profil menusu --- */

export function openProfileMenu(ctx) {
  return openModal((close) => {
    const body = el('div', { class: 'modal-body' });
    const list = el('div', { class: 'modal-list' });

    for (const child of store.allChildren()) {
      const row = el('div', {
        class: 'modal-row',
        'aria-selected': String(child.id === ctx.childId && !child.archived),
      });
      row.append(avatarNode(child, 'av'));
      const sub = [child.grade, child.archived ? 'arşivlendi' : null].filter(Boolean).join(' • ');
      row.append(el('div', { class: 'who' }, [
        el('b', { text: child.name }),
        el('small', { text: sub || 'profil' }),
      ]));
      if (!child.archived) {
        row.append(el('button', {
          class: 'mini-action', type: 'button', title: 'Bu profile geç',
          'aria-label': `${child.name} profiline geç`, text: '✔️',
          onclick: () => { store.setActiveChild(child.id); close('switched'); },
        }));
      }
      row.append(el('button', {
        class: 'mini-action', type: 'button', title: 'Düzenle',
        'aria-label': `${child.name} profilini düzenle`, text: '✏️',
        onclick: () => close({ edit: child.id }),
      }));
      list.append(row);
    }

    if (!store.allChildren().length) {
      list.append(el('p', { class: 'empty-note', text: 'Henüz profil yok.' }));
    }

    body.append(list);
    body.append(el('div', { class: 'modal-divider' }));
    body.append(el('button', {
      class: 'btn block', type: 'button', text: '＋ Çocuk Ekle',
      onclick: () => close({ add: true }),
    }));
    body.append(el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn ghost-btn', type: 'button', text: 'Kapat', onclick: () => close(undefined) }),
    ]));
    return body;
  }, { titleText: 'Profiller' }).then(async (result) => {
    if (!result) return;
    if (result === 'switched') { ctx.refresh(); return; }
    if (result.add) { await openChildForm(ctx, null); return; }
    if (result.edit) { await openChildForm(ctx, result.edit); return; }
  });
}

/* ----------------------------------------------------- ekle / duzenle --- */

/** Fotografi 160px kareye kuculterek dataURL'e cevirir (tamamen offline saklanir). */
function fileToAvatarDataUrl(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve('');
    if (file.size > 12 * 1024 * 1024) return reject(new Error('Fotoğraf çok büyük (en fazla 12 MB).'));
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Fotoğraf okunamadı.'));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error('Fotoğraf açılamadı.'));
      img.onload = () => {
        const size = 160;
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const side = Math.min(img.width, img.height);
        const ctx2 = canvas.getContext('2d');
        ctx2.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

export function openChildForm(ctx, childId) {
  const existing = childId ? store.getChild(childId) : null;
  const draft = {
    name: existing?.name || '',
    grade: existing?.grade || '',
    avatar: existing?.avatar || AVATARS[store.allChildren().length % AVATARS.length],
    theme: existing?.theme || THEME_ORDER[store.allChildren().length % THEME_ORDER.length],
    note: existing?.note || '',
    photo: existing?.photo || '',
  };

  return openModal((close) => {
    const nameInput = el('input', { type: 'text', placeholder: 'Örn. Elis', maxlength: '60', required: true });
    nameInput.value = draft.name;
    const gradeInput = el('input', { type: 'text', placeholder: 'Örn. 1. sınıf', maxlength: '40' });
    gradeInput.value = draft.grade;
    const noteInput = el('textarea', { rows: '2', placeholder: 'Kısa not (isteğe bağlı)' });
    noteInput.value = draft.note;
    const err = el('div', { class: 'field-error' });

    // avatar secimi
    const preview = el('span', { class: 'chip-avatar', style: 'width:64px;height:64px;font-size:32px' });
    const paintPreview = () => {
      preview.innerHTML = '';
      if (draft.photo) preview.append(el('img', { src: draft.photo, alt: '' }));
      else preview.textContent = draft.avatar;
    };
    paintPreview();

    const avatarWrap = el('div', { class: 'avatars' });
    const paintAvatars = () => {
      avatarWrap.innerHTML = '';
      for (const a of AVATARS) {
        avatarWrap.append(el('button', {
          class: 'avatar-opt', type: 'button', text: a,
          'aria-pressed': String(!draft.photo && draft.avatar === a),
          'aria-label': `Avatar ${a}`,
          onclick: () => { draft.avatar = a; draft.photo = ''; paintAvatars(); paintPreview(); },
        }));
      }
    };
    paintAvatars();

    const photoInput = el('input', { type: 'file', accept: 'image/*', style: 'display:none' });
    photoInput.addEventListener('change', async () => {
      try {
        const url = await fileToAvatarDataUrl(photoInput.files?.[0]);
        if (url) { draft.photo = url; paintAvatars(); paintPreview(); }
      } catch (e) {
        err.textContent = e.message;
      }
      photoInput.value = '';
    });

    // tema secimi
    const swatchWrap = el('div', { class: 'swatches' });
    const paintSwatches = () => {
      swatchWrap.innerHTML = '';
      for (const key of THEME_ORDER) {
        const b = el('button', {
          class: 'swatch', type: 'button',
          'aria-pressed': String(draft.theme === key),
          'aria-label': THEMES[key].label,
          title: THEMES[key].label,
          onclick: () => { draft.theme = key; paintSwatches(); },
        });
        b.style.background = THEMES[key].accent;
        swatchWrap.append(b);
      }
    };
    paintSwatches();

    const submit = () => {
      const name = nameInput.value.trim();
      if (!name) { err.textContent = 'Ad zorunludur.'; nameInput.focus(); return; }
      close({
        name, grade: gradeInput.value.trim(), note: noteInput.value.trim(),
        avatar: draft.avatar, theme: draft.theme, photo: draft.photo,
      });
    };

    const form = el('form', { class: 'modal-body', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('div', { style: 'display:flex;gap:14px;align-items:center;margin-bottom:12px' }, [
        preview,
        el('div', { style: 'flex:1' }, [
          el('button', { class: 'btn small ghost-btn', type: 'button', text: '📷 Fotoğraf seç', onclick: () => photoInput.click() }),
          draft.photo || existing?.photo
            ? el('button', {
              class: 'btn small ghost-btn', type: 'button', text: '✖ Fotoğrafı kaldır',
              style: 'margin-left:6px',
              onclick: () => { draft.photo = ''; paintAvatars(); paintPreview(); },
            })
            : null,
        ]),
      ]),
      photoInput,
      el('label', { class: 'field' }, [el('span', { text: 'Ad *' }), nameInput]),
      el('label', { class: 'field' }, [el('span', { text: 'Sınıf seviyesi' }), gradeInput]),
      el('div', { class: 'field' }, [el('span', { text: 'Avatar' }), avatarWrap]),
      el('div', { class: 'field' }, [el('span', { text: 'Tema / vurgu rengi' }), swatchWrap]),
      el('label', { class: 'field' }, [el('span', { text: 'Kısa not' }), noteInput]),
      err,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Vazgeç', onclick: () => close(undefined) }),
        el('button', { class: 'btn', type: 'submit', text: existing ? 'Kaydet' : 'Profili oluştur' }),
      ]),
      existing ? el('div', { class: 'modal-divider' }) : null,
      existing ? el('div', { class: 'btn-row' }, [
        el('button', {
          class: 'btn small ghost-btn', type: 'button',
          text: existing.archived ? '↩︎ Arşivden çıkar' : '🗄️ Profili Arşivle',
          onclick: () => close({ toggleArchive: true }),
        }),
        el('button', {
          class: 'btn small danger', type: 'button', text: '🗑️ Profili Sil',
          onclick: () => close({ remove: true }),
        }),
      ]) : null,
    ]);
    return form;
  }, { titleText: existing ? 'Profili Düzenle' : 'Yeni çocuk profili' }).then(async (result) => {
    if (!result) return null;

    if (result.toggleArchive && existing) {
      if (!existing.archived && store.activeChildren().length <= 1) {
        toast('Son aktif profil arşivlenemez.', 'warn');
        return null;
      }
      store.updateChild(existing.id, { archived: !existing.archived });
      toast(existing.archived ? 'Profil arşivden çıkarıldı.' : 'Profil arşivlendi.');
      ctx.refresh();
      return null;
    }

    if (result.remove && existing) {
      await confirmDeleteChild(ctx, existing);
      return null;
    }

    if (existing) {
      store.updateChild(existing.id, result);
      toast('Profil güncellendi 💗');
    } else {
      const child = store.addChild(result);
      store.setActiveChild(child.id);
      toast(`${child.name} eklendi 🌈`);
    }
    ctx.refresh();
    return null;
  });
}

/* ------------------------------------------------------------- silme --- */

async function confirmDeleteChild(ctx, child) {
  const { exportBackupFile } = await import('./settings.js');

  const extra = el('div', {}, [
    el('div', {
      class: 'info-box',
      text: 'Silmeden önce yedek almanız önerilir. Yedek dosyası tüm çocukların '
        + 'bütün haftalarını içerir ve telefon değişince geri yüklenebilir.',
    }),
    el('button', {
      class: 'btn small secondary', type: 'button', text: '💾 Önce yedeği dışa aktar',
      style: 'margin-top:10px',
      onclick: (e) => { e.preventDefault(); exportBackupFile(); },
    }),
  ]);

  const first = await confirmDialog({
    title: `${child.name} profili silinsin mi?`,
    message: `${child.name} adına kayıtlı BÜTÜN haftalık ödev, özbakım, değerlendirme ve rapor verileri kalıcı olarak silinir.\n\nDiğer çocukların verilerine dokunulmaz.`,
    confirmText: 'Devam et',
    danger: true,
    extra,
  });
  if (!first) return;

  // Ikinci, yazili onay: yanlislikla silmeyi zorlastirir.
  const typed = await openModal((close) => {
    const input = el('input', { type: 'text', placeholder: child.name, autocapitalize: 'off', autocorrect: 'off' });
    const err = el('div', { class: 'field-error' });
    const submit = () => {
      if (input.value.trim().toLocaleLowerCase('tr') !== child.name.trim().toLocaleLowerCase('tr')) {
        err.textContent = 'Ad eşleşmedi.';
        return;
      }
      close(true);
    };
    return el('form', { class: 'modal-body', onsubmit: (e) => { e.preventDefault(); submit(); } }, [
      el('p', { class: 'modal-message', text: `Onaylamak için çocuğun adını yazın: ${child.name}` }),
      el('label', { class: 'field' }, [el('span', { text: 'Ad' }), input]),
      err,
      el('div', { class: 'modal-actions' }, [
        el('button', { class: 'btn ghost-btn', type: 'button', text: 'Vazgeç', onclick: () => close(false) }),
        el('button', { class: 'btn danger', type: 'submit', text: 'Kalıcı olarak sil' }),
      ]),
    ]);
  }, { titleText: 'Son onay' });

  if (typed !== true) return;
  store.deleteChild(child.id);
  toast(`${child.name} profili silindi.`, 'warn');
  ctx.refresh();
}

/* -------------------------------------------------------- onboarding --- */

export function renderOnboarding(host, ctx) {
  host.innerHTML = '';
  host.hidden = false;
  host.append(
    el('div', { class: 'hero-emoji', text: '🌈' }),
    el('h1', { text: 'İlk çocuk profilini oluşturalım' }),
    el('p', { class: 'sub', text: 'Ödev, özbakım ve haftalık rapor bu profile göre takip edilir. Sonradan istediğiniz kadar çocuk ekleyebilirsiniz.' }),
  );

  const card = el('div', { class: 'card' });
  const nameInput = el('input', { type: 'text', placeholder: 'Örn. Elis', maxlength: '60' });
  const gradeInput = el('input', { type: 'text', placeholder: 'Örn. 1. sınıf', maxlength: '40' });
  const err = el('div', { class: 'field-error' });

  const draft = { avatar: AVATARS[0], theme: THEME_ORDER[0] };
  const avatarWrap = el('div', { class: 'avatars' });
  const paintAvatars = () => {
    avatarWrap.innerHTML = '';
    for (const a of AVATARS.slice(0, 8)) {
      avatarWrap.append(el('button', {
        class: 'avatar-opt', type: 'button', text: a,
        'aria-pressed': String(draft.avatar === a),
        'aria-label': `Avatar ${a}`,
        onclick: () => { draft.avatar = a; paintAvatars(); },
      }));
    }
  };
  paintAvatars();

  const swatchWrap = el('div', { class: 'swatches' });
  const paintSwatches = () => {
    swatchWrap.innerHTML = '';
    for (const key of THEME_ORDER) {
      const b = el('button', {
        class: 'swatch', type: 'button',
        'aria-pressed': String(draft.theme === key),
        'aria-label': THEMES[key].label,
        onclick: () => { draft.theme = key; paintSwatches(); },
      });
      b.style.background = THEMES[key].accent;
      swatchWrap.append(b);
    }
  };
  paintSwatches();

  const create = () => {
    const name = nameInput.value.trim();
    if (!name) { err.textContent = 'Ad zorunludur.'; nameInput.focus(); return; }
    const child = store.addChild({
      name, grade: gradeInput.value.trim(), avatar: draft.avatar, theme: draft.theme,
    });
    store.setActiveChild(child.id);
    toast(`${child.name} için hazırız 🎉`);
    ctx.refresh();
  };

  const form = el('form', { onsubmit: (e) => { e.preventDefault(); create(); } }, [
    el('label', { class: 'field' }, [el('span', { text: 'Ad *' }), nameInput]),
    el('label', { class: 'field' }, [el('span', { text: 'Sınıf seviyesi (isteğe bağlı)' }), gradeInput]),
    el('div', { class: 'field' }, [el('span', { text: 'Avatar' }), avatarWrap]),
    el('div', { class: 'field' }, [el('span', { text: 'Tema / vurgu rengi' }), swatchWrap]),
    err,
    el('button', { class: 'btn block', type: 'submit', text: 'Başla 🚀' }),
  ]);
  card.append(form);
  host.append(card);

  // Yedegi olan kullanicilar dogrudan geri yukleyebilsin.
  const restoreCard = el('div', { class: 'card' }, [
    el('div', { class: 'label', text: 'Elinizde yedek var mı?' }),
    el('p', { style: 'color:var(--ink-soft);font-weight:700;font-size:13px;margin:6px 0 10px' , text: 'Önceki telefondan aldığınız JSON yedeği geri yükleyerek tüm geçmişi getirebilirsiniz.' }),
    el('button', {
      class: 'btn small secondary', type: 'button', text: '📥 Yedeği Geri Yükle',
      onclick: async () => {
        const { openRestoreDialog } = await import('./settings.js');
        await openRestoreDialog(ctx);
      },
    }),
  ]);
  host.append(restoreCard);
}
