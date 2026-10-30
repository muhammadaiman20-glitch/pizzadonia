package my.pizzadonia.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import org.junit.Test;

public class PizzaAppRulesTest {
    private static final String SITE = "https://pizzadonia.pages.dev/";
    private static final String CHALLENGE = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNO-_";

    @Test
    public void eachAppDownloadsOnlyItsOwnApk() {
        assertTrue(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia.apk", false));
        assertTrue(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia.apk?v=2", false));
        assertTrue(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia-Seller.apk", true));
        assertFalse(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia-Seller.apk", false));
        assertFalse(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia.apk", true));
        assertFalse(PizzaAppPlugin.allowedApk("https://evil.example/apk/Pizzadonia.apk", false));
        assertFalse(PizzaAppPlugin.allowedApk(SITE + "apk/Pizzadonia.apk?v=2&x=y", false));
        assertFalse(PizzaAppPlugin.allowedApk(null, false));
    }

    @Test
    public void browserOpensOnlyTheSignInPage() {
        assertTrue(PizzaAppPlugin.allowedBrowserUrl(SITE + "#/app-login?c=" + CHALLENGE));
        assertFalse(PizzaAppPlugin.allowedBrowserUrl(SITE + "#/admin"));
        assertFalse(PizzaAppPlugin.allowedBrowserUrl("https://evil.example/#/app-login?c=" + CHALLENGE));
        assertFalse(PizzaAppPlugin.allowedBrowserUrl(SITE + "#/app-login?c=short"));
    }

    @Test
    public void loginCodeIsReadStrictly() {
        assertEquals("abcdefghijklmnop_-12", PizzaAppPlugin.codeFromUri("my.pizzadonia.seller://login?code=abcdefghijklmnop_-12"));
        assertNull(PizzaAppPlugin.codeFromUri("my.pizzadonia.seller://login?code=short"));
        assertNull(PizzaAppPlugin.codeFromUri("my.pizzadonia.seller://other?code=abcdefghijklmnop_-12"));
        assertNull(PizzaAppPlugin.codeFromUri("https://evil.example/login?code=abcdefghijklmnop_-12"));
        assertNull(PizzaAppPlugin.codeFromUri(null));
    }
}
