// Veri katmani. Tum kayitlar tek bir JSON belgesinde tutulur ve
// Capacitor Preferences (Android) ya da localStorage (tarayici) ile kalici saklanir.
//
// Onemli kurallar:
//  * Cocuk kayitlari ASLA isimle anahtarlanmaz; kalici `childId` kullanilir.
//  * Haftalik veriler `weeks[weekStart].children[childId]` altinda birbirinden bagimsiz durur.
//  * Migration bir kez calisir ve `migratedFrom` ile isaretlenir; tekrar import edip cogaltmaz.

import {
  SCHEMA_VERSION, DEFAULT_HOMEWORK_TASKS, DEFAULT_CARE_TASKS,
  CARE_GROUPS, THEME_ORDER, AVATARS,
} from './constants.js';
import { uid, dateKey, mondayOf, parseDateKey, debounce, pct } from './util.js';
import { nativePlugin } from './plugins.js';

const STORAGE_KEY = 'evdeEgitimTakip:data';
const LEGACY_PREFIX = 'odevTakip:v1:';

let state = null;
let prefs = null; // Capacitor Preferences plugin, varsa

/* ------------------------------------------------------------- sema --- */

function emptyState() {
  return {
    schemaVersion: SCHEMA_VERSION,
    activeChildId: null,
    childOrder: [],
    children: {},
    weeks: {},
    settings: { lastWeek: null },
  };
}

function emptyChildWeek() {
  return {
    sound: '',
    done: {},
    careDone: {},
    reflection: { fav: '', hard: '', stars: 0 },
    parentNote: '',
    careNote: '',
    reportNote: '',
    customHomeworkTasks: [],
    customCareTasks: [],
    hiddenHomeworkTaskIds: [],
    hiddenCareTaskIds: [],
  };
}

function emptyWeek() {
  return { weekNote: '', children: {} };
}

/* -------------------------------------------------------- kaliciik --- */

async function readRaw() {
  if (prefs) {
    try {
      const { value } = await prefs.get({ key: STORAGE_KEY });
      if (value) return value;
    } catch (e) {
      console.warn('Preferences okunamadi, localStorage denenecek', e);
    }
  }
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

async function writeRaw(raw) {
  let ok = false;
  if (prefs) {
    try {
      await prefs.set({ key: STORAGE_KEY, value: raw });
      ok = true;
    } catch (e) {
      console.warn('Preferences yazilamadi', e);
    }
  }
  // Ikinci kopya: Preferences bir sebeple calismazsa veri yine korunur.
  try {
    localStorage.setItem(STORAGE_KEY, raw);
    ok = true;
  } catch (e) {
    console.warn('localStorage yazilamadi', e);
  }
  return ok;
}

const flushSave = debounce(() => {
  if (!state) return;
  writeRaw(JSON.stringify(state));
}, 220);

/** Degisiklikleri diske yazar (kisa debounce ile). */
export function save() {
  flushSave();
}

/** Bekleyen yazmayi hemen diske aktarir (uygulama arka plana gidince). */
export async function saveNow() {
  if (!state) return;
  flushSave.flush();
  await writeRaw(JSON.stringify(state));
}

/* ------------------------------------------------- migration (v1 -> v2) --- */

function legacyWeekKeys() {
  const keys = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.startsWith(LEGACY_PREFIX)) keys.push(k);
    }
  } catch { /* localStorage yoksa migration atlanir */ }
  return keys.sort();
}

/**
 * Eski tek dosyali surumun localStorage kayitlarini v2 semasina tasir.
 * Cocuk adlari veriden kesfedilir, kod icinde sabit tutulmaz.
 */
function migrateLegacy(target) {
  const keys = legacyWeekKeys();
  if (!keys.length) return { migrated: false, weeks: 0, children: [] };

  const parsed = [];
  const names = [];
  for (const key of keys) {
    let data;
    try { data = JSON.parse(localStorage.getItem(key)); } catch { continue; }
    if (!data || typeof data !== 'object') continue;
    const weekKey = key.slice(LEGACY_PREFIX.length);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey)) continue;
    parsed.push([weekKey, data]);
    for (const bucket of [data.done, data.careDone, data.reflection, data.careNote]) {
      if (bucket && typeof bucket === 'object') {
        for (const name of Object.keys(bucket)) {
          if (name && !names.includes(name)) names.push(name);
        }
      }
    }
  }
  if (!parsed.length) return { migrated: false, weeks: 0, children: [] };
  if (!names.length) names.push('Çocuk 1');

  // Isim -> yeni childId eslesmesi (varsa mevcut profili yeniden kullan).
  const idByName = {};
  for (const name of names) {
    const existing = Object.values(target.children).find((c) => c.name === name);
    const child = existing || createChildRecord(target, { name });
    idByName[name] = child.id;
  }

  const defaultHomeworkIds = new Set(DEFAULT_HOMEWORK_TASKS.map((t) => t.id));
  const defaultCareIds = new Set(DEFAULT_CARE_TASKS.map((t) => t.id));
  let weekCount = 0;

  for (const [weekKey, data] of parsed) {
    const week = target.weeks[weekKey] || (target.weeks[weekKey] = emptyWeek());
    if (typeof data.parentNote === 'string' && data.parentNote.trim() && !week.weekNote) {
      week.weekNote = data.parentNote;
    }
    const customHomework = Array.isArray(data.tasks)
      ? data.tasks.filter((t) => t && t.id && !defaultHomeworkIds.has(t.id))
      : [];
    const customCare = Array.isArray(data.careTasks)
      ? data.careTasks.filter((t) => t && t.id && !defaultCareIds.has(t.id))
      : [];

    for (const name of names) {
      const childId = idByName[name];
      const cw = week.children[childId] || (week.children[childId] = emptyChildWeek());
      if (typeof data.sound === 'string' && data.sound.trim()) cw.sound = data.sound;

      const done = data.done?.[name];
      if (done && typeof done === 'object') {
        for (const [k, v] of Object.entries(done)) if (v) cw.done[k] = true;
      }
      const careDone = data.careDone?.[name];
      if (careDone && typeof careDone === 'object') {
        for (const [k, v] of Object.entries(careDone)) if (v) cw.careDone[k] = true;
      }
      const refl = data.reflection?.[name];
      if (refl && typeof refl === 'object') {
        cw.reflection = {
          fav: String(refl.fav || ''),
          hard: String(refl.hard || ''),
          stars: Number(refl.stars) || 0,
        };
      }
      const careNote = data.careNote?.[name];
      if (typeof careNote === 'string' && careNote.trim()) cw.careNote = careNote;
      // v1'de ogretmen notu hafta genelinde tekti; veri kaybetmemek icin her cocuga kopyalanir.
      if (typeof data.reportNote === 'string' && data.reportNote.trim() && !cw.reportNote) {
        cw.reportNote = data.reportNote;
      }
      if (customHomework.length) {
        cw.customHomeworkTasks = customHomework.map((t) => ({
          id: t.id, icon: t.icon || '⭐', title: String(t.title || 'Görev'), desc: String(t.desc || ''),
        }));
      }
      if (customCare.length) {
        cw.customCareTasks = customCare.map((t) => ({
          id: t.id, icon: t.icon || '⭐', title: String(t.title || 'Beceri'), desc: String(t.desc || ''),
          cat: CARE_GROUPS.includes(t.cat) ? t.cat : CARE_GROUPS[0],
        }));
      }
    }
    weekCount++;
  }

  target.migratedFrom = 'odevTakip:v1';
  target.migratedAt = new Date().toISOString();
  return { migrated: true, weeks: weekCount, children: names };
}

/* ---------------------------------------------------------- normalize --- */

function normalize(input) {
  const base = emptyState();
  if (!input || typeof input !== 'object') return base;

  base.schemaVersion = SCHEMA_VERSION;
  base.migratedFrom = input.migratedFrom;
  base.migratedAt = input.migratedAt;
  base.settings = { ...base.settings, ...(input.settings || {}) };

  const children = input.children && typeof input.children === 'object' ? input.children : {};
  for (const [id, raw] of Object.entries(children)) {
    if (!id || !raw || typeof raw !== 'object') continue;
    base.children[id] = {
      id,
      name: String(raw.name || 'Çocuk').slice(0, 60),
      grade: String(raw.grade || ''),
      avatar: typeof raw.avatar === 'string' && raw.avatar ? raw.avatar : AVATARS[0],
      photo: typeof raw.photo === 'string' && raw.photo.startsWith('data:') ? raw.photo : '',
      theme: THEME_ORDER.includes(raw.theme) ? raw.theme : THEME_ORDER[0],
      note: String(raw.note || ''),
      archived: !!raw.archived,
      createdAt: raw.createdAt || new Date().toISOString(),
    };
  }

  const order = Array.isArray(input.childOrder) ? input.childOrder.filter((id) => base.children[id]) : [];
  for (const id of Object.keys(base.children)) if (!order.includes(id)) order.push(id);
  base.childOrder = order;

  const weeks = input.weeks && typeof input.weeks === 'object' ? input.weeks : {};
  for (const [weekKey, rawWeek] of Object.entries(weeks)) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(weekKey) || !rawWeek || typeof rawWeek !== 'object') continue;
    const week = emptyWeek();
    week.weekNote = String(rawWeek.weekNote || '');
    const rawChildren = rawWeek.children && typeof rawWeek.children === 'object' ? rawWeek.children : {};
    for (const [childId, rawCw] of Object.entries(rawChildren)) {
      if (!base.children[childId] || !rawCw || typeof rawCw !== 'object') continue;
      const cw = emptyChildWeek();
      cw.sound = String(rawCw.sound || '');
      cw.parentNote = String(rawCw.parentNote || '');
      cw.careNote = String(rawCw.careNote || '');
      cw.reportNote = String(rawCw.reportNote || '');
      for (const [k, v] of Object.entries(rawCw.done || {})) if (v) cw.done[k] = true;
      for (const [k, v] of Object.entries(rawCw.careDone || {})) if (v) cw.careDone[k] = true;
      const r = rawCw.reflection || {};
      cw.reflection = {
        fav: String(r.fav || ''),
        hard: String(r.hard || ''),
        stars: Math.max(0, Math.min(5, Number(r.stars) || 0)),
      };
      cw.customHomeworkTasks = (Array.isArray(rawCw.customHomeworkTasks) ? rawCw.customHomeworkTasks : [])
        .filter((t) => t && t.id)
        .map((t) => ({ id: String(t.id), icon: String(t.icon || '⭐'), title: String(t.title || 'Görev'), desc: String(t.desc || '') }));
      cw.customCareTasks = (Array.isArray(rawCw.customCareTasks) ? rawCw.customCareTasks : [])
        .filter((t) => t && t.id)
        .map((t) => ({
          id: String(t.id), icon: String(t.icon || '⭐'), title: String(t.title || 'Beceri'), desc: String(t.desc || ''),
          cat: CARE_GROUPS.includes(t.cat) ? t.cat : CARE_GROUPS[0],
        }));
      cw.hiddenHomeworkTaskIds = (Array.isArray(rawCw.hiddenHomeworkTaskIds) ? rawCw.hiddenHomeworkTaskIds : []).map(String);
      cw.hiddenCareTaskIds = (Array.isArray(rawCw.hiddenCareTaskIds) ? rawCw.hiddenCareTaskIds : []).map(String);
      week.children[childId] = cw;
    }
    base.weeks[weekKey] = week;
  }

  base.activeChildId = base.children[input.activeChildId] ? input.activeChildId
    : (base.childOrder.find((id) => !base.children[id].archived) || null);
  return base;
}

/* --------------------------------------------------------------- init --- */

export async function initStore() {
  prefs = nativePlugin('Preferences');

  const raw = await readRaw();
  let parsed = null;
  if (raw) {
    try { parsed = JSON.parse(raw); } catch (e) { console.warn('Kayitli veri bozuk, yedekten baslaniyor', e); }
  }
  state = normalize(parsed);

  let migration = { migrated: false };
  // Migration yalnizca daha once yapilmadiysa ve v2 verisi bossa denenir.
  if (!state.migratedFrom && !Object.keys(state.weeks).length) {
    migration = migrateLegacy(state);
    if (migration.migrated) await writeRaw(JSON.stringify(state));
  }
  return { state, migration };
}

export function getState() {
  return state;
}

/* ------------------------------------------------------------ cocuklar --- */

function createChildRecord(target, { name, grade = '', avatar = '', theme = '', note = '', photo = '' }) {
  const id = uid('child');
  const index = target.childOrder.length;
  const child = {
    id,
    name: String(name || 'Çocuk').trim().slice(0, 60) || 'Çocuk',
    grade: String(grade || ''),
    avatar: avatar || AVATARS[index % AVATARS.length],
    photo: photo || '',
    theme: THEME_ORDER.includes(theme) ? theme : THEME_ORDER[index % THEME_ORDER.length],
    note: String(note || ''),
    archived: false,
    createdAt: new Date().toISOString(),
  };
  target.children[id] = child;
  target.childOrder.push(id);
  if (!target.activeChildId) target.activeChildId = id;
  return child;
}

export function addChild(data) {
  const child = createChildRecord(state, data);
  save();
  return child;
}

export function updateChild(childId, patch) {
  const child = state.children[childId];
  if (!child) return null;
  if (patch.name !== undefined) child.name = String(patch.name).trim().slice(0, 60) || child.name;
  if (patch.grade !== undefined) child.grade = String(patch.grade);
  if (patch.avatar !== undefined) child.avatar = String(patch.avatar);
  if (patch.photo !== undefined) child.photo = String(patch.photo || '');
  if (patch.theme !== undefined && THEME_ORDER.includes(patch.theme)) child.theme = patch.theme;
  if (patch.note !== undefined) child.note = String(patch.note);
  if (patch.archived !== undefined) child.archived = !!patch.archived;
  // Arsivlenen cocuk aktifse aktifligi bosta olmayan bir profile devret.
  if (child.archived && state.activeChildId === childId) {
    state.activeChildId = activeChildren().find((c) => c.id !== childId)?.id || null;
  }
  save();
  return child;
}

/** Cocugu ve TUM haftalardaki kayitlarini siler. Diger cocuklara dokunmaz. */
export function deleteChild(childId) {
  if (!state.children[childId]) return false;
  delete state.children[childId];
  state.childOrder = state.childOrder.filter((id) => id !== childId);
  for (const week of Object.values(state.weeks)) {
    if (week.children) delete week.children[childId];
  }
  // Tamamen bosalan haftalari temizle.
  for (const [key, week] of Object.entries(state.weeks)) {
    if (!week.weekNote && !Object.keys(week.children || {}).length) delete state.weeks[key];
  }
  if (state.activeChildId === childId) {
    state.activeChildId = activeChildren()[0]?.id || null;
  }
  save();
  return true;
}

/** Arsivlenmemis cocuklar, kayit sirasina gore. */
export function activeChildren() {
  return state.childOrder.map((id) => state.children[id]).filter((c) => c && !c.archived);
}

export function allChildren() {
  return state.childOrder.map((id) => state.children[id]).filter(Boolean);
}

export function getChild(childId) {
  return state.children[childId] || null;
}

export function getActiveChild() {
  const list = activeChildren();
  if (!list.length) return null;
  const current = state.children[state.activeChildId];
  if (current && !current.archived) return current;
  state.activeChildId = list[0].id;
  return list[0];
}

export function setActiveChild(childId) {
  if (state.children[childId] && !state.children[childId].archived) {
    state.activeChildId = childId;
    save();
  }
}

/* -------------------------------------------------------------- hafta --- */

export function weekKeyFor(date) {
  return dateKey(mondayOf(date));
}

/** Okuma amacli: kayit yoksa bos sablon doner, state'i kirletmez. */
export function readWeek(weekKey) {
  return state.weeks[weekKey] || emptyWeek();
}

export function readChildWeek(weekKey, childId) {
  return state.weeks[weekKey]?.children?.[childId] || emptyChildWeek();
}

/** Yazma amacli: kayitlari gerektigi kadar olusturur. */
export function mutWeek(weekKey) {
  return state.weeks[weekKey] || (state.weeks[weekKey] = emptyWeek());
}

export function mutChildWeek(weekKey, childId) {
  const week = mutWeek(weekKey);
  return week.children[childId] || (week.children[childId] = emptyChildWeek());
}

export function setWeekNote(weekKey, text) {
  mutWeek(weekKey).weekNote = String(text || '');
  save();
}

/* ----------------------------------------------- haftanin sesi / hedef --- */

/**
 * Bu haftaya kayitli ses varsa onu verir. Yoksa en yakin ONCEKI haftadan
 * devralir (yalnizca oneri olarak; gecmis hafta kaydi degistirilmez).
 */
export function getSound(weekKey, childId) {
  const own = state.weeks[weekKey]?.children?.[childId]?.sound;
  if (own) return own;
  const earlier = Object.keys(state.weeks)
    .filter((k) => k < weekKey && state.weeks[k]?.children?.[childId]?.sound)
    .sort();
  if (!earlier.length) return '';
  return state.weeks[earlier[earlier.length - 1]].children[childId].sound;
}

/** Bu haftada gercekten kayitli olan ses (devralma yok). */
export function getOwnSound(weekKey, childId) {
  return state.weeks[weekKey]?.children?.[childId]?.sound || '';
}

export function setSound(weekKey, childId, value) {
  mutChildWeek(weekKey, childId).sound = String(value || '').slice(0, 24);
  save();
}

/* ------------------------------------------------------------ gorevler --- */

export function homeworkTasksFor(weekKey, childId) {
  const cw = readChildWeek(weekKey, childId);
  const hidden = new Set(cw.hiddenHomeworkTaskIds || []);
  return [
    ...DEFAULT_HOMEWORK_TASKS.filter((t) => !hidden.has(t.id)),
    ...(cw.customHomeworkTasks || []),
  ];
}

export function careTasksFor(weekKey, childId) {
  const cw = readChildWeek(weekKey, childId);
  const hidden = new Set(cw.hiddenCareTaskIds || []);
  const all = [
    ...DEFAULT_CARE_TASKS.filter((t) => !hidden.has(t.id)),
    ...(cw.customCareTasks || []),
  ];
  return CARE_GROUPS.flatMap((cat) => all.filter((t) => t.cat === cat))
    .concat(all.filter((t) => !CARE_GROUPS.includes(t.cat)));
}

const DEFAULT_HOMEWORK_IDS = new Set(DEFAULT_HOMEWORK_TASKS.map((t) => t.id));
const DEFAULT_CARE_IDS = new Set(DEFAULT_CARE_TASKS.map((t) => t.id));

export const isDefaultHomeworkTask = (id) => DEFAULT_HOMEWORK_IDS.has(id);
export const isDefaultCareTask = (id) => DEFAULT_CARE_IDS.has(id);

export function addCustomTask(weekKey, childId, kind, task) {
  const cw = mutChildWeek(weekKey, childId);
  const list = kind === 'care' ? cw.customCareTasks : cw.customHomeworkTasks;
  const entry = {
    id: `custom_${kind}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`,
    icon: String(task.icon || '⭐').slice(0, 4),
    title: String(task.title || 'Görev').slice(0, 80),
    desc: String(task.desc || '').slice(0, 160),
  };
  if (kind === 'care') entry.cat = CARE_GROUPS.includes(task.cat) ? task.cat : CARE_GROUPS[0];
  list.push(entry);
  save();
  return entry;
}

export function updateCustomTask(weekKey, childId, kind, taskId, patch) {
  const cw = mutChildWeek(weekKey, childId);
  const list = kind === 'care' ? cw.customCareTasks : cw.customHomeworkTasks;
  const task = list.find((t) => t.id === taskId);
  if (!task) return null;
  if (patch.title !== undefined) task.title = String(patch.title).slice(0, 80);
  if (patch.desc !== undefined) task.desc = String(patch.desc).slice(0, 160);
  if (patch.icon !== undefined) task.icon = String(patch.icon).slice(0, 4);
  if (patch.cat !== undefined && kind === 'care' && CARE_GROUPS.includes(patch.cat)) task.cat = patch.cat;
  save();
  return task;
}

/** Ozel gorevi siler; varsayilan gorev ise o cocuk-hafta icin gizler. */
export function removeTask(weekKey, childId, kind, taskId) {
  const cw = mutChildWeek(weekKey, childId);
  const isDefault = kind === 'care' ? isDefaultCareTask(taskId) : isDefaultHomeworkTask(taskId);
  if (isDefault) {
    const hidden = kind === 'care' ? cw.hiddenCareTaskIds : cw.hiddenHomeworkTaskIds;
    if (!hidden.includes(taskId)) hidden.push(taskId);
  } else if (kind === 'care') {
    cw.customCareTasks = cw.customCareTasks.filter((t) => t.id !== taskId);
  } else {
    cw.customHomeworkTasks = cw.customHomeworkTasks.filter((t) => t.id !== taskId);
  }
  // Isaretlemeleri de temizle.
  const bucket = kind === 'care' ? cw.careDone : cw.done;
  for (const key of Object.keys(bucket)) {
    if (key.startsWith(`${taskId}:`)) delete bucket[key];
  }
  save();
}

export function restoreHiddenTask(weekKey, childId, kind, taskId) {
  const cw = mutChildWeek(weekKey, childId);
  if (kind === 'care') cw.hiddenCareTaskIds = cw.hiddenCareTaskIds.filter((id) => id !== taskId);
  else cw.hiddenHomeworkTaskIds = cw.hiddenHomeworkTaskIds.filter((id) => id !== taskId);
  save();
}

export function hiddenTasksFor(weekKey, childId, kind) {
  const cw = readChildWeek(weekKey, childId);
  const ids = new Set(kind === 'care' ? cw.hiddenCareTaskIds : cw.hiddenHomeworkTaskIds);
  const source = kind === 'care' ? DEFAULT_CARE_TASKS : DEFAULT_HOMEWORK_TASKS;
  return source.filter((t) => ids.has(t.id));
}

/* --------------------------------------------------------- isaretleme --- */

export function isDone(weekKey, childId, kind, taskId, dayIndex) {
  const cw = readChildWeek(weekKey, childId);
  const bucket = kind === 'care' ? cw.careDone : cw.done;
  return !!bucket[`${taskId}:${dayIndex}`];
}

export function setDone(weekKey, childId, kind, taskId, dayIndex, value) {
  const cw = mutChildWeek(weekKey, childId);
  const bucket = kind === 'care' ? cw.careDone : cw.done;
  const key = `${taskId}:${dayIndex}`;
  if (value) bucket[key] = true; else delete bucket[key];
  save();
}

export function toggleDone(weekKey, childId, kind, taskId, dayIndex) {
  const next = !isDone(weekKey, childId, kind, taskId, dayIndex);
  setDone(weekKey, childId, kind, taskId, dayIndex, next);
  return next;
}

/** Bir gorevin haftada kac gun tamamlandigi. */
export function taskWeeklyCount(weekKey, childId, kind, taskId) {
  let n = 0;
  for (let i = 0; i < 7; i++) if (isDone(weekKey, childId, kind, taskId, i)) n++;
  return n;
}

/** Haftalik ozet: {n, total, pct}. */
export function summary(weekKey, childId, kind) {
  const tasks = kind === 'care' ? careTasksFor(weekKey, childId) : homeworkTasksFor(weekKey, childId);
  let n = 0;
  for (const t of tasks) n += taskWeeklyCount(weekKey, childId, kind, t.id);
  const total = tasks.length * 7;
  return { n, total, pct: pct(n, total) };
}

/** Tek bir gunun ozeti (gun serisindeki noktalar icin). */
export function daySummary(weekKey, childId, kind, dayIndex) {
  const tasks = kind === 'care' ? careTasksFor(weekKey, childId) : homeworkTasksFor(weekKey, childId);
  let n = 0;
  for (const t of tasks) if (isDone(weekKey, childId, kind, t.id, dayIndex)) n++;
  return { n, total: tasks.length, pct: pct(n, tasks.length) };
}

/* ------------------------------------------------- notlar / yansitma --- */

export function setReflection(weekKey, childId, patch) {
  const cw = mutChildWeek(weekKey, childId);
  if (patch.fav !== undefined) cw.reflection.fav = String(patch.fav);
  if (patch.hard !== undefined) cw.reflection.hard = String(patch.hard);
  if (patch.stars !== undefined) cw.reflection.stars = Math.max(0, Math.min(5, Number(patch.stars) || 0));
  save();
}

export function setChildNote(weekKey, childId, field, text) {
  const cw = mutChildWeek(weekKey, childId);
  if (!['careNote', 'parentNote', 'reportNote'].includes(field)) return;
  cw[field] = String(text || '');
  save();
}

/* ------------------------------------------------------------- yedek --- */

export function exportBackup() {
  return {
    app: 'Evde Eğitim Takip',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: JSON.parse(JSON.stringify(state)),
  };
}

/**
 * Yedegi geri yukler.
 * mode 'replace' : mevcut veri tamamen degistirilir.
 * mode 'merge'   : cocuklar ve haftalar birlestirilir, childId cakismasi guvenli cozulur.
 */
export async function importBackup(payload, mode = 'replace') {
  const incoming = normalize(payload?.data ?? payload);
  if (!Object.keys(incoming.children).length && !Object.keys(incoming.weeks).length) {
    throw new Error('Yedek dosyasında tanınan veri yok.');
  }

  if (mode === 'replace') {
    state = incoming;
    // Migration bayragini koru; aksi halde eski v1 verisi tekrar iceri alinir.
    state.migratedFrom = state.migratedFrom || 'restore';
    await saveNow();
    return { children: Object.keys(state.children).length, weeks: Object.keys(state.weeks).length };
  }

  // merge: gelen her cocuk icin yeni bir id uret, mevcut veriye dokunma.
  const idMap = {};
  for (const id of incoming.childOrder) {
    const src = incoming.children[id];
    const twin = Object.values(state.children).find(
      (c) => c.name === src.name && c.grade === src.grade,
    );
    if (twin) {
      idMap[id] = twin.id;
    } else {
      const created = createChildRecord(state, src);
      idMap[id] = created.id;
    }
  }
  for (const [weekKey, week] of Object.entries(incoming.weeks)) {
    const target = mutWeek(weekKey);
    if (week.weekNote && !target.weekNote) target.weekNote = week.weekNote;
    for (const [oldId, cw] of Object.entries(week.children)) {
      const newId = idMap[oldId];
      if (!newId) continue;
      const dest = mutChildWeek(weekKey, newId);
      dest.sound = dest.sound || cw.sound;
      Object.assign(dest.done, cw.done);
      Object.assign(dest.careDone, cw.careDone);
      dest.reflection = {
        fav: dest.reflection.fav || cw.reflection.fav,
        hard: dest.reflection.hard || cw.reflection.hard,
        stars: dest.reflection.stars || cw.reflection.stars,
      };
      for (const f of ['parentNote', 'careNote', 'reportNote']) dest[f] = dest[f] || cw[f];
      const seen = new Set(dest.customHomeworkTasks.map((t) => t.id));
      for (const t of cw.customHomeworkTasks) if (!seen.has(t.id)) dest.customHomeworkTasks.push(t);
      const seenCare = new Set(dest.customCareTasks.map((t) => t.id));
      for (const t of cw.customCareTasks) if (!seenCare.has(t.id)) dest.customCareTasks.push(t);
    }
  }
  await saveNow();
  return { children: Object.keys(state.children).length, weeks: Object.keys(state.weeks).length };
}

/** Veri iceren haftalarin listesi (en yeni once). */
export function weeksWithData() {
  return Object.keys(state.weeks)
    .filter((k) => {
      const w = state.weeks[k];
      if (w.weekNote) return true;
      return Object.values(w.children || {}).some(
        (cw) => Object.keys(cw.done).length || Object.keys(cw.careDone).length
          || cw.careNote || cw.parentNote || cw.reportNote || cw.sound
          || cw.reflection.fav || cw.reflection.hard || cw.reflection.stars,
      );
    })
    .sort()
    .reverse()
    .map((k) => ({ key: k, date: parseDateKey(k) }));
}

/** Testler ve tarayici konsolu icin. */
export function __setStateForTests(next) {
  state = normalize(next);
  return state;
}
