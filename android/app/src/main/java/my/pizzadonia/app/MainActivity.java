package my.pizzadonia.app;

import android.content.Intent;
import android.os.Bundle;

import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    /** 1 = the page handled back (closed a sheet or went one page back), 0 = already on the home page. */
    private static final String BACK_JS = "(function(){try{"
            + "if(window.pizzaUpdateRequired&&window.pizzaUpdateRequired())return 1;"
            + "var c=document.querySelectorAll('.fixed.inset-0 [aria-label=\"Tutup\"],.fixed.inset-0 [aria-label=\"Close\"]');if(c.length){c[c.length-1].click();return 1;}"
            + "var q=document.querySelector('[aria-label=\"QR pembayaran\"]');if(q){q.click();return 1;}"
            + "var h=location.hash;if(h&&h!=='#'&&h!=='#/'&&h!=='#/admin'){history.back();return 1;}"
            + "}catch(e){}return 0;})()";

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(PizzaAppPlugin.class);
        super.onCreate(savedInstanceState);
        takeLogin(getIntent());
        getOnBackPressedDispatcher().addCallback(this, new androidx.activity.OnBackPressedCallback(true) {
            @Override
            public void handleOnBackPressed() {
                android.webkit.WebView web = getBridge() == null ? null : getBridge().getWebView();
                if (web == null) {
                    moveTaskToBack(true);
                    return;
                }
                web.evaluateJavascript(BACK_JS, handled -> {
                    if (!"1".equals(handled)) moveTaskToBack(true);
                });
            }
        });
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        takeLogin(intent);
    }

    private void takeLogin(Intent intent) {
        if (intent != null && intent.getData() != null) PizzaAppPlugin.receiveLoginUri(intent.getData().toString());
    }
}
