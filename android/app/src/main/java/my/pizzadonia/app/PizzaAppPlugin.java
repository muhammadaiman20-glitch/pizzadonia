package my.pizzadonia.app;

import android.content.Context;
import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;
import androidx.core.content.pm.PackageInfoCompat;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Bridge for the Pizzadonia page (window.Capacitor.nativePromise('PizzaApp', method, options)):
 * info() · install({url}): in-app update · openBrowser({url}): Google sign-in in the phone's real browser,
 * because Google blocks it inside an app · takeLoginCode(): the one-time code the browser handed back.
 */
@CapacitorPlugin(name = "PizzaApp")
public class PizzaAppPlugin extends Plugin {
    /** 0 to 100 while downloading; -1 when the size is unknown. */
    private static volatile int downloadPercent = -1;
    static final String SITE = "https://pizzadonia.pages.dev/";
    private static final Pattern LOGIN_URI = Pattern.compile("^my\\.pizzadonia\\.(?:app|seller)://login\\?code=([A-Za-z0-9_-]{16,128})$");
    private static volatile String loginCode;

    /** Each app downloads only its own APK from the shop's own site. */
    static boolean allowedApk(String url, boolean seller) {
        if (url == null) return false;
        String expected = SITE + (seller ? "apk/Pizzadonia-Seller.apk" : "apk/Pizzadonia.apk");
        return url.equals(expected) || url.matches(Pattern.quote(expected) + "\\?v=[0-9]{1,9}");
    }

    /** The browser is only ever opened on the shop's own sign-in page. */
    static boolean allowedBrowserUrl(String url) {
        return url != null && url.matches(Pattern.quote(SITE) + "#/app-login\\?c=[A-Za-z0-9_-]{43}");
    }

    static String codeFromUri(String uri) {
        if (uri == null) return null;
        Matcher m = LOGIN_URI.matcher(uri);
        return m.matches() ? m.group(1) : null;
    }

    static void receiveLoginUri(String uri) {
        String code = codeFromUri(uri);
        if (code != null) loginCode = code;
    }

    private boolean isSeller() {
        return getContext().getPackageName().endsWith(".seller");
    }

    private boolean canInstall() {
        return Build.VERSION.SDK_INT < Build.VERSION_CODES.O || getContext().getPackageManager().canRequestPackageInstalls();
    }

    @PluginMethod
    public void info(PluginCall call) {
        try {
            Context ctx = getContext();
            PackageInfo pi = ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0);
            JSObject out = new JSObject();
            out.put("versionCode", PackageInfoCompat.getLongVersionCode(pi));
            out.put("versionName", pi.versionName);
            out.put("canInstall", canInstall());
            out.put("role", isSeller() ? "seller" : "customer");
            call.resolve(out);
        } catch (PackageManager.NameNotFoundException e) {
            call.reject("Tidak dapat membaca versi aplikasi.");
        }
    }

    @PluginMethod
    public void openBrowser(PluginCall call) {
        String url = call.getString("url");
        if (!allowedBrowserUrl(url)) {
            call.reject("Pautan log masuk tidak sah.");
            return;
        }
        Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse(url)).addCategory(Intent.CATEGORY_BROWSABLE).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        try {
            getContext().startActivity(i);
            call.resolve();
        } catch (RuntimeException e) {
            call.reject("Tiada pelayar pada telefon ini.");
        }
    }

    @PluginMethod
    public void takeLoginCode(PluginCall call) {
        JSObject out = new JSObject();
        String code = loginCode;
        loginCode = null;
        if (code != null) out.put("code", code);
        call.resolve(out);
    }

    @PluginMethod
    public void progress(PluginCall call) {
        JSObject out = new JSObject();
        out.put("percent", downloadPercent);
        call.resolve(out);
    }

    /** The user chose not to update: the app closes. */
    @PluginMethod
    public void exit(PluginCall call) {
        call.resolve();
        if (getActivity() != null) getActivity().runOnUiThread(() -> getActivity().finishAndRemoveTask());
    }

    @PluginMethod
    public void install(PluginCall call) {
        String url = call.getString("url");
        if (!allowedApk(url, isSeller())) {
            call.reject("Pautan kemas kini tidak sah.");
            return;
        }
        if (!canInstall()) {
            // Android asks once per app: the user allows this source, then taps Kemas kini again.
            Intent i = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES, Uri.parse("package:" + getContext().getPackageName()));
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            getContext().startActivity(i);
            call.reject("Benarkan \"Pasang aplikasi tidak diketahui\", kemudian tekan Kemas kini sekali lagi.", "PERMISSION");
            return;
        }
        new Thread(() -> {
            try {
                File apk = download(url);
                Context ctx = getContext();
                PackageInfo pi = ctx.getPackageManager().getPackageArchiveInfo(apk.getAbsolutePath(), 0);
                if (pi == null || !ctx.getPackageName().equals(pi.packageName)) throw new Exception("Fail yang dimuat turun bukan aplikasi ini.");
                long now = PackageInfoCompat.getLongVersionCode(ctx.getPackageManager().getPackageInfo(ctx.getPackageName(), 0));
                long next = PackageInfoCompat.getLongVersionCode(pi);
                if (next <= now) throw new Exception("Aplikasi anda sudah versi terkini (" + pi.versionName + ").");
                Uri uri = FileProvider.getUriForFile(ctx, ctx.getPackageName() + ".fileprovider", apk);
                Intent i = new Intent(Intent.ACTION_VIEW).setDataAndType(uri, "application/vnd.android.package-archive");
                i.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
                ctx.startActivity(i);
                JSObject out = new JSObject();
                out.put("versionName", pi.versionName);
                out.put("versionCode", next);
                call.resolve(out);
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "Muat turun gagal." : e.getMessage());
            }
        }).start();
    }

    private File download(String url) throws Exception {
        HttpURLConnection c = (HttpURLConnection) new URL(url).openConnection();
        c.setConnectTimeout(20_000);
        c.setReadTimeout(60_000);
        c.setRequestProperty("Cache-Control", "no-cache");
        try {
            int code = c.getResponseCode();
            if (code != 200) throw new Exception("Muat turun gagal (HTTP " + code + ").");
            File dir = new File(getContext().getCacheDir(), "update");
            if (!dir.isDirectory() && !dir.mkdirs()) throw new Exception("Tidak dapat menyimpan fail kemas kini.");
            File out = new File(dir, "Pizzadonia-update.apk");
            try (InputStream in = c.getInputStream(); OutputStream os = new FileOutputStream(out)) {
                byte[] buf = new byte[64 * 1024];
                long total = 0, size = c.getContentLengthLong();
                downloadPercent = size > 0 ? 0 : -1;
                for (int n; (n = in.read(buf)) > 0; ) {
                    os.write(buf, 0, n);
                    if ((total += n) > 100L * 1024 * 1024) throw new Exception("Fail kemas kini terlalu besar.");
                    if (size > 0) downloadPercent = (int) Math.min(100, total * 100 / size);
                }
            }
            return out;
        } finally {
            c.disconnect();
        }
    }
}
