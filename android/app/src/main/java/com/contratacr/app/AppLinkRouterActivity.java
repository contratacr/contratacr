package com.contratacr.app;

import android.app.Activity;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ResolveInfo;
import android.net.Uri;
import android.os.Bundle;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.util.Locale;

/** Host-wide verification supports root profile aliases on every supported
 * Android version. Browser-only URLs never reach Capacitor or the app session. */
public class AppLinkRouterActivity extends Activity {
    private static boolean contains(JSONArray values, String value) {
        for (int i = 0; i < values.length(); i++) if (value.equals(values.optString(i))) return true;
        return false;
    }
    public static boolean opensInApp(Context context, Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || uri.getUserInfo() != null || uri.getPort() != -1) return false;
        if (!"contratacr.com".equals(uri.getHost()) && !"www.contratacr.com".equals(uri.getHost())) return false;
        try (InputStream input = context.getAssets().open("app-link-policy.json")) {
            java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
            byte[] buffer = new byte[4096]; int read;
            while ((read = input.read(buffer)) != -1) bytes.write(buffer, 0, read);
            JSONObject policy = new JSONObject(bytes.toString(StandardCharsets.UTF_8.name()));
            String encoded = uri.getEncodedPath();
            if (encoded == null || encoded.toLowerCase(Locale.ROOT).matches(".*%(2f|5c|2e|00).*")) return false;
            Uri fragment = Uri.parse("https://contratacr.com/?" + (uri.getEncodedFragment() == null ? "" : uri.getEncodedFragment()));
            JSONArray auth = policy.getJSONArray("authParameters");
            for (int i = 0; i < auth.length(); i++) {
                String key = auth.getString(i);
                if (uri.getQueryParameterNames().contains(key) || fragment.getQueryParameterNames().contains(key)) return false;
            }
            String path = uri.getPath().replaceFirst("^/(es|en)(?=/|$)", "");
            if (path.isEmpty() || "/".equals(path)) return true;
            if (path.matches("/dashboard/native-auth-return(/.*)?")) return false;
            if (path.matches("/api/trabajos/reportar/?")) return true;
            String root = path.substring(1).split("/", -1)[0];
            if (contains(policy.getJSONArray("browserRoots"), root)) return false;
            if (contains(policy.getJSONArray("sectionRoots"), root)) return true;
            if (contains(policy.getJSONArray("screenRoots"), root)) return path.matches("/[^/]+/?");
            if (policy.getJSONObject("shortDetails").has(root)) return path.matches("/[poec]/[a-zA-Z0-9][a-zA-Z0-9-]{3,80}/?");
            if (policy.getJSONObject("vanitySources").has(root) || "pro".equals(root)) return path.matches("/[^/]+/?");
            return path.matches("/@?[a-zA-Z0-9][a-zA-Z0-9-]{2,80}/?");
        } catch (Exception ignored) { return false; }
    }
    static boolean isSecureOAuthReturn(Uri uri) {
        if (uri == null || !"https".equals(uri.getScheme()) || !"contratacr.com".equals(uri.getHost())
            || uri.getPort() != -1 || uri.getUserInfo() != null || uri.getFragment() != null
            || !"/dashboard/native-auth-return".equals(uri.getPath())) return false;
        String state = uri.getQueryParameter("native_state");
        String code = uri.getQueryParameter("code");
        String error = uri.getQueryParameter("error");
        if (state == null || !state.matches("[a-f0-9]{64}")) return false;
        for (String key : uri.getQueryParameterNames()) {
            if (!key.equals("native_state") && !key.equals("code") && !key.equals("error")) return false;
        }
        // The secure-window plugin still verifies the pending state and PKCE.
        return (code != null && !code.isEmpty() && code.length() <= 2048)
            || "access_denied".equals(error) || "oauth_failed".equals(error);
    }
    static Intent targetIntent(Context context, Uri uri) {
        if (opensInApp(context, uri) || isSecureOAuthReturn(uri)) return new Intent(context, MainActivity.class)
            .setAction(Intent.ACTION_VIEW).setData(uri)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP | Intent.FLAG_ACTIVITY_SINGLE_TOP);
        // Resolve a generic HTTPS browser, then pin its package to prevent our
        // own verified host from selecting this router again.
        Intent browserProbe = new Intent(Intent.ACTION_VIEW, Uri.parse("https://example.org/"))
            .addCategory(Intent.CATEGORY_BROWSABLE);
        ResolveInfo browser = context.getPackageManager().resolveActivity(browserProbe, 0);
        String pkg = browser == null ? null : browser.activityInfo.packageName;
        if (pkg == null || "android".equals(pkg) || context.getPackageName().equals(pkg)) {
            pkg = null;
            for (ResolveInfo candidate : context.getPackageManager().queryIntentActivities(browserProbe, 0)) {
                if (!context.getPackageName().equals(candidate.activityInfo.packageName)) { pkg = candidate.activityInfo.packageName; break; }
            }
        }
        return pkg == null ? null : new Intent(Intent.ACTION_VIEW, uri).addCategory(Intent.CATEGORY_BROWSABLE).setPackage(pkg);
    }
    @Override public void onCreate(Bundle state) {
        super.onCreate(state);
        Intent target = targetIntent(this, getIntent().getData());
        if (target != null) {
            try { startActivity(target); } catch (android.content.ActivityNotFoundException ignored) { }
        }
        finish();
    }
}
