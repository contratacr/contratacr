package com.contratacr.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;

import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class AppLinkResolutionTest {
    // Explicit package tests the installed manifest, not domain verification:
    // debug certificates are intentionally absent from production assetlinks.
    private ResolveInfo resolve(String path) {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://contratacr.com" + path));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        return context.getPackageManager().resolveActivity(intent, 0);
    }

    @Test public void chromeCanCheckTheDeclaredRelatedWebsite() throws Exception {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        android.content.pm.ApplicationInfo info = context.getPackageManager().getApplicationInfo(context.getPackageName(), android.content.pm.PackageManager.GET_META_DATA);
        int resource = info.metaData.getInt("asset_statements");
        org.json.JSONArray statements = new org.json.JSONArray(context.getString(resource));
        assertEquals("https://contratacr.com", statements.getJSONObject(0).getJSONObject("target").getString("site"));
        assertEquals("web", statements.getJSONObject(0).getJSONObject("target").getString("namespace"));
        assertEquals("https://www.contratacr.com", statements.getJSONObject(1).getJSONObject("target").getString("site"));
    }
    @Test public void currentScreenIntentPreservesQueryAndFragment() throws Exception {
        Intent intent = Intent.parseUri("intent://contratacr.com/profesionales?categoria=soldadura#resenas#Intent;scheme=https;package=com.contratacr.app;S.browser_fallback_url=https%3A%2F%2Fplay.google.com%2Fstore;end", Intent.URI_INTENT_SCHEME);
        assertEquals("https://contratacr.com/profesionales?categoria=soldadura#resenas", intent.getDataString());
        assertEquals("com.contratacr.app", intent.getPackage());
    }
    @Test public void homepageAndLocalizedHomepageResolveToTheApp() {
        for (String path : new String[]{"/", "/en", "/en/", "/es", "/es/"}) {
            ResolveInfo info = resolve(path);
            assertNotNull(path, info);
            assertEquals(MainActivity.class.getName(), info.activityInfo.name);
        }
    }
    @Test public void googleResultsWithWwwAlsoResolveToTheApp() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (String path : new String[]{"/", "/profesionales", "/proyectos/example", "/en/empleos/example"}) {
            Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://www.contratacr.com" + path));
            intent.addCategory(Intent.CATEGORY_BROWSABLE);
            intent.setPackage(context.getPackageName());
            assertNotNull(path, context.getPackageManager().resolveActivity(intent, 0));
        }
    }
    @Test public void publicSearchAndDetailLinksKeepTheirDestination() {
        for (String path : new String[]{"/profesionales?categoria=soldadura", "/proyectos/example", "/en/empleos/example"}) {
            assertNotNull(path, resolve(path));
        }
    }
    @Test public void customBannerEntryMarkersResolveOnBothHosts() {
        Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();
        for (String host : new String[]{"contratacr.com", "www.contratacr.com"}) {
            for (String path : new String[]{"/profesionales?_ccr_home=1", "/en/profesionales?_ccr_open=ios&categoria=soldadura"}) {
                Intent intent = new Intent(Intent.ACTION_VIEW, Uri.parse("https://" + host + path));
                intent.addCategory(Intent.CATEGORY_BROWSABLE);
                intent.setPackage(context.getPackageName());
                ResolveInfo info = context.getPackageManager().resolveActivity(intent, 0);
                assertNotNull(host + path, info);
                assertEquals(MainActivity.class.getName(), info.activityInfo.name);
                assertEquals("https://" + host + path, intent.getDataString());
            }
        }
    }
    @Test public void addingHomepageDoesNotCaptureBrowserAuthenticationOrAdmin() {
        for (String path : new String[]{"/login", "/auth/callback?code=example", "/admin", "/api/email/baja"}) {
            assertNull(path, resolve(path));
        }
    }
}
