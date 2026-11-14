package com.pizzadonia.app;

import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Memuat turun APK kemas kini dan membuka pemasang sistem Android.
 *
 * Android tidak membenarkan pemasangan senyap untuk app sideload. Plugin ini
 * memuat turun APK secara automatik dan membuka skrin pemasangan; pengguna
 * hanya perlu menekan "Install".
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private final ExecutorService executor = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        String url = call.getString("url");
        String version = call.getString("versionName", "terkini");

        if (url == null || url.isEmpty()) {
            call.reject("URL kemas kini tiada.");
            return;
        }

        Context context = getContext();

        // Android 8+ memerlukan kebenaran "Install unknown apps" untuk app ini.
        // Jangan buka tetapan secara automatik di sini — UI memaparkan butang
        // "Benarkan" supaya pengguna tidak terperangkap dalam gelung tetapan.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O
                && !context.getPackageManager().canRequestPackageInstalls()) {
            JSObject result = new JSObject();
            result.put("status", "permission_required");
            call.resolve(result);
            return;
        }

        executor.execute(() -> {
            try {
                File apk = downloadApk(context, url, version);
                Uri uri = FileProvider.getUriForFile(
                        context,
                        context.getPackageName() + ".fileprovider",
                        apk
                );

                Intent intent = new Intent(Intent.ACTION_VIEW);
                intent.setDataAndType(uri, "application/vnd.android.package-archive");
                intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
                context.startActivity(intent);

                JSObject result = new JSObject();
                result.put("status", "installer_opened");
                call.resolve(result);
            } catch (Exception error) {
                call.reject("Gagal memuat turun kemas kini: " + error.getMessage(), error);
            }
        });
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        openInstallSettingsInternal();
        call.resolve();
    }

    private void openInstallSettingsInternal() {
        Context context = getContext();
        Intent intent = new Intent(
                Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + context.getPackageName())
        );
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        context.startActivity(intent);
    }

    private File downloadApk(Context context, String url, String version) throws IOException {
        if (!url.startsWith("https://") && !url.startsWith("http://")) {
            throw new IOException("URL mesti http atau https.");
        }

        File dir = new File(context.getCacheDir(), "updates");
        if (!dir.exists() && !dir.mkdirs()) {
            throw new IOException("Tidak dapat mencipta folder kemas kini.");
        }

        // Buang APK lama sebelum muat turun baharu.
        File[] existing = dir.listFiles();
        if (existing != null) {
            for (File file : existing) {
                //noinspection ResultOfMethodCallIgnored
                file.delete();
            }
        }

        String safeVersion = version.replaceAll("[^0-9A-Za-z._-]", "_");
        File target = new File(dir, "pizzadonia-" + safeVersion + ".apk");
        File temp = new File(dir, "pizzadonia-" + safeVersion + ".apk.part");

        // Guna semula APK yang sudah dimuat turun untuk versi ini (contoh jika
        // pengguna membatalkan pemasang dan menekan "Pasang" semula).
        if (target.exists() && target.length() > 1024L * 1024L) {
            JSObject progress = new JSObject();
            progress.put("downloaded", target.length());
            progress.put("total", target.length());
            progress.put("percent", 100);
            notifyListeners("progress", progress);
            return target;
        }

        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(url).openConnection();
            connection.setInstanceFollowRedirects(true);
            connection.setConnectTimeout(20000);
            connection.setReadTimeout(60000);
            connection.setRequestProperty("Accept", "application/vnd.android.package-archive");
            connection.connect();

            int code = connection.getResponseCode();
            if (code != HttpURLConnection.HTTP_OK) {
                throw new IOException("HTTP " + code);
            }

            long total = connection.getContentLengthLong();
            long downloaded = 0;
            long lastReported = 0;

            try (InputStream input = connection.getInputStream();
                 FileOutputStream output = new FileOutputStream(temp)) {
                byte[] buffer = new byte[16384];
                int read;
                while ((read = input.read(buffer)) != -1) {
                    output.write(buffer, 0, read);
                    downloaded += read;

                    // Had saiz keselamatan: 150 MB.
                    if (downloaded > 150L * 1024 * 1024) {
                        throw new IOException("Fail kemas kini terlalu besar.");
                    }

                    if (downloaded - lastReported > 262144) {
                        lastReported = downloaded;
                        JSObject progress = new JSObject();
                        progress.put("downloaded", downloaded);
                        progress.put("total", total);
                        if (total > 0) {
                            progress.put("percent", Math.min(100, (int) (downloaded * 100 / total)));
                        }
                        notifyListeners("progress", progress);
                    }
                }
            }

            if (!temp.renameTo(target)) {
                throw new IOException("Tidak dapat menyimpan fail kemas kini.");
            }

            JSObject progress = new JSObject();
            progress.put("downloaded", downloaded);
            progress.put("total", total);
            progress.put("percent", 100);
            notifyListeners("progress", progress);

            return target;
        } finally {
            if (connection != null) connection.disconnect();
            if (temp.exists()) {
                //noinspection ResultOfMethodCallIgnored
                temp.delete();
            }
        }
    }
}
