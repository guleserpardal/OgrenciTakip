// Android tarafindaki ReportBridge eklentisine kopru.
// Tarayicida calisirken makul yedek davranislar devreye girer
// (window.print / dosya indirme), boylece ayni kod her yerde test edilebilir.

function plugin() {
  return globalThis.Capacitor?.Plugins?.ReportBridge || null;
}

export function isNative() {
  return !!globalThis.Capacitor?.isNativePlatform?.() && !!plugin();
}

/** Bagimsiz bir HTML belgesini Android sistem yazdirma ekraninda acar. */
export async function printHtml(html, jobName = 'Evde Egitim Raporu') {
  const p = plugin();
  if (p) {
    await p.printHtml({ html, jobName });
    return { via: 'native' };
  }
  printHtmlInIframe(html);
  return { via: 'web' };
}

/**
 * Raporu A4 PDF'e cevirip Android paylasim menusunu acar.
 * Native PDF uretimi herhangi bir sebeple basarisiz olursa sessizce sistem
 * yazdirma ekranina duser; kullanici oradan "PDF olarak kaydet" secebilir.
 */
export async function sharePdf(html, fileName, { subject = '', title = '' } = {}) {
  const p = plugin();
  if (p) {
    try {
      const res = await p.sharePdf({ html, fileName, subject, title });
      return { via: 'native', ...res };
    } catch (e) {
      console.warn('Native PDF uretimi basarisiz, yazdirma ekranina dusuluyor', e);
      await p.printHtml({ html, jobName: fileName.replace(/\.pdf$/i, '') });
      return { via: 'native-print-fallback', reason: e?.message || String(e) };
    }
  }
  // Tarayicida: yazdirma diyalogundan "PDF olarak kaydet" kullanilir.
  printHtmlInIframe(html);
  return { via: 'web' };
}

/** Metin dosyasini (JSON yedek) paylasir; tarayicida indirir. */
export async function shareTextFile(fileName, content, mime = 'application/json', subject = '') {
  const p = plugin();
  if (p) {
    const res = await p.shareFile({ fileName, content, mime, subject });
    return { via: 'native', ...res };
  }
  const blob = new Blob([content], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return { via: 'web' };
}

/** Tarayici yedegi: gizli iframe icinde yazdirma. Uygulama arayuzu ciktiya girmez. */
function printHtmlInIframe(html) {
  const old = document.getElementById('printFrame');
  if (old) old.remove();
  const frame = document.createElement('iframe');
  frame.id = 'printFrame';
  frame.setAttribute('aria-hidden', 'true');
  frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;';
  document.body.append(frame);
  const doc = frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  const go = () => {
    try {
      frame.contentWindow.focus();
      frame.contentWindow.print();
    } catch (e) {
      console.warn('Yazdirma acilamadi', e);
    }
  };
  if (doc.readyState === 'complete') setTimeout(go, 120);
  else frame.onload = () => setTimeout(go, 120);
}

/** Android durum cubugu / gesture alani icin guvenli alan degerlerini hazirlar. */
export async function setupSafeArea() {
  const sb = globalThis.Capacitor?.Plugins?.StatusBar;
  if (!sb) return;
  try {
    await sb.setOverlaysWebView({ overlay: false });
  } catch { /* eklenti yoksa sorun degil */ }
}
