package com.pizzadonia.app;

import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebView;

import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    private static final String PREFS = "pizzadonia.native";
    private static final String KEY_VERSION = "lastVersionCode";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(AppUpdaterPlugin.class);
        super.onCreate(savedInstanceState);

        // Selepas APK baharu dipasang, buang cache WebView sekali supaya UI
        // lama (contoh butang demo yang sudah dibuang) tidak terus dipaparkan.
        try {
            long versionCode = PackageInfoCompat.getLongVersionCode(
                    getPackageManager().getPackageInfo(getPackageName(), 0)
            );
            SharedPreferences prefs = getSharedPreferences(PREFS, MODE_PRIVATE);
            if (prefs.getLong(KEY_VERSION, 0L) != versionCode) {
                WebView webView = getBridge() != null ? getBridge().getWebView() : null;
                if (webView != null) {
                    webView.clearCache(true);
                    webView.clearHistory();
                    // Muat semula selepas kitaran semasa supaya halaman yang
                    // dimulakan oleh Capacitor tidak kekal pada cache lama.
                    webView.post(webView::reload);
                }
                prefs.edit().putLong(KEY_VERSION, versionCode).apply();
            }
        } catch (Exception ignored) {
            // Jangan halang app daripada dibuka jika versi tidak dapat dibaca.
        }
    }
}
