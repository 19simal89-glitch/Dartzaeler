package de.florian.dartzaehler;

import android.app.Activity;
import android.content.ClipData;
import android.content.Intent;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;

import org.json.JSONObject;

/**
 * Dartzähler: lädt die Oberfläche aus den lokalen Assets.
 * Kein Netzwerk: keine INTERNET-Berechtigung und Netzwerk-Loads sind zusätzlich blockiert.
 * Daten (Spieler, Statistik, laufendes Spiel) liegen in files/data.json.
 */
public class MainActivity extends Activity {
    private static final String ASSET_PREFIX = "file:///android_asset/";
    private static final int REQ_IMPORT = 41;
    private static final int MAX_IMPORT = 20 * 1024 * 1024;
    private WebView web;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.parseColor("#12151C"));
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setBlockNetworkLoads(true);
        s.setBlockNetworkImage(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(false);
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setTextZoom(100);

        web.addJavascriptInterface(new Store(), "AndroidStore");
        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                return !request.getUrl().toString().startsWith(ASSET_PREFIX);
            }
        });

        setContentView(web);
        web.loadUrl(ASSET_PREFIX + "index.html");
    }

    @Override
    @SuppressWarnings("deprecation")
    public void onBackPressed() {
        web.evaluateJavascript("(window.appBack ? appBack() : false)", value -> {
            if (!"true".equals(value)) finish();
        });
    }

    /** Ergebnis der Dateiauswahl (Import) an die Oberfläche übergeben. */
    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != REQ_IMPORT) return;
        String text = null;
        if (resultCode == RESULT_OK && data != null && data.getData() != null) {
            try (InputStream in = getContentResolver().openInputStream(data.getData())) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) {
                    out.write(buf, 0, n);
                    if (out.size() > MAX_IMPORT) throw new IllegalStateException("zu groß");
                }
                text = new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                text = "";
            }
        }
        String arg = text == null ? "null" : JSONObject.quote(text);
        web.evaluateJavascript("window.onImportFile && onImportFile(" + arg + ")", null);
    }

    @Override
    protected void onDestroy() {
        if (web != null) web.destroy();
        super.onDestroy();
    }

    /** Persistenter Speicher für die Web-Oberfläche. */
    private class Store {
        private File file() {
            return new File(getFilesDir(), "data.json");
        }

        /** Daten als Textdatei über das Android-Teilen-Menü senden (Bluetooth, Quick Share, Messenger …). */
        @JavascriptInterface
        public boolean share(String json, String name) {
            try {
                String safe = name.replaceAll("[^A-Za-z0-9._-]", "_");
                File dir = new File(getCacheDir(), "share");
                File[] old = dir.listFiles();
                if (old != null) for (File f : old) //noinspection ResultOfMethodCallIgnored
                    f.delete();
                //noinspection ResultOfMethodCallIgnored
                dir.mkdirs();
                try (FileOutputStream out = new FileOutputStream(new File(dir, safe))) {
                    out.write(json.getBytes(StandardCharsets.UTF_8));
                }
                Uri uri = Uri.parse("content://" + ShareProvider.AUTHORITY + "/" + safe);
                Intent send = new Intent(Intent.ACTION_SEND);
                send.setType("text/plain");
                send.putExtra(Intent.EXTRA_STREAM, uri);
                send.putExtra(Intent.EXTRA_SUBJECT, "Dartzähler – Spieler & Statistik");
                send.setClipData(ClipData.newRawUri(safe, uri));
                send.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                Intent chooser = Intent.createChooser(send, "Spieler teilen");
                chooser.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                runOnUiThread(() -> startActivity(chooser));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Dateiauswahl für den Import öffnen; Ergebnis kommt über onImportFile() zurück. */
        @JavascriptInterface
        public void pick() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_IMPORT);
                } catch (Exception e) {
                    web.evaluateJavascript("window.onImportFile && onImportFile(null)", null);
                }
            });
        }

        @JavascriptInterface
        public String version() {
            try {
                return getPackageManager().getPackageInfo(getPackageName(), 0).versionName;
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public synchronized String load() {
            File f = file();
            if (!f.exists()) return null;
            try (InputStream in = new FileInputStream(f)) {
                ByteArrayOutputStream out = new ByteArrayOutputStream();
                byte[] buf = new byte[8192];
                int n;
                while ((n = in.read(buf)) > 0) out.write(buf, 0, n);
                return new String(out.toByteArray(), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return null;
            }
        }

        @JavascriptInterface
        public synchronized void save(String json) {
            File tmp = new File(getFilesDir(), "data.json.tmp");
            try (FileOutputStream out = new FileOutputStream(tmp)) {
                out.write(json.getBytes(StandardCharsets.UTF_8));
                out.getFD().sync();
            } catch (Exception e) {
                return;
            }
            //noinspection ResultOfMethodCallIgnored
            tmp.renameTo(file());
        }
    }
}
