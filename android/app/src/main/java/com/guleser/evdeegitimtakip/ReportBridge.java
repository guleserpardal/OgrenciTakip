package com.guleser.evdeegitimtakip;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.print.PdfPrint;
import android.print.PrintAttributes;
import android.print.PrintDocumentAdapter;
import android.print.PrintManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.OutputStreamWriter;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/**
 * Rapor koprusu: Android sistem yazdirmasi, A4 PDF uretimi ve dosya paylasimi.
 *
 * Rapor HTML'i JS tarafinda uretilir ve buraya bagimsiz bir belge olarak gelir;
 * bu yuzden uygulamanin navigasyonu ve butonlari ciktiya asla basilmaz.
 */
@CapacitorPlugin(name = "ReportBridge")
public class ReportBridge extends Plugin {

    private static final String OUTPUT_DIR = "reports";

    /** Yazdirma isi bitene kadar WebView'in toplanmamasi icin guclu referans. */
    private WebView jobWebView;

    /* ------------------------------------------------------------ yazdir --- */

    @PluginMethod
    public void printHtml(final PluginCall call) {
        final String html = call.getString("html", "");
        final String jobName = sanitizeJobName(call.getString("jobName", "Rapor"));
        if (html == null || html.isEmpty()) {
            call.reject("Rapor içeriği boş.");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    WebView webView = newOffscreenWebView();
                    webView.setWebViewClient(new WebViewClient() {
                        private boolean started = false;

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (started) {
                                return;
                            }
                            started = true;
                            try {
                                PrintManager printManager =
                                    (PrintManager) getContext().getSystemService(Context.PRINT_SERVICE);
                                if (printManager == null) {
                                    call.reject("Bu cihazda yazdırma servisi yok.");
                                    return;
                                }
                                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(jobName);
                                printManager.print(jobName, adapter, a4Attributes());
                                call.resolve();
                            } catch (Exception e) {
                                call.reject("Yazdırma açılamadı: " + e.getMessage(), e);
                            }
                        }
                    });
                    retainWebView(webView);
                    webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    call.reject("Yazdırma hazırlanamadı: " + e.getMessage(), e);
                }
            }
        });
    }

    /* --------------------------------------------------------- PDF + paylas --- */

    @PluginMethod
    public void sharePdf(final PluginCall call) {
        final String html = call.getString("html", "");
        final String fileName = safeFileName(call.getString("fileName", "rapor.pdf"), ".pdf");
        final String subject = call.getString("subject", "");
        final String title = call.getString("title", "Haftalık rapor");
        if (html == null || html.isEmpty()) {
            call.reject("Rapor içeriği boş.");
            return;
        }

        getActivity().runOnUiThread(new Runnable() {
            @Override
            public void run() {
                try {
                    WebView webView = newOffscreenWebView();
                    webView.setWebViewClient(new WebViewClient() {
                        private boolean started = false;

                        @Override
                        public void onPageFinished(WebView view, String url) {
                            if (started) {
                                return;
                            }
                            started = true;
                            try {
                                File directory = new File(getContext().getCacheDir(), OUTPUT_DIR);
                                PrintDocumentAdapter adapter = view.createPrintDocumentAdapter(fileName);
                                new PdfPrint(a4Attributes(), new PdfPrint.CallbackPrint() {
                                    @Override
                                    public void success(String absolutePath) {
                                        try {
                                            shareLocalFile(new File(absolutePath), "application/pdf", subject, title);
                                            JSObject result = new JSObject();
                                            result.put("path", absolutePath);
                                            call.resolve(result);
                                        } catch (Exception e) {
                                            call.reject("Paylaşım menüsü açılamadı: " + e.getMessage(), e);
                                        }
                                    }

                                    @Override
                                    public void onFailure(String message) {
                                        call.reject(message);
                                    }
                                }).print(adapter, directory, fileName);
                            } catch (Exception e) {
                                call.reject("PDF oluşturulamadı: " + e.getMessage(), e);
                            }
                        }
                    });
                    retainWebView(webView);
                    webView.loadDataWithBaseURL(null, html, "text/html", "UTF-8", null);
                } catch (Exception e) {
                    call.reject("PDF hazırlanamadı: " + e.getMessage(), e);
                }
            }
        });
    }

    /* ------------------------------------------------------ dosya paylasimi --- */

    /** JSON yedegi gibi metin dosyalarini paylasir. */
    @PluginMethod
    public void shareFile(PluginCall call) {
        String fileName = safeFileName(call.getString("fileName", "yedek.json"), ".json");
        String content = call.getString("content", "");
        String mime = call.getString("mime", "application/json");
        String subject = call.getString("subject", "");

        FileOutputStream stream = null;
        OutputStreamWriter writer = null;
        try {
            File directory = new File(getContext().getCacheDir(), OUTPUT_DIR);
            if (!directory.exists() && !directory.mkdirs()) {
                call.reject("Geçici klasör oluşturulamadı.");
                return;
            }
            File outFile = new File(directory, fileName);
            stream = new FileOutputStream(outFile, false);
            writer = new OutputStreamWriter(stream, StandardCharsets.UTF_8);
            writer.write(content == null ? "" : content);
            writer.flush();
            writer.close();
            writer = null;
            stream = null;

            shareLocalFile(outFile, mime, subject, subject.isEmpty() ? "Yedek" : subject);

            JSObject result = new JSObject();
            result.put("path", outFile.getAbsolutePath());
            call.resolve(result);
        } catch (Exception e) {
            call.reject("Dosya paylaşılamadı: " + e.getMessage(), e);
        } finally {
            try {
                if (writer != null) {
                    writer.close();
                } else if (stream != null) {
                    stream.close();
                }
            } catch (Exception ignored) {
                // kapatma hatasi sonucu etkilemez
            }
        }
    }

    /* ------------------------------------------------------------ yardimci --- */

    private void shareLocalFile(File file, String mime, String subject, String chooserTitle) {
        Uri uri = FileProvider.getUriForFile(
            getContext(),
            getContext().getPackageName() + ".fileprovider",
            file
        );
        Intent send = new Intent(Intent.ACTION_SEND);
        send.setType(mime);
        send.putExtra(Intent.EXTRA_STREAM, uri);
        if (subject != null && !subject.isEmpty()) {
            send.putExtra(Intent.EXTRA_SUBJECT, subject);
            send.putExtra(Intent.EXTRA_TEXT, subject);
        }
        send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);

        Intent chooser = Intent.createChooser(send, chooserTitle);
        chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        chooser.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(chooser);
    }

    private PrintAttributes a4Attributes() {
        // Kenar bosluklari rapor CSS'indeki `@page { margin: … }` kuralina birakilir.
        return new PrintAttributes.Builder()
            .setMediaSize(PrintAttributes.MediaSize.ISO_A4)
            .setResolution(new PrintAttributes.Resolution("pdf", "PDF", 600, 600))
            .setMinMargins(PrintAttributes.Margins.NO_MARGINS)
            .build();
    }

    private WebView newOffscreenWebView() {
        WebView webView = new WebView(getContext());
        WebSettings settings = webView.getSettings();
        // Rapor tamamen statik HTML'dir; script calistirmaya gerek yok.
        settings.setJavaScriptEnabled(false);
        settings.setDefaultTextEncodingName("UTF-8");
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(false);
        return webView;
    }

    /**
     * WebView'i alanda tutar. Android'in yazdirma belgesi olusturma akisi
     * WebView'in gorunum agacina eklenmesini gerektirmez; yalnizca is bitene
     * kadar nesnenin yasamasi gerekir. Bir onceki is varsa serbest birakilir.
     */
    private void retainWebView(WebView webView) {
        if (jobWebView != null) {
            jobWebView.destroy();
        }
        jobWebView = webView;
    }

    private String sanitizeJobName(String name) {
        String value = name == null ? "" : name.trim();
        return value.isEmpty() ? "Rapor" : value;
    }

    private String safeFileName(String name, String extension) {
        String value = name == null ? "" : name.trim();
        value = value.replaceAll("[^A-Za-z0-9._-]", "_");
        if (value.isEmpty()) {
            value = "rapor";
        }
        if (!value.toLowerCase(Locale.ROOT).endsWith(extension)) {
            value = value + extension;
        }
        return value;
    }
}
