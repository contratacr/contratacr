package com.contratacr.app;

import android.animation.Animator;
import android.animation.AnimatorListenerAdapter;
import android.graphics.Color;
import android.graphics.drawable.GradientDrawable;
import android.os.Bundle;
import android.view.Gravity;
import android.view.View;
import android.view.ViewGroup;
import android.widget.FrameLayout;
import android.webkit.WebView;
import androidx.core.splashscreen.SplashScreen;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SplashScreen splashScreen = SplashScreen.installSplashScreen(this);
        super.onCreate(savedInstanceState);

        splashScreen.setOnExitAnimationListener(provider -> {
            View splashView = provider.getView();
            View iconView = provider.getIconView();
            long transitionDuration = 600L;

            if (splashView instanceof ViewGroup) {
                ViewGroup splashRoot = (ViewGroup) splashView;
                View colorReveal = new View(this);
                int revealSize = Math.round(72 * getResources().getDisplayMetrics().density);
                FrameLayout.LayoutParams revealLayout = new FrameLayout.LayoutParams(revealSize, revealSize);
                revealLayout.gravity = Gravity.CENTER;
                GradientDrawable revealBackground = new GradientDrawable();
                revealBackground.setShape(GradientDrawable.OVAL);
                revealBackground.setColor(Color.rgb(0, 159, 217));
                colorReveal.setBackground(revealBackground);
                colorReveal.setScaleX(0.05f);
                colorReveal.setScaleY(0.05f);
                splashRoot.addView(colorReveal, 0, revealLayout);
                colorReveal.animate()
                    .scaleX(32f)
                    .scaleY(32f)
                    .setDuration(transitionDuration)
                    .setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator())
                    .start();
            }

            iconView.setScaleX(0.94f);
            iconView.setScaleY(0.94f);
            iconView.animate()
                .scaleX(1.10f)
                .scaleY(1.10f)
                .alpha(0f)
                .setStartDelay(90L)
                .setDuration(430L)
                .setInterpolator(new android.view.animation.AccelerateDecelerateInterpolator())
                .start();

            splashView.animate()
                .alpha(0f)
                .setStartDelay(430L)
                .setDuration(170L)
                .setListener(new AnimatorListenerAdapter() {
                    @Override
                    public void onAnimationEnd(Animator animation) {
                        provider.remove();
                    }
                })
                .start();
        });

        WebView webView = getBridge().getWebView();
        webView.getSettings().setTextZoom(100);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.setBackgroundColor(Color.WHITE);
    }
}
