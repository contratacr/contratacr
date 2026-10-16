// The current Android source verifies /dashboard links; Play builds <= 14 do not.
// Only a one-use PKCE code travels here; session tokens stay in the WebView.
export const ANDROID_OAUTH_RETURN_ORIGIN = "https://contratacr.com";
export const ANDROID_OAUTH_RETURN_PATH = "/dashboard/native-auth-return";

export function readAndroidOAuthReturn(raw: string, expectedState: string) {
  const url = new URL(raw);
  if (url.origin !== ANDROID_OAUTH_RETURN_ORIGIN || url.pathname !== ANDROID_OAUTH_RETURN_PATH || url.hash || url.username || url.password
    || url.searchParams.get("native_state") !== expectedState) throw new Error("Invalid native OAuth return");
  if (url.searchParams.get("error")) throw new Error(url.searchParams.get("error") === "access_denied" ? "OAuth cancelled" : "Native OAuth failed");
  const code = url.searchParams.get("code");
  if (!code || code.length > 2048) throw new Error("Missing native OAuth code");
  return code;
}

export function androidOAuthReturnResponse(params: URLSearchParams): Response {
  const state = params.get("native_state") ?? "";
  const code = params.get("code");
  if (!/^[a-f0-9]{64}$/.test(state) || (!params.get("error") && (!code || code.length > 2048))) {
    return new Response("Invalid authentication return", { status: 400, headers: { "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" } });
  }
  const query = new URLSearchParams({ native_state: state });
  if (params.get("error")) query.set("error", params.get("error") === "access_denied" ? "access_denied" : "oauth_failed");
  else query.set("code", code!);
  // Fixed package, host and path. Never accept a caller-controlled return URL.
  const intent = `intent://contratacr.com${ANDROID_OAUTH_RETURN_PATH}?${query}#Intent;scheme=https;package=com.contratacr.app;end`.replaceAll("&", "&amp;");
  const english = params.get("locale") === "en";
  const title = english ? "Return to ContrataCR" : "Volver a ContrataCR";
  const text = english ? "Continue in the app to finish signing in." : "Continúa en la app para terminar de iniciar sesión.";
  return new Response(`<!doctype html><html lang="${english ? "en" : "es"}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${title}</title><style>body{margin:0;min-height:100dvh;display:grid;place-items:center;background:#fff;color:#162543;font:16px system-ui}main{padding:32px;text-align:center;max-width:360px}h1{font-size:24px}p{color:#64748b;line-height:1.5}a{display:inline-block;margin-top:16px;padding:14px 24px;border-radius:999px;background:#009fd9;color:#fff;text-decoration:none;font-weight:600}</style></head><body><main><h1>${title}</h1><p>${text}</p><a href="${intent}">${title}</a></main></body></html>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store, max-age=0", "Referrer-Policy": "no-referrer", "X-Content-Type-Options": "nosniff", "X-Robots-Tag": "noindex, nofollow", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'" },
  });
}
