// Capacitor eklentilerine erisim.
//
// Android'de eklentiler sayfaya iki ayri yoldan baglanir:
//   1. Native kopru `window.Capacitor.Plugins.<Ad>` nesnelerini dogrudan
//      enjekte eder (JSExport.getPluginJS) — metodlar ve addListener dahil.
//   2. @capacitor/core'un `registerPlugin` fonksiyonu, kopru tarafindan
//      saglanan `Capacitor.PluginHeaders` listesine gore ayni cagrilari
//      proxy'ler.
//
// Enjekte edilen nesneler ONCE anlik goruntuye alinir, cunku `registerPlugin`
// cagrildiginda `Capacitor.Plugins` icindeki girdileri kendi proxy'siyle
// degistirir. Iki yol da tutulur; biri eksik kalirsa digeri devreye girer.
// Kayit hic olmazsa yazdirma / PDF / paylasim sessizce calismaz, bu yuzden
// erisim tek noktadan ve savunmaci yapilir.

const PLUGIN_NAMES = ['Preferences', 'App', 'ReportBridge'];

// 1. adim: native enjeksiyonu yakala (registerPlugin'den ONCE).
const injected = {};
for (const name of PLUGIN_NAMES) {
  const candidate = globalThis.Capacitor?.Plugins?.[name];
  if (candidate) injected[name] = candidate;
}

// 2. adim: core proxy'lerini yedek olarak hazirla.
const proxies = {};
const registerPlugin = globalThis.capacitorExports?.registerPlugin;
if (registerPlugin) {
  for (const name of PLUGIN_NAMES) {
    try {
      proxies[name] = registerPlugin(name);
    } catch (e) {
      console.warn(`${name} eklentisi kaydedilemedi`, e);
    }
  }
}

/** Uygulama gercekten Android/iOS uzerinde mi calisiyor? */
export function isNativePlatform() {
  return globalThis.Capacitor?.isNativePlatform?.() === true;
}

/**
 * Yalnizca native platformda eklentiyi dondurur; tarayicida null doner,
 * boylece cagiran taraf web yedegine duser.
 */
export function nativePlugin(name) {
  if (!isNativePlatform()) return null;
  return injected[name] || proxies[name] || globalThis.Capacitor?.Plugins?.[name] || null;
}

/** Tani amacli: hangi eklentinin hangi yoldan baglandigini gosterir. */
export function pluginDiagnostics() {
  return Object.fromEntries(PLUGIN_NAMES.map((name) => [
    name,
    injected[name] ? 'native' : proxies[name] ? 'proxy' : 'yok',
  ]));
}
