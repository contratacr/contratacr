package com.contratacr.app;

import android.graphics.Color;
import android.os.Bundle;
import android.view.View;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        WebView webView = getBridge().getWebView();
        webView.getSettings().setTextZoom(100);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        // Match the native splash if Android exposes the WebView before its
        // first composited frame. The splash plugin remains visible until the
        // first-run screen (or the requested route) is ready.
        webView.setBackgroundColor(Color.rgb(244, 247, 250));
    }
}
