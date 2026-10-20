package com.contratacr.app;

import android.content.SharedPreferences;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.IntentFilter;
import androidx.localbroadcastmanager.content.LocalBroadcastManager;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.facebook.FacebookSdk;
import com.facebook.GraphRequest;
import com.android.installreferrer.api.InstallReferrerClient;
import com.android.installreferrer.api.InstallReferrerStateListener;
import org.json.JSONObject;
import android.net.Uri;
import com.facebook.appevents.AppEventsLogger;
import java.util.Map;

@CapacitorPlugin(name = "ContrataCRMeasurement")
public class ContrataCRMeasurementPlugin extends Plugin {
    private boolean enabled = false;
    private AppEventsLogger logger;
    // Debug-only delivery evidence: no payloads, credentials or user identifiers.
    private boolean isDebugBuild() { return (getContext().getApplicationInfo().flags & android.content.pm.ApplicationInfo.FLAG_DEBUGGABLE) != 0; }
    private volatile String lastFlush = "pending", lastInstall = "pending";
    private final BroadcastReceiver flushReceiver = new BroadcastReceiver() {
        @Override public void onReceive(Context context, Intent intent) {
            Object result = intent.getSerializableExtra(AppEventsLogger.APP_EVENTS_EXTRA_FLUSH_RESULT);
            lastFlush = result == null ? "unknown" : result.toString();
        }
    };
    @Override public void load() {
        if (isDebugBuild()) LocalBroadcastManager.getInstance(getContext()).registerReceiver(flushReceiver, new IntentFilter(AppEventsLogger.ACTION_APP_EVENTS_FLUSHED));
    }
    @Override protected void handleOnDestroy() {
        if (isDebugBuild()) LocalBroadcastManager.getInstance(getContext()).unregisterReceiver(flushReceiver);
    }
    @PluginMethod public void diagnostics(PluginCall call) {
        if (!isDebugBuild()) { call.reject("DEBUG_ONLY"); return; }
        JSObject result = new JSObject();
        result.put("sdkReady", FacebookSdk.isFullyInitialized());
        result.put("flush", lastFlush); result.put("install", receipts().getBoolean("install_sent",false) ? "accepted" : lastInstall);
        call.resolve(result);
    }
    private static final Map<String,String> EVENTS = Map.ofEntries(
        Map.entry("PageView", "fb_mobile_activate_app"), Map.entry("Search", "fb_mobile_search"),
        Map.entry("CompleteRegistration", "fb_mobile_complete_registration"),
        Map.entry("Contact", "Contact"), Map.entry("Lead", "Lead"),
        Map.entry("ServiceHireConfirmed", "ServiceHireConfirmed"),
        Map.entry("ProfessionalProfilePublished", "ProfessionalProfilePublished"),
        Map.entry("ProfessionalProjectContact", "ProfessionalProjectContact"),
        Map.entry("ProfessionalProjectAccepted", "ProfessionalProjectAccepted"),
        Map.entry("ServiceOfferPublished", "ServiceOfferPublished"), Map.entry("EmployerJobPublished", "EmployerJobPublished")
    );
    private SharedPreferences receipts() { return getContext().getSharedPreferences("ccr_meta_receipts_v1", 0); }
    @PluginMethod public void configure(PluginCall call) {
        enabled = Boolean.TRUE.equals(call.getBoolean("enabled", false));
        if (enabled && logger == null) {
            // Manifest defaults and removal of InitProvider prevent collection before
            // first-party role/privacy checks. Disable independent metadata/diagnostic flags.
            FacebookSdk.setAutoInitEnabled(false);
            FacebookSdk.setAutoLogAppEventsEnabled(false);
            FacebookSdk.setAutoLogMetaDataEnabled(false);
            FacebookSdk.setAutoLogProductImprovementEnabled(false);
            FacebookSdk.setAdvertiserIDCollectionEnabled(false);
            FacebookSdk.sdkInitialize(getContext().getApplicationContext());
            FacebookSdk.fullyInitialize();
            AppEventsLogger.setFlushBehavior(AppEventsLogger.FlushBehavior.EXPLICIT_ONLY);
            AppEventsLogger.clearUserID(); AppEventsLogger.clearUserData();
            logger = AppEventsLogger.newLogger(getContext());
            reportInstall();
        }
        if (enabled && logger != null) reportInstall();
        JSObject result = new JSObject(); result.put("available", true); call.resolve(result);
    }
    private boolean installInFlight = false;
    private void reportInstall() {
        if (receipts().getBoolean("install_sent", false) || installInFlight) return;
        installInFlight = true;
        final InstallReferrerClient client = InstallReferrerClient.newBuilder(getContext()).build();
        try {
            client.startConnection(new InstallReferrerStateListener() {
                @Override public void onInstallReferrerSetupFinished(int responseCode) {
                    String safe = null;
                    try { if (responseCode == InstallReferrerClient.InstallReferrerResponse.OK) safe = minimalReferrer(client.getInstallReferrer().getInstallReferrer()); }
                    catch (Exception ignored) { }
                    finally { client.endConnection(); }
                    sendInstall(safe);
                }
                @Override public void onInstallReferrerServiceDisconnected() { installInFlight = false; }
            });
        } catch (Exception ignored) { sendInstall(null); }
    }
    // Only Meta's encrypted campaign attribution. Never raw referral text.
    static String minimalReferrer(String raw) {
        try {
            if (raw == null || raw.length() > 12000) return null;
            Uri uri = Uri.parse("https://referrer.invalid/?" + raw);
            String source = uri.getQueryParameter("utm_source");
            if (!"apps.facebook.com".equals(source) && !"facebook".equals(source) && !"instagram".equals(source)) return null;
            JSONObject encrypted = new JSONObject(uri.getQueryParameter("utm_content")).optJSONObject("source");
            if (encrypted == null) return null;
            String data = encrypted.optString("data"), nonce = encrypted.optString("nonce");
            if (!data.matches("[A-Za-z0-9_+/=-]{16,10000}") || !nonce.matches("[A-Za-z0-9_+/=-]{8,200}")) return null;
            JSONObject safe = new JSONObject().put("source", new JSONObject().put("data",data).put("nonce",nonce));
            return new Uri.Builder().appendQueryParameter("utm_source",source).appendQueryParameter("utm_content",safe.toString()).build().getEncodedQuery();
        } catch (Exception ignored) { return null; }
    }
    private void sendInstall(String referrer) {
        if (!enabled) { installInFlight = false; return; }
        try {
            JSONObject payload = new JSONObject().put("event","MOBILE_APP_INSTALL")
                .put("anon_id",AppEventsLogger.getAnonymousAppDeviceGUID(getContext()))
                .put("advertiser_tracking_enabled",false).put("application_tracking_enabled",true)
                .put("application_package_name","com.contratacr.app");
            if (referrer != null) payload.put("install_referrer",referrer);
            GraphRequest.newPostRequest(null,FacebookSdk.getApplicationId()+"/activities",payload,response->{
                installInFlight = false;
                lastInstall = response.getError() == null ? "accepted" : "error_" + response.getError().getErrorCode();
                if (response.getError() == null) receipts().edit().putBoolean("install_sent",true).apply();
            }).executeAsync();
        } catch (Exception ignored) { installInFlight = false; }
    }
    @PluginMethod public void track(PluginCall call) {
        String event = call.getString("event", ""), id = call.getString("id", "");
        if (!enabled || logger == null || !EVENTS.containsKey(event) || !FacebookSdk.isFullyInitialized() || !id.matches("[a-zA-Z0-9_-]{16,128}")) { call.reject("DISABLED_OR_INVALID_EVENT"); return; }
        // Persist only a bounded set of opaque event receipts, never account IDs.
        SharedPreferences prefs = receipts();
        if (!prefs.contains(id)) {
            logger.logEvent(EVENTS.get(event)); logger.flush();
            SharedPreferences.Editor edit = prefs.edit();
            long cutoff = System.currentTimeMillis()-7L*86400000L;
            for (Map.Entry<String,?> item : prefs.getAll().entrySet()) if (item.getValue() instanceof Long && (Long)item.getValue()<cutoff) edit.remove(item.getKey());
            if (prefs.getAll().size()>1000) edit.clear().putBoolean("install_sent",prefs.getBoolean("install_sent",false));
            edit.putLong(id,System.currentTimeMillis()).apply();
        }
        // Queued is not an acknowledgement from Meta.
        JSObject result = new JSObject(); result.put("queued", true); call.resolve(result);
    }
}
