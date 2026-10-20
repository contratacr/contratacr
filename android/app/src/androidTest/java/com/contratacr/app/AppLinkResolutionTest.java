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

    @Test public void homepageAndLocalizedHomepageResolveToTheApp() {
        for (String path : new String[]{"/", "/en", "/en/", "/es", "/es/"}) {
            ResolveInfo info = resolve(path);
            assertNotNull(path, info);
            assertEquals(MainActivity.class.getName(), info.activityInfo.name);
        }
    }
    @Test public void publicSearchAndDetailLinksKeepTheirDestination() {
        for (String path : new String[]{"/profesionales?categoria=soldadura", "/proyectos/example", "/en/empleos/example"}) {
            assertNotNull(path, resolve(path));
        }
    }
    @Test public void addingHomepageDoesNotCaptureBrowserAuthenticationOrAdmin() {
        for (String path : new String[]{"/login", "/auth/callback?code=example", "/admin", "/api/email/baja"}) {
            assertNull(path, resolve(path));
        }
    }
}
