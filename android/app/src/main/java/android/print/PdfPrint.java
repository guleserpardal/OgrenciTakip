package android.print;

import android.os.CancellationSignal;
import android.os.ParcelFileDescriptor;

import java.io.File;

/**
 * WebView'in PrintDocumentAdapter'ini kullanarak dogrudan dosyaya A4 PDF yazar.
 *
 * Not: PrintDocumentAdapter.LayoutResultCallback ve WriteResultCallback siniflarinin
 * yapicilari paket-ozeldir; bu yuzden bu yardimci sinif bilerek `android.print`
 * paketinde tanimlanmistir. Boylece sistemin kendi yazdirma motoru (Chromium)
 * kullanilir: metin vektorel kalir, Turkce karakterler bozulmaz ve sayfa sonlari
 * rapor CSS'indeki @page kuralina gore olusur.
 */
public class PdfPrint {

    public interface CallbackPrint {
        void success(String absolutePath);
        void onFailure(String message);
    }

    private final PrintAttributes printAttributes;
    private final CallbackPrint callback;

    public PdfPrint(PrintAttributes printAttributes, CallbackPrint callback) {
        this.printAttributes = printAttributes;
        this.callback = callback;
    }

    public void print(final PrintDocumentAdapter adapter, final File directory, final String fileName) {
        adapter.onLayout(null, printAttributes, null, new PrintDocumentAdapter.LayoutResultCallback() {

            @Override
            public void onLayoutFinished(PrintDocumentInfo info, boolean changed) {
                final File outFile = new File(directory, fileName);
                final ParcelFileDescriptor pfd = openForWrite(outFile);
                if (pfd == null) {
                    callback.onFailure("PDF dosyası oluşturulamadı.");
                    return;
                }
                adapter.onWrite(
                    new PageRange[] { PageRange.ALL_PAGES },
                    pfd,
                    new CancellationSignal(),
                    new PrintDocumentAdapter.WriteResultCallback() {

                        @Override
                        public void onWriteFinished(PageRange[] pages) {
                            close(pfd);
                            if (pages != null && pages.length > 0 && outFile.length() > 0) {
                                callback.success(outFile.getAbsolutePath());
                            } else {
                                callback.onFailure("PDF içeriği yazılamadı.");
                            }
                        }

                        @Override
                        public void onWriteFailed(CharSequence error) {
                            close(pfd);
                            callback.onFailure(error == null ? "PDF yazılamadı." : error.toString());
                        }

                        @Override
                        public void onWriteCancelled() {
                            close(pfd);
                            callback.onFailure("PDF oluşturma iptal edildi.");
                        }
                    }
                );
            }

            @Override
            public void onLayoutFailed(CharSequence error) {
                callback.onFailure(error == null ? "Sayfa düzeni oluşturulamadı." : error.toString());
            }

            @Override
            public void onLayoutCancelled() {
                callback.onFailure("Sayfa düzeni iptal edildi.");
            }
        }, null);
    }

    private static ParcelFileDescriptor openForWrite(File file) {
        try {
            File parent = file.getParentFile();
            if (parent != null && !parent.exists() && !parent.mkdirs()) {
                return null;
            }
            // Eski, daha uzun bir dosyanin artiklari kalmasin.
            if (file.exists() && !file.delete()) {
                return null;
            }
            if (!file.createNewFile()) {
                return null;
            }
            return ParcelFileDescriptor.open(file, ParcelFileDescriptor.MODE_READ_WRITE);
        } catch (Exception e) {
            return null;
        }
    }

    private static void close(ParcelFileDescriptor pfd) {
        try {
            pfd.close();
        } catch (Exception ignored) {
            // kapatma hatasi sonucu etkilemez
        }
    }
}
