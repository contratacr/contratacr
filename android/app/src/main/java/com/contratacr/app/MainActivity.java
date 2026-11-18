package com.contratacr.app;

import android.content.pm.ApplicationInfo;
import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;
import com.getcapacitor.BridgeWebViewClient;

public class MainActivity extends BridgeActivity {
    // The Android 12 splash leaves as soon as the WebView draws its first frame,
    // which happens before the remote HTML arrives: the user sees the splash, a
    // blank page, then the home. Hold it until the document is actually visible.
    private volatile boolean webContentVisible = false;

    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        splashScreen.setKeepOnScreenCondition(() -> !webContentVisible);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.setWebViewClient(new BridgeWebViewClient(getBridge()) {
            @Override
            public void onReceivedError(WebView view, WebResourceRequest request, WebResourceError error) {
                super.onReceivedError(view, request, error);
                // Never strand the user behind the splash when the first load fails.
                if (request.isForMainFrame()) webContentVisible = true;
            }
        });
        // The document's first paint is the empty streaming shell, so the page
        // itself is asked whether real content is laid out. Cheap to poll, and
        // the timeout guarantees a stalled network still reaches the WebView.
        // No layout happens while the splash blocks the first draw, so the probe
        // must not measure boxes: streamed text inside <main> is the signal.
        final String probe = "(function(){var n=document.querySelector('[data-native-onboarding-ready],main,.ccr-native-first-run-prepaint-content');return !!n&&(n.textContent||'').trim().length>120;})()";
        final long startedAt = System.currentTimeMillis();
        final Runnable[] poll = new Runnable[1];
        poll[0] = () -> {
            if (webContentVisible) return;
            if (System.currentTimeMillis() - startedAt > 6000) { webContentVisible = true; return; }
            webView.evaluateJavascript(probe, value -> {
                if ("true".equals(value)) webContentVisible = true;
                else webView.postDelayed(poll[0], 80);
            });
        };
        webView.postDelayed(poll[0], 120);
        if ((getApplicationInfo().flags & ApplicationInfo.FLAG_DEBUGGABLE) != 0) {
            WebView.setWebContentsDebuggingEnabled(true);
        }
        webView.getSettings().setTextZoom(100);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Match the native splash if Android exposes the WebView before its
        // first composited frame. The splash plugin remains visible until the
        // first-run screen (or the requested route) is ready.
        webView.setBackgroundColor(Color.rgb(244, 247, 250));
    }
}
