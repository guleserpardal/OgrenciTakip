// Eski tek dosyalık HTML sürümüne eklenen dışa aktarma düğmesini ve
// çıkan dökümün uygulamada geri yüklenebilirliğini doğrular.

import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer, chromiumPath, makeReporter, WWW } from './server.mjs';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const legacy = await startServer(join(ROOT, 'legacy'));
const app = await startServer(WWW);

const { ok, finish } = makeReporter('Eski sürüm taşıma testleri');
const browser = await chromium.launch({ executablePath: chromiumPath() });
const errors = [];

/* ----------------------------------- eski surumde kayit olustur ve aktar --- */

const legacyCtx = await browser.newContext({ locale: 'tr-TR', acceptDownloads: true });
const legacyPage = await legacyCtx.newPage();
legacyPage.on('pageerror', (e) => errors.push(`legacy: ${e.message}`));
legacyPage.on('dialog', (d) => d.accept());
await legacyPage.goto(`${legacy.base}/odev_takip_tek_dosya.html`, { waitUntil: 'load' });

// Elis ve Lila icin ayri isaretlemeler
await legacyPage.locator('#taskList .check-btn').nth(0).click();
await legacyPage.locator('#childTab .child-btn[data-child="Lila"]').click();
await legacyPage.locator('#taskList .check-btn').nth(2).click();
await legacyPage.waitForTimeout(150);

await legacyPage.click('.tab[data-tab="report"]');
ok('Eski sürümde dışa aktarma düğmesi var',
  await legacyPage.locator('#exportLegacy').isVisible());

const downloadPromise = legacyPage.waitForEvent('download', { timeout: 10000 });
await legacyPage.click('#exportLegacy');
const download = await downloadPromise;
const stream = await download.createReadStream();
let raw = '';
for await (const chunk of stream) raw += chunk;
const dump = JSON.parse(raw);

ok('Dosya adı tanınabilir', /^EvdeEgitimTakip_EskiKayitlar_\d{4}-\d{2}-\d{2}\.json$/.test(download.suggestedFilename()),
  download.suggestedFilename());
ok('Döküm v1 olarak işaretli ve hafta içeriyor',
  dump.legacyVersion === 1 && Object.keys(dump.legacyWeeks).length >= 1,
  `${Object.keys(dump.legacyWeeks).length} hafta`);

const firstWeek = Object.values(dump.legacyWeeks)[0];
ok('Dökümde her çocuğun kendi işaretlemesi var',
  !!firstWeek.done?.Elis && !!firstWeek.done?.Lila
  && Object.keys(firstWeek.done.Elis).length === 1
  && Object.keys(firstWeek.done.Lila).length === 1,
  JSON.stringify(firstWeek.done));
await legacyCtx.close();

/* -------------------------------------- dokumu uygulamada geri yukle --- */

const appCtx = await browser.newContext({
  viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'tr-TR',
});
const appPage = await appCtx.newPage();
appPage.on('pageerror', (e) => errors.push(`app: ${e.message}`));
await appPage.goto(app.base, { waitUntil: 'networkidle' });
await appPage.waitForSelector('#onboarding:not([hidden])');

// Onboarding ekranindaki "Yedegi Geri Yukle" ile, tek satir yapistirarak
await appPage.fill('#onboarding input[type=text]', 'Deniz');
await appPage.click('#onboarding button[type=submit]');
await appPage.waitForSelector('#app:not([hidden])');

const imported = await appPage.evaluate(async (payload) => {
  const s = window.EvdeEgitim.store;
  const res = await s.importLegacyDump(payload);
  return { weeks: res.weeks, names: s.allChildren().map((c) => c.name) };
}, dump);

ok('Döküm uygulamada geri yüklenebiliyor', imported.weeks >= 1);
ok('Elis ve Lila profil olarak oluşuyor, mevcut profil korunuyor',
  imported.names.includes('Elis') && imported.names.includes('Lila')
  && imported.names.includes('Deniz') && imported.names.length === 3,
  JSON.stringify(imported.names));

await appPage.reload({ waitUntil: 'networkidle' });
await appPage.waitForSelector('#app:not([hidden])');
ok('Geri yüklenen kayıtlar yeniden açılışta duruyor',
  await appPage.evaluate(() => window.EvdeEgitim.store.allChildren().length === 3));

ok('Akış boyunca JS hatası yok', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
legacy.server.close();
app.server.close();
process.exit(finish() ? 1 : 0);
