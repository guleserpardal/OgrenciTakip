# Evde Eğitim Takip

Haftalık **ödev + özbakım + veli takibi + öğretmen raporu** uygulaması.
Tek dosyalık `odev_takip_tek_dosya.html` sürümünden, Android telefona
kurulabilen bir **Capacitor** uygulamasına dönüştürülmüştür.

* Tamamen **çevrimdışı** çalışır — internet, hesap veya CDN bağımlılığı yoktur.
* Çocuk profilleri **dinamiktir**; kod içinde sabit isim yoktur.
* Her hafta ve her çocuk için veriler birbirinden bağımsız saklanır.
* Rapor, Android'in kendi yazdırma motoruyla **vektörel A4 PDF**'e çevrilir;
  Türkçe karakterler bozulmaz.

---

## 1. Kurulum ve derleme

```bash
npm install
npm run build
npx cap sync android
npx cap open android      # Android Studio ile açar
```

Komut satırından APK üretmek için:

```bash
cd android
./gradlew assembleDebug            # Windows: gradlew.bat assembleDebug
```

Çıkan dosya:

```
android/app/build/outputs/apk/debug/app-debug.apk
```

Release sürümü:

```bash
cd android
./gradlew assembleRelease          # Windows: gradlew.bat assembleRelease
```

```
android/app/build/outputs/apk/release/app-release.apk           # imzalıysa
android/app/build/outputs/apk/release/app-release-unsigned.apk  # imza yoksa
```

Kısayollar:

```bash
npm run sync          # build + cap sync
npm run apk:debug     # build + sync + assembleDebug
npm run apk:release   # build + sync + assembleRelease
```

### Gereksinimler

| Araç | Sürüm |
|---|---|
| Node.js | 20+ (22 önerilir) |
| JDK | 21 |
| Android SDK | Platform 36, Build-Tools 36 |
| Gradle | 8.14.3 (wrapper ile gelir) |
| Android Gradle Plugin | 8.13.0 |

`minSdk 26` (Android 8.0) · `targetSdk 36` · `applicationId com.guleser.evdeegitimtakip`

---

## 2. APK'yı bilgisayarsız almak (GitHub Actions)

Depoda `.github/workflows/android.yml` hazır. Android SDK'sı kurulu bir makineniz
yoksa APK'yı GitHub üretir:

1. Depoda **Actions → Android APK → Run workflow**
2. Derleme bitince APK iki yerde olur:
   * **Artifacts** altında `EvdeEgitimTakip-apk`
   * **Releases → `apk-latest`** altında doğrudan indirilebilir `.apk`
     (telefonun tarayıcısından indirip kurabilirsiniz)

Telefona kurarken Android "bilinmeyen kaynak" onayı isteyebilir.

### Release APK'yı imzalamak

İmzalı release için depo ayarlarına şu **secret**'ları ekleyin:

| Secret | Açıklama |
|---|---|
| `ANDROID_KEYSTORE_BASE64` | `base64 -w0 release.jks` çıktısı |
| `ANDROID_KEYSTORE_PASSWORD` | keystore parolası |
| `ANDROID_KEY_ALIAS` | anahtar adı |
| `ANDROID_KEY_PASSWORD` | anahtar parolası |

Yerelde imzalamak için `android/keystore.properties` oluşturun (bu dosya
`.gitignore` içindedir, depoya girmez):

```properties
storeFile=../release.jks
storePassword=...
keyAlias=...
keyPassword=...
```

Anahtar üretmek için:

```bash
keytool -genkeypair -v -keystore release.jks -keyalg RSA -keysize 2048 \
        -validity 10000 -alias evdeegitim
```

---

## 3. Proje yapısı

```
www/                      Uygulamanın tamamı (Capacitor bunu paketler)
  index.html
  css/app.css
  js/
    constants.js          Varsayılan görevler, günler, temalar, avatarlar
    util.js               DOM, tarih, toast, modal, konfeti
    store.js              Veri modeli, kalıcı saklama, v1 → v2 migration
    native.js             Android köprüsü + tarayıcı yedeği
    app.js                Başlatma, hafta/gün durumu, yönlendirme
    views/
      children.js         Profil ekle/düzenle/arşivle/sil, onboarding
      tracker.js          Ödev ve özbakımın ortak parçaları
      homework.js         Ödev ekranı
      care.js             Özbakım ekranı
      parent.js           Anne takibi
      report.js           Öğretmen raporu + A4 PDF/yazdırma
      settings.js         Yedekleme, geri yükleme, hafta seçici
    plugins.js          Capacitor eklenti kayıtları
  js/vendor/capacitor.js  @capacitor/core (build sırasında kopyalanır)
android/                  Android Studio ile açılabilen Capacitor projesi
  app/src/main/java/com/guleser/evdeegitimtakip/
    MainActivity.java
    ReportBridge.java     Yazdırma / PDF / paylaşım eklentisi
  app/src/main/java/android/print/
    PdfPrint.java         WebView → A4 PDF yazıcısı
scripts/build.mjs         Sözdizimi + "CDN yok" doğrulaması
test/
  server.mjs              Testler için statik sunucu
  app.test.mjs            Uçtan uca kabul testleri
  native.test.mjs         Native köprü / eklenti testleri
```

`npm run build` bir bundler çalıştırmaz; `www/` doğrudan paketlenir. Bunun yerine
her JS dosyasını sözdizimi kontrolünden geçirir ve **dış kaynak (CDN) referansı
olmadığını** doğrular. Bir `http(s)://` referansı eklenirse derleme durur.

---

## 4. Veri modeli

Tüm kayıtlar tek bir JSON belgesinde, Capacitor Preferences ile (yedek olarak
`localStorage`) saklanır. Kayıtlar **isimle değil, değişmeyen `childId` ile**
ilişkilendirilir; bu yüzden çocuğun adı değişince geçmiş veriler kaybolmaz.

```json
{
  "schemaVersion": 2,
  "activeChildId": "child-…",
  "childOrder": ["child-…"],
  "children": {
    "child-…": {
      "id": "child-…", "name": "Elis", "grade": "1. sınıf",
      "avatar": "🌸", "photo": "", "theme": "pink",
      "note": "", "archived": false, "createdAt": "…"
    }
  },
  "weeks": {
    "2026-09-21": {
      "weekNote": "Haftalık anne notu",
      "children": {
        "child-…": {
          "sound": "A a",
          "done":     { "read:0": true },
          "careDone": { "hands:0": true },
          "reflection": { "fav": "", "hard": "", "stars": 0 },
          "parentNote": "", "careNote": "", "reportNote": "",
          "customHomeworkTasks": [], "customCareTasks": [],
          "hiddenHomeworkTaskIds": [], "hiddenCareTaskIds": []
        }
      }
    }
  },
  "settings": {}
}
```

`done` / `careDone` anahtarları `"<görevId>:<günIndeksi>"` biçimindedir
(gün indeksi 0 = Pazartesi).

### Eski sürümden taşıma

İlk açılışta `odevTakip:v1:<haftaBaşı>` anahtarları taranır. Bulunan çocuk
adları (ör. Elis, Lila) **veriden keşfedilerek** ayrı profillere dönüştürülür,
tüm haftalar, işaretlemeler, değerlendirmeler ve notlar taşınır. İşlem
`migratedFrom` ile işaretlenir ve **bir daha çalışmaz**; veri çoğalmaz.

---

## 5. Öne çıkan davranışlar

**Haftanın sesi** çocuk ve hafta bazındadır. Yeni bir haftada değer boşsa en son
girilen ses *öneri olarak* gösterilir; geçmiş haftaların kaydı asla değiştirilmez.

**Özel görevler** yalnızca eklendikleri çocuk ve hafta için geçerlidir.
Varsayılan bir görev "silinirse" veri kaybı olmasın diye sadece o çocuk-hafta
için gizlenir ve tek dokunuşla geri getirilebilir.

**PDF / yazdırma** rapor HTML'i bağımsız bir A4 belgesi olarak üretilir; uygulama
navigasyonu ve düğmeleri çıktıya girmez. `📤 Öğretmene Gönder` PDF'i üretip
Android paylaşım menüsünü (WhatsApp, Gmail…) açar; `🖨️ Yazdır` sistem yazdırma
ekranını açar. Native PDF üretimi başarısız olursa uygulama sessizce yazdırma
ekranına düşer.

Dosya adı: `Elis_Evde_Egitim_Raporu_2026-09-21.pdf`, birden fazla çocuk
seçilmişse `Evde_Egitim_Raporu_2026-09-21.pdf`.

**Yedekleme** ⚙️ Ayarlar altındadır. Dışa aktarılan JSON bütün profilleri, tüm
haftaları ve ayarları içerir. Geri yüklemede *üzerine yaz* ve *birleştir*
seçenekleri vardır; üzerine yazmadan önce onay istenir ve önce yedek alma
seçeneği sunulur.

---

## 6. Testler

```bash
npm run verify     # sözdizimi + "CDN yok" kontrolü
npm test           # Chromium'da uçtan uca testler
```

İlk çalıştırmadan önce tarayıcı gerekir:

```bash
npx playwright install chromium
```

Sistemde hazır bir Chromium varsa `CHROMIUM_PATH` ile gösterebilirsiniz.

İki takım test vardır ve her ikisi de CI'da APK derlemesinden **önce** çalışır:

**`test/app.test.mjs` — 76 senaryo** (412×915 ekran, Galaxy S24 Ultra sınıfı):
profil ekleme / düzenleme / arşivleme / silme, çocuklar arası veri izolasyonu,
hafta gezinme, haftanın sesi devralma kuralı, yüzde hesapları, özel görevler,
rapor içeriği ve filtreleme, A4 PDF belgesinin yapısı, JSON yedek al / geri
yükle / birleştir, v1 → v2 migration, yeniden açılışta kalıcılık, çocuğun adı
değişince veri kaybı olmaması ve yatay taşma kontrolü.

**`test/native.test.mjs` — 17 senaryo**: native köprü taklit edilerek
eklentilerin gerçekten bağlandığı ve `📤 Öğretmene Gönder`, `🖨️ Yazdır`,
yedek dışa aktarma ile kalıcı saklamanın native tarafa doğru içerikle gittiği
doğrulanır.

> Android tarafındaki `ReportBridge` / `PdfPrint` sınıfları CI'daki gerçek
> Gradle derlemesiyle doğrulanır.
