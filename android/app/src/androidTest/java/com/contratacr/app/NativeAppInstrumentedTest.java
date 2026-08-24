package com.contratacr.app;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.Manifest;
import android.content.Context;
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
}
