// Evde Eğitim Takip — uçtan uca kabul kriteri testleri (Chromium).
//   npm test
import { mkdirSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, chromiumPath, makeReporter } from './server.mjs';

const SHOTS = process.env.SHOTS_DIR || join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), '.test-shots');
mkdirSync(SHOTS, { recursive: true });

const { server, base: BASE } = await startServer();

const { ok, finish } = makeReporter('Uygulama kabul testleri');

const browser = await chromium.launch({ executablePath: chromiumPath() });
const context = await browser.newContext({
  viewport: { width: 412, height: 915 },      // Galaxy S24 Ultra sinifi
  deviceScaleFactor: 2,
  isMobile: true,
  hasTouch: true,
  locale: 'tr-TR',
  timezoneId: 'Europe/Istanbul',
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
page.on('console', (m) => {
  if (m.type() !== 'error') return;
  const t = m.text();
  if (/favicon/i.test(t)) return;
  errors.push(`console: ${t}`);
});
page.on('requestfailed', (r) => {
  if (!/favicon/i.test(r.url())) errors.push(`requestfailed: ${r.url()}`);
});

const shot = (n) => page.screenshot({ path: join(SHOTS, `${n}.png`), fullPage: false });

/* ------------------------------------------------- 1. ilk acilis / onboarding */
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForSelector('#onboarding:not([hidden])', { timeout: 8000 });
ok('Onboarding: cocuk yoksa ilk profil ekrani gosteriliyor',
  await page.locator('#onboarding h1').textContent().then((t) => t.includes('İlk çocuk profilini')));
await shot('01-onboarding');

await page.fill('#onboarding input[type=text]', 'Elis');
await page.locator('#onboarding .field').nth(1).locator('input').fill('1. sınıf');
await page.click('#onboarding button[type=submit]');
await page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
ok('Yeni cocuk profili eklenebiliyor', (await page.locator('#chipName').textContent()) === 'Elis');
ok('Ust baslik iyelik ekiyle kisiselesiyor',
  (await page.locator('#pageTitle').textContent()) === "Elis'in Bu Haftası",
  await page.locator('#pageTitle').textContent());
await shot('02-homework-elis');

/* --------------------------------------------------- 2. odev isaretlemeleri */
const weekKeyNow = await page.evaluate(() => window.EvdeEgitim.ctx.weekKey);
const todayIdx = await page.evaluate(() => window.EvdeEgitim.ctx.dayIndex);
ok('Acilista bu hafta + bugunun gunu secili',
  await page.locator('.day-strip .day').nth(todayIdx).getAttribute('aria-pressed').then((v) => v === 'true'),
  `hafta=${weekKeyNow} gun=${todayIdx}`);

await page.locator('#view-homework .task-card').nth(0).locator('.check-btn').click();
await page.locator('#view-homework .task-card').nth(2).locator('.check-btn').click();
await page.waitForTimeout(150);
ok('Odev kutulari gun bazinda isaretlenebiliyor',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 2),
  `${await page.locator('#view-homework .task-card.done').count()} kart done`);

const pctAfter2 = await page.locator('#view-homework .progress-top .big').textContent();
// 8 varsayilan gorev x 7 gun = 56; 2 isaretleme => 4%
ok('Yuzde hesabi dogru (2/56 = 4%)', pctAfter2.trim() === '4%', pctAfter2);

// geri alma
await page.locator('#view-homework .task-card').nth(0).locator('.check-btn').click();
await page.waitForTimeout(120);
ok('Tekrar dokununca geri alinabiliyor',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 1));
await page.locator('#view-homework .task-card').nth(0).locator('.check-btn').click();
await page.waitForTimeout(120);

/* ------------------------------------------------------ 3. haftanin sesi */
await page.fill('.focus-card input', 'A a');
await page.click('.focus-card button');
await page.waitForTimeout(250);
ok('Haftanin sesi kaydedilebiliyor',
  await page.evaluate((w) => {
    const s = window.EvdeEgitim.store;
    return s.getOwnSound(w, s.getActiveChild().id) === 'A a';
  }, weekKeyNow));

/* --------------------------------------------------- 4. yansitma/yildiz */
await page.locator('#view-homework .card textarea').nth(0).fill('hikâye okumak');
await page.locator('#view-homework .card textarea').nth(1).fill('satırda yazmak');
await page.locator('#view-homework .star').nth(3).click();
await page.waitForTimeout(200);
const refl = await page.evaluate((w) => {
  const s = window.EvdeEgitim.store;
  return s.readChildWeek(w, s.getActiveChild().id).reflection;
}, weekKeyNow);
ok('Haftalik degerlendirme (fav/zorluk/yildiz) kaydediliyor',
  refl.fav === 'hikâye okumak' && refl.hard === 'satırda yazmak' && refl.stars === 4,
  JSON.stringify(refl));

/* ------------------------------------------------------ 5. ozbakim ekrani */
await page.click('.nav-btn[data-view=care]');
await page.waitForSelector('#view-care:not([hidden])');
ok('Ozbakim ekraninda 12 varsayilan beceri var',
  await page.locator('#view-care .task-card').count().then((c) => c === 12),
  `${await page.locator('#view-care .task-card').count()} beceri`);
ok('Ozbakim gruplari gosteriliyor (Sabah / Gun icinde / Aksam)',
  await page.locator('#view-care .care-group').count().then((c) => c === 3));
await page.locator('#view-care .task-card').nth(0).locator('.check-btn').click();
await page.locator('#view-care .task-card').nth(1).locator('.check-btn').click();
await page.locator('#view-care .task-card').nth(5).locator('.check-btn').click();
await page.waitForTimeout(150);
ok('Ozbakim kutulari gun bazinda isaretlenebiliyor',
  await page.locator('#view-care .task-card.done').count().then((c) => c === 3));
await page.locator('#view-care textarea').last().fill('Dişlerini hatırlatmadan fırçaladı.');
await page.locator('#view-care .card').last().locator('button').click();
await page.waitForTimeout(200);
await shot('03-care');

/* ---------------------------------------------------- 6. ikinci cocuk ekle */
await page.click('#profileChip');
await page.waitForSelector('.modal-overlay.show');
await page.click('.modal-sheet button:has-text("Çocuk Ekle")');
await page.waitForTimeout(400);
await page.fill('.modal-sheet input[type=text]', 'Lila');
await page.locator('.modal-sheet .swatch').nth(1).click();   // mor tema
await page.click('.modal-sheet button[type=submit]');
await page.waitForTimeout(400);
ok('Ikinci cocuk profili eklenebiliyor',
  (await page.locator('#chipName').textContent()) === 'Lila');
ok('Cocuk seridi (hizli gecis) 2 cocukta gorunuyor',
  await page.locator('#childStrip .child-tab:not(.add-tab)').count().then((c) => c === 2));
ok('Aktif cocuk degisince tema rengi degisiyor',
  await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() === '#9a7cf6'),
  await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--accent')));

/* --------------------------------------- 7. veri izolasyonu (cocuk bazinda) */
await page.click('.nav-btn[data-view=homework]');
await page.waitForSelector('#view-homework:not([hidden])');
ok('Yeni cocugun odev kayitlari bos (veriler karismiyor)',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 0),
  `${await page.locator('#view-homework .task-card.done').count()} done`);
ok('Yeni cocugun haftanin sesi bos (cocuk bazinda tutuluyor)',
  await page.locator('.focus-card input').inputValue().then((v) => v === ''));

await page.locator('#view-homework .task-card').nth(1).locator('.check-btn').click();
await page.waitForTimeout(150);
// Elis'e geri don
await page.locator('#childStrip .child-tab').nth(0).click();
await page.waitForTimeout(300);
ok('Elis profiline donunce kendi isaretlemeleri korunuyor',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 2),
  `${await page.locator('#view-homework .task-card.done').count()} done`);
ok('Elis in haftanin sesi korunuyor',
  await page.locator('.focus-card input').inputValue().then((v) => v === 'A a'));

/* ------------------------------------------------------- 8. hafta gezinme */
await page.click('#prevWeek');
await page.waitForTimeout(300);
const prevWeekKey = await page.evaluate(() => window.EvdeEgitim.ctx.weekKey);
ok('Onceki haftaya gecilebiliyor', prevWeekKey < weekKeyNow, `${prevWeekKey} < ${weekKeyNow}`);
ok('Onceki haftanin verisi ayri (isaretlemeler bos)',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 0));
ok('Haftanin sesi onceki haftada devralinmiyor (gecmis degismiyor)',
  await page.locator('.focus-card input').inputValue().then((v) => v === ''),
  await page.locator('.focus-card input').inputValue());

// gecmis haftaya farkli ses yaz
await page.fill('.focus-card input', 'Ö ö');
await page.click('.focus-card button');
await page.waitForTimeout(250);
await page.click('#nextWeek');
await page.waitForTimeout(300);
ok('Bu haftaya donunce ses hala A a (gecmis hafta etkilemedi)',
  await page.locator('.focus-card input').inputValue().then((v) => v === 'A a'),
  await page.locator('.focus-card input').inputValue());

// sonraki hafta: devralma onerisi
await page.click('#nextWeek');
await page.waitForTimeout(300);
ok('Sonraki haftada ses onceki haftadan devralinip oneriliyor',
  await page.locator('.focus-card input').inputValue().then((v) => v === 'A a'));
ok('Devralinan ses henuz o haftaya YAZILMADI',
  await page.evaluate(() => {
    const s = window.EvdeEgitim.store;
    return s.getOwnSound(window.EvdeEgitim.ctx.weekKey, s.getActiveChild().id) === '';
  }));
await page.click('#todayWeek');
await page.waitForTimeout(300);

/* --------------------------------------------------------- 9. ozel gorev */
await page.click('#view-homework .section-title button');
await page.waitForTimeout(350);
await page.fill('.modal-sheet input[type=text]', 'Ritim çalışması');
await page.locator('.modal-sheet .field').nth(1).locator('input').fill('Tempo ve ritim oyunu');
await page.click('.modal-sheet button[type=submit]');
await page.waitForTimeout(350);
ok('Yeni ozel odev gorevi eklenebiliyor',
  await page.locator('#view-homework .task-card').count().then((c) => c === 9),
  `${await page.locator('#view-homework .task-card').count()} gorev`);
const customPct = await page.locator('#view-homework .progress-top .big').textContent();
// 9 gorev x 7 = 63, 2 isaretleme => 3%
ok('Ozel gorev yuzde hesabina dahil (2/63 = 3%)', customPct.trim() === '3%', customPct);

// Lila'ya gecince ozel gorev onda olmamali (cocuga ozel)
await page.locator('#childStrip .child-tab').nth(1).click();
await page.waitForTimeout(300);
ok('Ozel gorev yalnizca eklendigi cocukta (digerini etkilemiyor)',
  await page.locator('#view-homework .task-card').count().then((c) => c === 8),
  `${await page.locator('#view-homework .task-card').count()} gorev`);
await page.locator('#childStrip .child-tab').nth(0).click();
await page.waitForTimeout(300);

/* ------------------------------------------------------ 10. anne takibi */
await page.click('.nav-btn[data-view=parent]');
await page.waitForSelector('#view-parent:not([hidden])');
ok('Anne ekraninda tum cocuklar icin ozet karti var',
  await page.locator('#view-parent .summary-card').count().then((c) => c === 2));
ok('Cocuk seridi anne ekraninda gizli (brief: odev/ozbakimda)',
  await page.locator('#childStrip').isHidden());
const cards = await page.locator('#view-parent .summary-card').allTextContents();
ok('Ozet kartlarinda yuzdeler dogru gorunuyor',
  cards[0].includes('3%') && cards[0].includes('2/63'), cards[0].replace(/\s+/g, ' ').slice(0, 90));

// tablodan isaretleme
const beforeChecks = await page.locator('#view-parent .mini-check.done').count();
const targetCheck = await page.locator('#view-parent .mini-check:not(.done)').nth(0).elementHandle();
await targetCheck.click();
await page.waitForTimeout(250);
ok('Anne tablosundan isaretleme yapilabiliyor',
  await page.locator('#view-parent .mini-check.done').count().then((c) => c === beforeChecks + 1));
await targetCheck.click();  // ayni kutuyu geri al
await page.waitForTimeout(250);
ok('Anne tablosundan isaretleme geri alinabiliyor',
  await page.locator('#view-parent .mini-check.done').count().then((c) => c === beforeChecks),
  `${await page.locator('#view-parent .mini-check.done').count()} vs ${beforeChecks}`);

await page.locator('#view-parent textarea').nth(0).fill('Bu hafta ikisi de okumaya istekliydi.');
await page.locator('#view-parent textarea').nth(0).blur();
await page.waitForTimeout(250);
ok('Haftalik anne notu kaydediliyor',
  await page.evaluate((w) => window.EvdeEgitim.store.readWeek(w).weekNote.includes('okumaya istekliydi'), weekKeyNow));
await shot('04-parent');

/* ------------------------------------------------------- 11. rapor ekrani */
await page.click('.nav-btn[data-view=report]');
await page.waitForSelector('#view-report:not([hidden])');
ok('Rapor basligi dogru',
  await page.locator('.report-sheet .r-brand h1').textContent().then((t) => t.trim() === 'Haftalık Evde Eğitim Takip Raporu'));
ok('Rapor varsayilan olarak tum cocuklari iceriyor',
  await page.locator('.report-sheet .r-child').count().then((c) => c === 2));
const reportText = await page.locator('.report-sheet').textContent();
ok('Raporda hafta araligi, ses ve rapor tarihi var',
  reportText.includes('Haftanın sesi') && reportText.includes('Rapor tarihi'));
ok('Raporda cocuk adlari ve kendi sesleri var',
  reportText.includes('Elis') && reportText.includes('Lila') && reportText.includes('A a'));
ok('Raporda "/ 7 gun" ozetleri var', /\d\s*\/\s*7/.test(reportText));
ok('Raporda cocugun degerlendirmesi tasiniyor',
  reportText.includes('hikâye okumak') && reportText.includes('satırda yazmak'));
ok('Raporda ozbakim notu tasiniyor', reportText.includes('hatırlatmadan fırçaladı'));
ok('Raporda anne haftalik notu tasiniyor', reportText.includes('okumaya istekliydi'));
ok('Raporda bos ogretmen alani var',
  await page.locator('.report-sheet .r-teacher').count().then((c) => c === 2));

// tek cocuk secimi
await page.locator('#view-report .choice-chip:has-text("Elis")').click();
await page.waitForTimeout(300);
ok('Rapor tek cocuk icin filtrelenebiliyor',
  await page.locator('.report-sheet .r-child').count().then((c) => c === 1));
const oneText = await page.locator('.report-sheet').textContent();
ok('Tek cocuk raporunda digerinin verisi yok', !oneText.includes('Lila'));
await page.locator('#view-report .choice-chip:has-text("Tüm çocuklar")').click();
await page.waitForTimeout(250);
await shot('05-report');

// ogretmene kisa not
await page.locator('#view-report .card textarea').nth(0).fill('A sesinde ilerledik.');
await page.locator('#view-report .card textarea').nth(0).blur();
await page.waitForTimeout(250);
ok('Ogretmene kisa not cocuk bazinda kaydediliyor',
  await page.evaluate((w) => {
    const s = window.EvdeEgitim.store;
    const first = s.activeChildren()[0];
    return s.readChildWeek(w, first.id).reportNote === 'A sesinde ilerledik.';
  }, weekKeyNow));

/* --------------------------------------- 12. PDF/yazdirma HTML dogrulamasi */
const pdfCheck = await page.evaluate(async (w) => {
  const mod = await import('./js/views/report.js');
  const s = window.EvdeEgitim.store;
  const html = mod.standaloneReportHtml(w, s.activeChildren());
  return {
    len: html.length,
    isDoc: html.startsWith('<!doctype html>'),
    hasA4: html.includes('size: A4'),
    hasTurkish: html.includes('Haftalık') && html.includes('Özbakım') && html.includes('değerlendirmesi'),
    noNav: !html.includes('bottom-nav') && !html.includes('nav-btn') && !html.includes('<button'),
    pageBreak: html.includes('break-before: page'),
    charset: html.includes('charset="utf-8"'),
  };
}, weekKeyNow);
ok('Yazdirma/PDF belgesi bagimsiz A4 HTML', pdfCheck.isDoc && pdfCheck.hasA4 && pdfCheck.charset, JSON.stringify(pdfCheck));
ok('PDF ciktisinda navigasyon/buton yok', pdfCheck.noNav);
ok('PDF ciktisinda Turkce karakterler bozulmamis', pdfCheck.hasTurkish);
ok('Cok cocukta sayfa sonu tanimli', pdfCheck.pageBreak);

/* ----------------------------------------------------- 13. yedek al / yukle */
const backup = await page.evaluate(() => JSON.stringify(window.EvdeEgitim.store.exportBackup()));
const parsedBackup = JSON.parse(backup);
ok('JSON yedek disa aktarilabiliyor',
  parsedBackup.schemaVersion === 2
  && Object.keys(parsedBackup.data.children).length === 2
  && Object.keys(parsedBackup.data.weeks).length >= 2,
  `${Object.keys(parsedBackup.data.children).length} cocuk, ${Object.keys(parsedBackup.data.weeks).length} hafta`);
ok('Yedek profilleri + tum haftalari + ayarlari iceriyor',
  !!parsedBackup.data.childOrder && !!parsedBackup.data.settings && !!parsedBackup.data.activeChildId);

/* --------------------------------------------- 14. kalicilik (yeniden acilis) */
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])', { timeout: 8000 });
ok('Uygulama kapanip acilinca veriler korunuyor',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 2),
  `${await page.locator('#view-homework .task-card.done').count()} done`);
ok('Son secili cocuk hatirlaniyor',
  (await page.locator('#chipName').textContent()) === 'Elis',
  await page.locator('#chipName').textContent());
ok('Yeniden acilista bu hafta secili',
  await page.evaluate((w) => window.EvdeEgitim.ctx.weekKey === w, weekKeyNow));

/* ------------------------------------------- 15. isim degisimi veri kaybetmiyor */
await page.evaluate(() => {
  const s = window.EvdeEgitim.store;
  s.updateChild(s.activeChildren()[0].id, { name: 'Elisa' });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
ok('Cocuk adi degisince gecmis veriler kaybolmuyor (childId ile baglandi)',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 2)
  && (await page.locator('#chipName').textContent()) === 'Elisa',
  await page.locator('#chipName').textContent());
ok('Adi degisen cocukta iyelik eki dogru',
  (await page.locator('#pageTitle').textContent()) === "Elisa'nın Bu Haftası",
  await page.locator('#pageTitle').textContent());
await page.evaluate(() => {
  const s = window.EvdeEgitim.store;
  s.updateChild(s.activeChildren()[0].id, { name: 'Elis' });
});

/* ---------------------------------------------------- 16. arsivleme/silme */
await page.evaluate(() => {
  const s = window.EvdeEgitim.store;
  s.updateChild(s.activeChildren()[1].id, { archived: true });
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
ok('Profil arsivlenince aktif listeden cikiyor',
  await page.evaluate(() => window.EvdeEgitim.store.activeChildren().length === 1));
ok('Arsivlenen profil silinmemis (verisi duruyor)',
  await page.evaluate(() => window.EvdeEgitim.store.allChildren().length === 2));
await page.evaluate(() => {
  const s = window.EvdeEgitim.store;
  s.updateChild(s.allChildren()[1].id, { archived: false });
});

// silme: diger cocuga dokunmadigini dogrula
const before = await page.evaluate((w) => {
  const s = window.EvdeEgitim.store;
  const [a, b] = s.activeChildren();
  return { aId: a.id, bId: b.id, aDone: Object.keys(s.readChildWeek(w, a.id).done).length };
}, weekKeyNow);
await page.evaluate((id) => window.EvdeEgitim.store.deleteChild(id), before.bId);
const after = await page.evaluate((args) => {
  const s = window.EvdeEgitim.store;
  return {
    children: s.allChildren().length,
    aDone: Object.keys(s.readChildWeek(args.w, args.aId).done).length,
    bGone: !s.getChild(args.bId),
  };
}, { w: weekKeyNow, aId: before.aId, bId: before.bId });
ok('Profil silinince yalnizca o cocugun verisi gidiyor',
  after.children === 1 && after.bGone && after.aDone === before.aDone,
  JSON.stringify(after));

/* --------------------------------- 17. yedegi geri yukleme (replace + merge) */
await page.evaluate(async (b) => {
  await window.EvdeEgitim.store.importBackup(JSON.parse(b), 'replace');
}, backup);
await page.reload({ waitUntil: 'networkidle' });
await page.waitForSelector('#app:not([hidden])');
ok('JSON yedegi geri yuklenebiliyor (silinen cocuk geri geldi)',
  await page.evaluate(() => window.EvdeEgitim.store.allChildren().length === 2));
ok('Geri yuklenen veride isaretlemeler yerinde',
  await page.locator('#view-homework .task-card.done').count().then((c) => c === 2));

const mergeResult = await page.evaluate(async (b) => {
  const s = window.EvdeEgitim.store;
  const payload = JSON.parse(b);
  // Farkli childId'ler ile ayni adlari tasiyan bir yedek: cakisma guvenli cozulmeli
  const remapped = { ...payload, data: JSON.parse(JSON.stringify(payload.data)) };
  const map = {};
  for (const id of Object.keys(remapped.data.children)) map[id] = `child-imported-${id.slice(-6)}`;
  remapped.data.children = Object.fromEntries(Object.entries(remapped.data.children)
    .map(([id, c]) => [map[id], { ...c, id: map[id] }]));
  remapped.data.childOrder = remapped.data.childOrder.map((id) => map[id]);
  remapped.data.activeChildId = map[remapped.data.activeChildId];
  for (const week of Object.values(remapped.data.weeks)) {
    week.children = Object.fromEntries(Object.entries(week.children).map(([id, cw]) => [map[id], cw]));
  }
  await s.importBackup(remapped, 'merge');
  return { children: s.allChildren().length, names: s.allChildren().map((c) => c.name) };
}, backup);
ok('Birlestirmede ayni ad+sinif eslesiyor, cocuk cogaltilmiyor',
  mergeResult.children === 2, JSON.stringify(mergeResult));

/* ------------------------------------------ 18. v1 -> v2 migration testi */
const migContext = await browser.newContext({
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
  locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
});
const migrationPage = await migContext.newPage();
migrationPage.on('pageerror', (e) => errors.push(`migration pageerror: ${e.message}`));
await migrationPage.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
await migrationPage.evaluate(() => {
  localStorage.clear();
  // Eski tek dosyali surumun gercek kayit formati
  const w1 = {
    sound: 'A a',
    tasks: [{ id: 'sound' }, { id: 'custom_123', title: 'Eski özel görev', desc: 'test', icon: '🧩' }],
    done: { Elis: { 'sound:0': true, 'read:1': true }, Lila: { 'math:2': true } },
    reflection: { Elis: { fav: 'boyama', hard: 'kesme', stars: 5 }, Lila: { fav: '', hard: '', stars: 2 } },
    parentNote: 'Eski anne notu',
    careTasks: [],
    careDone: { Elis: { 'hands:0': true }, Lila: {} },
    careNote: { Elis: 'Eski özbakım notu', Lila: '' },
    reportNote: 'Eski rapor notu',
  };
  const w2 = { ...w1, sound: 'E e', done: { Elis: { 'write:3': true }, Lila: {} }, parentNote: '' };
  localStorage.setItem('odevTakip:v1:2026-09-07', JSON.stringify(w1));
  localStorage.setItem('odevTakip:v1:2026-09-14', JSON.stringify(w2));
});
await migrationPage.reload({ waitUntil: 'networkidle' });
await migrationPage.waitForSelector('#app:not([hidden])', { timeout: 8000 });
const mig = await migrationPage.evaluate(() => {
  const s = window.EvdeEgitim.store;
  const st = s.getState();
  const byName = {};
  for (const c of s.allChildren()) byName[c.name] = c.id;
  return {
    schemaVersion: st.schemaVersion,
    migratedFrom: st.migratedFrom,
    names: Object.keys(byName),
    weeks: Object.keys(st.weeks).sort(),
    elisDone: s.readChildWeek('2026-09-07', byName.Elis).done,
    lilaDone: s.readChildWeek('2026-09-07', byName.Lila).done,
    elisRefl: s.readChildWeek('2026-09-07', byName.Elis).reflection,
    weekNote: s.readWeek('2026-09-07').weekNote,
    careNote: s.readChildWeek('2026-09-07', byName.Elis).careNote,
    sound1: s.getOwnSound('2026-09-07', byName.Elis),
    sound2: s.getOwnSound('2026-09-14', byName.Elis),
    custom: s.readChildWeek('2026-09-07', byName.Elis).customHomeworkTasks.map((t) => t.title),
  };
});
ok('Migration: Elis ve Lila otomatik iki profile donusuyor',
  mig.names.includes('Elis') && mig.names.includes('Lila') && mig.names.length === 2, JSON.stringify(mig.names));
ok('Migration: schemaVersion 2 ve tek seferlik isaret',
  mig.schemaVersion === 2 && mig.migratedFrom === 'odevTakip:v1');
ok('Migration: iki eski hafta tasindi',
  mig.weeks.includes('2026-09-07') && mig.weeks.includes('2026-09-14'), JSON.stringify(mig.weeks));
ok('Migration: isaretlemeler dogru cocuga gitti',
  mig.elisDone['sound:0'] === true && mig.elisDone['read:1'] === true
  && mig.lilaDone['math:2'] === true && !mig.lilaDone['sound:0'], JSON.stringify({ e: mig.elisDone, l: mig.lilaDone }));
ok('Migration: degerlendirme, notlar ve ozel gorev korundu',
  mig.elisRefl.stars === 5 && mig.elisRefl.fav === 'boyama'
  && mig.weekNote === 'Eski anne notu' && mig.careNote === 'Eski özbakım notu'
  && mig.custom.includes('Eski özel görev'), JSON.stringify(mig.elisRefl));
ok('Migration: her haftanin sesi kendi haftasinda kaldi',
  mig.sound1 === 'A a' && mig.sound2 === 'E e', `${mig.sound1} / ${mig.sound2}`);

// tekrar acilista migration TEKRARLANMAMALI
await migrationPage.reload({ waitUntil: 'networkidle' });
await migrationPage.waitForSelector('#app:not([hidden])');
const mig2 = await migrationPage.evaluate(() => {
  const s = window.EvdeEgitim.store;
  return { children: s.allChildren().length, weeks: Object.keys(s.getState().weeks).length };
});
ok('Migration bir kez calisiyor, veriyi cogaltmiyor',
  mig2.children === 2 && mig2.weeks === 2, JSON.stringify(mig2));
await migrationPage.close();
await migContext.close();

/* ------------------- 18b. eski HTML surumunden disa aktarilan dokumu alma --- */
// Telefona yeni kurulan uygulamada tarayicinin localStorage'i bulunmadigindan
// otomatik migration calismaz; eski dosyadan alinan dokum bu yolla aktarilir.
const legacyCtx = await browser.newContext({
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true,
  locale: 'tr-TR', timezoneId: 'Europe/Istanbul',
});
const legacyPage = await legacyCtx.newPage();
legacyPage.on('pageerror', (e) => errors.push(`legacy pageerror: ${e.message}`));
await legacyPage.goto(BASE, { waitUntil: 'networkidle' });
await legacyPage.waitForSelector('#onboarding:not([hidden])');
await legacyPage.fill('#onboarding input[type=text]', 'Deniz');
await legacyPage.click('#onboarding button[type=submit]');
await legacyPage.waitForSelector('#app:not([hidden])');

const legacyImport = await legacyPage.evaluate(async () => {
  const s = window.EvdeEgitim.store;
  const dump = {
    app: 'Evde Eğitim Takip',
    legacyVersion: 1,
    exportedAt: new Date().toISOString(),
    legacyWeeks: {
      '2026-08-31': {
        sound: 'A a',
        done: { Elis: { 'read:0': true, 'math:1': true }, Lila: { 'write:2': true } },
        careDone: { Elis: { 'teeth_am:0': true }, Lila: {} },
        reflection: { Elis: { fav: 'boyama', hard: 'kesme', stars: 3 }, Lila: { fav: '', hard: '', stars: 0 } },
        careNote: { Elis: 'Eski not', Lila: '' },
        parentNote: 'Eski anne notu',
        reportNote: '',
      },
    },
  };
  const before = s.allChildren().length;
  const res = await s.importLegacyDump(dump);
  return {
    detected: s.isLegacyDump(dump),
    before,
    after: s.allChildren().length,
    names: s.allChildren().map((c) => c.name),
    weeks: res.weeks,
    elisDone: (() => {
      const elis = s.allChildren().find((c) => c.name === 'Elis');
      return elis ? s.readChildWeek('2026-08-31', elis.id).done : null;
    })(),
    denizUntouched: (() => {
      const deniz = s.allChildren().find((c) => c.name === 'Deniz');
      return deniz ? Object.keys(s.readChildWeek('2026-08-31', deniz.id).done).length === 0 : false;
    })(),
  };
});
ok('Eski surum dokumu taninip aktariliyor',
  legacyImport.detected && legacyImport.weeks === 1, JSON.stringify({ d: legacyImport.detected, w: legacyImport.weeks }));
ok('Dokumdaki cocuklar mevcut profillerin yanina ekleniyor',
  legacyImport.before === 1 && legacyImport.after === 3
  && legacyImport.names.includes('Elis') && legacyImport.names.includes('Lila')
  && legacyImport.names.includes('Deniz'), JSON.stringify(legacyImport.names));
ok('Dokumdaki isaretlemeler dogru cocuga gidiyor',
  legacyImport.elisDone?.['read:0'] === true && legacyImport.elisDone?.['math:1'] === true
  && !legacyImport.elisDone?.['write:2'], JSON.stringify(legacyImport.elisDone));
ok('Mevcut profilin verisine dokunulmuyor', legacyImport.denizUntouched);

await legacyPage.reload({ waitUntil: 'networkidle' });
await legacyPage.waitForSelector('#app:not([hidden])');
ok('Aktarilan eski kayitlar yeniden acilista duruyor',
  await legacyPage.evaluate(() => {
    const s = window.EvdeEgitim.store;
    return s.allChildren().length === 3 && !!s.getState().weeks['2026-08-31'];
  }));
await legacyPage.close();
await legacyCtx.close();

/* ------------------------------------------------ 19. layout / responsive */
const overflow = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth,
  win: window.innerWidth,
}));
ok('Telefon genisliginde yatay kaydirma yok',
  overflow.doc <= overflow.win + 1, JSON.stringify(overflow));

await page.click('.nav-btn[data-view=parent]');
await page.waitForTimeout(300);
const overflow2 = await page.evaluate(() => ({
  doc: document.documentElement.scrollWidth, win: window.innerWidth,
}));
ok('Anne tablosu sayfayi tasirmiyor (tablo kendi icinde kayiyor)',
  overflow2.doc <= overflow2.win + 1, JSON.stringify(overflow2));

const navBox = await page.locator('.bottom-nav').boundingBox();
ok('Alt navigasyon 4 bolumlu ve ekranin altinda sabit',
  await page.locator('.nav-btn').count().then((c) => c === 4) && navBox.height >= 56,
  `yukseklik=${Math.round(navBox.height)}`);

const touchSizes = await page.evaluate(() => {
  const sizes = [...document.querySelectorAll('.check-btn, .mini-check, .nav-btn, .day, .btn, .child-tab')]
    .filter((n) => n.offsetParent !== null || n.getClientRects().length)   // gorunur olanlar
    .map((n) => { const r = n.getBoundingClientRect(); return Math.min(r.width, r.height); })
    .filter((v) => v > 0);
  return { min: Math.round(Math.min(...sizes)), count: sizes.length };
});
ok('Dokunma alanlari yeterince buyuk (>=28px)', touchSizes.min >= 28, JSON.stringify(touchSizes));

// tablet genisligi
await page.setViewportSize({ width: 820, height: 1180 });
await page.waitForTimeout(250);
const tabletOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
ok('Buyuk ekranda layout bozulmuyor', tabletOverflow);
await shot('06-tablet-parent');
await page.setViewportSize({ width: 412, height: 915 });

/* ---------------------------------------------------- 20. konsol hatalari */
ok('Calisma sirasinda JS hatasi yok', errors.length === 0, errors.slice(0, 4).join(' | '));

await shot('07-final');
await browser.close();
server.close();

process.exit(finish() ? 1 : 0);
