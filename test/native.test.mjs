// Native köprü simülasyonu: Capacitor eklentilerinin gerçekten bağlandığını
// ve yazdırma / PDF / paylaşım çağrılarının native tarafa gittiğini doğrular.
//   npm test
import { chromium } from 'playwright';
import { startServer, chromiumPath, makeReporter } from './server.mjs';

const { server, base: BASE } = await startServer();

const { ok, finish } = makeReporter('Native köprü testleri');

const browser = await chromium.launch({ executablePath: chromiumPath() });
const ctx = await browser.newContext({ viewport: { width: 412, height: 915 }, isMobile: true, hasTouch: true, locale: 'tr-TR' });

// native-bridge.js'in enjekte ettigi nesnenin sadelestirilmis taklidi
// native-bridge.js + JSExport.getPluginJS ciktisinin sadelestirilmis taklidi.
// Platform tespiti window.androidBridge varligina, eklenti yonlendirmesi
// Capacitor.PluginHeaders listesine dayanir — gercek cihazdaki gibi.
await ctx.addInitScript(() => {
  const calls = [];
  const store = new Map();
  window.__nativeCalls = calls;

  // Android WebView'in @JavascriptInterface nesnesi: platform tespiti bunu arar.
  window.androidBridge = { postMessage: () => {} };

  const cap = {
    Plugins: {},
    PluginHeaders: [
      { name: 'Preferences', methods: [
        { name: 'get', rtype: 'promise' }, { name: 'set', rtype: 'promise' },
        { name: 'remove', rtype: 'promise' }, { name: 'clear', rtype: 'promise' },
      ] },
      { name: 'App', methods: [
        { name: 'exitApp', rtype: 'promise' }, { name: 'getInfo', rtype: 'promise' },
        { name: 'addListener', rtype: 'promise' }, { name: 'removeListener', rtype: 'promise' },
      ] },
      { name: 'ReportBridge', methods: [
        { name: 'printHtml', rtype: 'promise' },
        { name: 'sharePdf', rtype: 'promise' },
        { name: 'shareFile', rtype: 'promise' },
      ] },
    ],
    addListener: (pluginName, eventName) => {
      calls.push({ pluginName, methodName: `addListener:${eventName}` });
      return Promise.resolve({ remove: () => {} });
    },
    nativePromise: (pluginName, methodName, options) => {
      calls.push({ pluginName, methodName, options });
      if (pluginName === 'Preferences') {
        if (methodName === 'set') { store.set(options.key, options.value); return Promise.resolve(); }
        if (methodName === 'get') { return Promise.resolve({ value: store.get(options.key) ?? null }); }
      }
      return Promise.resolve({ path: `/data/cache/reports/${options?.fileName || 'x'}` });
    },
    nativeCallback: (pluginName, methodName, options) => {
      calls.push({ pluginName, methodName, options });
      return 'cb-1';
    },
  };
  cap.toNative = cap.nativePromise;
  window.Capacitor = cap;

  // JSExport.getPluginJS: Plugins[<ad>] nesnelerini de dogrudan enjekte eder.
  for (const header of cap.PluginHeaders) {
    const target = (cap.Plugins[header.name] = {});
    target.addListener = (eventName, cb) => cap.addListener(header.name, eventName, cb);
    for (const m of header.methods) {
      target[m.name] = (options) => cap.nativePromise(header.name, m.name, options);
    }
  }
});

const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(BASE, { waitUntil: 'networkidle' });

ok('Capacitor core global derlemesi yuklendi',
  await page.evaluate(() => typeof window.capacitorExports?.registerPlugin === 'function'));

const registered = await page.evaluate(async () => {
  const m = await import('./js/plugins.js');
  return {
    isNative: m.isNativePlatform(),
    report: !!m.nativePlugin('ReportBridge'),
    prefs: !!m.nativePlugin('Preferences'),
    app: !!m.nativePlugin('App'),
  };
});
ok('Native platform algilaniyor', registered.isNative);
ok('ReportBridge eklentisi kayitli ve erisilebilir', registered.report, JSON.stringify(registered));
ok('Preferences eklentisi kayitli', registered.prefs);
ok('App eklentisi kayitli', registered.app);

const diag = await page.evaluate(async () => (await import('./js/plugins.js')).pluginDiagnostics());
ok('Eklentiler native enjeksiyon yoluyla baglandi',
  Object.values(diag).every((v) => v === 'native'), JSON.stringify(diag));

// onboarding: profil olustur
await page.waitForSelector('#onboarding:not([hidden])');
await page.fill('#onboarding input[type=text]', 'Elis');
await page.click('#onboarding button[type=submit]');
await page.waitForSelector('#app:not([hidden])');
await page.waitForTimeout(600);

const prefCalls = await page.evaluate(() => window.__nativeCalls.filter((c) => c.pluginName === 'Preferences'));
ok('Veriler Capacitor Preferences ile native tarafa yaziliyor',
  prefCalls.some((c) => c.methodName === 'set' && c.options?.key === 'evdeEgitimTakip:data'),
  `${prefCalls.length} Preferences cagrisi`);

// isaretleme yap, rapora git, PDF gonder
await page.locator('#view-homework .task-card').nth(0).locator('.check-btn').click();
await page.waitForTimeout(200);
await page.click('.nav-btn[data-view=report]');
await page.waitForSelector('#view-report:not([hidden])');
await page.click('#view-report button:has-text("Öğretmene Gönder")');
await page.waitForTimeout(700);

const pdfCall = await page.evaluate(() => window.__nativeCalls.find((c) => c.methodName === 'sharePdf'));
ok('“Öğretmene Gönder” ReportBridge.sharePdf çağırıyor', !!pdfCall,
  pdfCall ? `dosya=${pdfCall.options.fileName}` : 'cagri yok');
if (pdfCall) {
  ok('PDF dosya adi beklenen bicimde', /^Elis_Evde_Egitim_Raporu_\d{4}-\d{2}-\d{2}\.pdf$/.test(pdfCall.options.fileName),
    pdfCall.options.fileName);
  ok('sharePdf bagimsiz A4 HTML belgesi aliyor',
    pdfCall.options.html.startsWith('<!doctype html>') && pdfCall.options.html.includes('size: A4')
    && !pdfCall.options.html.includes('bottom-nav'));
  ok('Rapor HTML Turkce karakterleri koruyor', pdfCall.options.html.includes('Özbakım özeti'));
}

// yazdir
await page.click('#view-report button:has-text("Yazdır")');
await page.waitForTimeout(500);
const printCall = await page.evaluate(() => window.__nativeCalls.find((c) => c.methodName === 'printHtml'));
ok('“Yazdır” ReportBridge.printHtml çağırıyor', !!printCall,
  printCall ? `is=${printCall.options.jobName}` : 'cagri yok');

// yedek disa aktarma -> shareFile
await page.click('#openSettings');
await page.waitForSelector('.modal-overlay.show');
await page.click('.modal-sheet button:has-text("Yedeği Dışa Aktar")');
await page.waitForTimeout(700);
const shareCall = await page.evaluate(() => window.__nativeCalls.find((c) => c.methodName === 'shareFile'));
ok('Yedek dışa aktarma ReportBridge.shareFile çağırıyor', !!shareCall,
  shareCall ? `dosya=${shareCall.options.fileName}` : 'cagri yok');
if (shareCall) {
  const parsed = JSON.parse(shareCall.options.content);
  ok('Yedek icerigi gecerli JSON ve sema surumu dogru', parsed.schemaVersion === 2 && !!parsed.data.children);
  ok('Yedek dosya adi .json uzantili', /\.json$/.test(shareCall.options.fileName), shareCall.options.fileName);
}

// geri tusu dinleyicisi
const listeners = await page.evaluate(() => window.__nativeCalls.filter((c) => String(c.methodName).startsWith('addListener')));
ok('App yasam dongusu dinleyicileri kaydediliyor', listeners.length >= 1,
  listeners.map((l) => `${l.pluginName}.${l.methodName}`).join(', '));

ok('Native simulasyonunda JS hatasi yok', errors.length === 0, errors.slice(0, 3).join(' | '));

await browser.close();
server.close();
process.exit(finish() ? 1 : 0);
