package com.contratacr.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.Context;
import android.content.Intent;
import android.net.Uri;
import android.content.pm.ResolveInfo;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.PermissionInfo;
import androidx.test.ext.junit.runners.AndroidJUnit4;
import androidx.test.platform.app.InstrumentationRegistry;
import java.util.Arrays;
import java.util.Set;
import java.util.stream.Collectors;
import org.junit.Test;
import org.junit.runner.RunWith;

@RunWith(AndroidJUnit4.class)
public class NativeAppInstrumentedTest {
    private final Context context = InstrumentationRegistry.getInstrumentation().getTargetContext();

    @Test
    public void packageAndLaunchActivityAreConfigured() throws Exception {
        assertEquals("com.contratacr.app", context.getPackageName());

        ActivityInfo activity = context.getPackageManager().getActivityInfo(
            context.getPackageManager().getLaunchIntentForPackage(context.getPackageName()).getComponent(),
            0
        );
        assertTrue(activity.exported);
        assertEquals(ActivityInfo.LAUNCH_SINGLE_TASK, activity.launchMode);
    }

    @Test
    public void installedAppResolvesAppleReturnThroughGuardToMainActivity() {
        // Inspect the installed, merged manifest: source XML alone did not
        // catch the missing VIEW filter in the published Play build 14.
        Intent intent = new Intent(Intent.ACTION_VIEW,
            Uri.parse("https://contratacr.com/dashboard/native-auth-return?code=test&native_state=" + new String(new char[64]).replace('\0', 'a')));
        intent.addCategory(Intent.CATEGORY_BROWSABLE);
        intent.setPackage(context.getPackageName());
        ResolveInfo resolved = context.getPackageManager().resolveActivity(intent, PackageManager.MATCH_DEFAULT_ONLY);
        assertNotNull("The installed APK must accept the Apple browser return", resolved);
        assertEquals("com.contratacr.app.AppLinkRouterActivity", resolved.activityInfo.name);
        assertTrue(resolved.activityInfo.exported);
        Intent forwarded = AppLinkRouterActivity.targetIntent(context, intent.getData());
        assertNotNull(forwarded);
        assertEquals("com.contratacr.app.MainActivity", forwarded.getComponent().getClassName());
        assertEquals(intent.getData(), forwarded.getData());
        assertTrue((forwarded.getFlags() & Intent.FLAG_ACTIVITY_SINGLE_TOP) != 0);
        assertTrue((forwarded.getFlags() & Intent.FLAG_ACTIVITY_CLEAR_TOP) != 0);
    }

    @Test
    public void requiredRuntimePermissionsAreDeclared() throws Exception {
        PackageInfo info = context.getPackageManager().getPackageInfo(
            context.getPackageName(),
            PackageManager.GET_PERMISSIONS
        );
        Set<String> permissions = Arrays.stream(info.requestedPermissions).collect(Collectors.toSet());

        assertTrue(permissions.contains(Manifest.permission.INTERNET));
        assertTrue(permissions.contains(Manifest.permission.ACCESS_COARSE_LOCATION));
        assertTrue(permissions.contains(Manifest.permission.ACCESS_FINE_LOCATION));
        assertTrue(permissions.contains(Manifest.permission.CAMERA));
        assertTrue(permissions.contains(Manifest.permission.POST_NOTIFICATIONS));
    }

    @Test
    public void cameraIsOptionalForStoreCompatibility() throws Exception {
        PermissionInfo permission = context.getPackageManager().getPermissionInfo(
            Manifest.permission.CAMERA,
            0
        );
        assertNotNull(permission);

        PackageInfo info = context.getPackageManager().getPackageInfo(
            context.getPackageName(),
            PackageManager.GET_CONFIGURATIONS
        );
        boolean cameraRequired = Arrays.stream(info.reqFeatures == null ? new android.content.pm.FeatureInfo[0] : info.reqFeatures)
            .anyMatch(feature -> PackageManager.FEATURE_CAMERA.equals(feature.name)
                && (feature.flags & android.content.pm.FeatureInfo.FLAG_REQUIRED) != 0);
        assertFalse(cameraRequired);
    }
    @Test
    public void installedManifestKeepsMetaCollectionExplicitAndWithoutAdvertisingId() throws Exception {
        PackageManager manager = context.getPackageManager();
        PackageInfo info = manager.getPackageInfo(context.getPackageName(), PackageManager.GET_PERMISSIONS | PackageManager.GET_PROVIDERS);
        Set<String> permissions = Arrays.stream(info.requestedPermissions).collect(Collectors.toSet());
        for (String denied : new String[]{"com.google.android.gms.permission.AD_ID", "android.permission.ACCESS_ADSERVICES_AD_ID", "android.permission.ACCESS_ADSERVICES_ATTRIBUTION", "android.permission.ACCESS_ADSERVICES_CUSTOM_AUDIENCE", "android.permission.ACCESS_ADSERVICES_TOPICS"}) {
            assertFalse("Transitive SDK must not restore " + denied, permissions.contains(denied));
        }
        android.os.Bundle metadata = manager.getApplicationInfo(context.getPackageName(), PackageManager.GET_META_DATA).metaData;
        for (String flag : new String[]{"AutoInitEnabled", "AutoLogAppEventsEnabled", "AutoLogMetaDataEnabled", "AutoLogProductImprovementEnabled", "AdvertiserIDCollectionEnabled"}) {
            assertTrue("Explicit default is required: " + flag, metadata.containsKey("com.facebook.sdk." + flag));
            assertFalse(metadata.getBoolean("com.facebook.sdk." + flag));
        }
        for (android.content.pm.ProviderInfo provider : info.providers) assertFalse(provider.name.contains("FacebookInitProvider"));
    }

    @Test
    public void installReferrerRejectsFreeTextAndKeepsOnlyEncryptedAttribution() throws Exception {
        assertEquals(null, ContrataCRMeasurementPlugin.minimalReferrer("utm_source=other&utm_content=private@example.com"));
        assertEquals(null, ContrataCRMeasurementPlugin.minimalReferrer("utm_source=facebook&utm_content=private@example.com"));
        String encrypted = new org.json.JSONObject().put("source", new org.json.JSONObject()
            .put("data", "abcdefghijklmnop12345678").put("nonce", "abcdefgh12345678").put("email", "private@example.com"))
            .put("search", "private search").toString();
        String raw = new Uri.Builder().appendQueryParameter("utm_source", "apps.facebook.com")
            .appendQueryParameter("utm_content", encrypted).appendQueryParameter("email", "private@example.com").build().getEncodedQuery();
        String safe = ContrataCRMeasurementPlugin.minimalReferrer(raw);
        assertNotNull(safe);
        assertFalse(safe.contains("private"));
        Uri parsed = Uri.parse("https://referrer.invalid/?" + safe);
        assertEquals(2, parsed.getQueryParameterNames().size());
        org.json.JSONObject content = new org.json.JSONObject(parsed.getQueryParameter("utm_content"));
        assertEquals(1, content.length());
        assertEquals(2, content.getJSONObject("source").length());
    }
}
