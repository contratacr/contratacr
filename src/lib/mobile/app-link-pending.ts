type LinkWindow = Window & { __ccrAppLinkPending?: string; __ccrLaunchHandled?: boolean };

export function appLinkPathname(path: string) {
  return path.split(/[?#]/)[0].replace(/^\/es(?=\/|$)/, "").replace(/\/+$/, "") || "/";
}

/** Keep the document covered even if a native splash timer has elapsed. */
export function setAppLinkPending(path?: string) {
  const state = window as LinkWindow;
  if (path) state.__ccrAppLinkPending = path;
  else delete state.__ccrAppLinkPending;
  document.documentElement.classList.toggle("ccr-app-link-pending", Boolean(path));
  window.dispatchEvent(new Event("ccr-app-link-pending"));
}

// Runs after native detection in <head>, before streaming or hydration can
// reveal the configured start page. A new document must resolve its launch URL
// even when WKWebView restores session data from a previous process.
export const APP_LINK_PREPAINT = `if(document.documentElement.classList.contains("ccr-native-app")){window.__ccrAppLinkPending="resolving-launch";document.documentElement.classList.add("ccr-app-link-pending")}`;
export const APP_LINK_COVER_CSS = `#ccr-app-link-cover{display:none}html.ccr-app-link-pending #ccr-app-link-cover{display:flex;position:fixed;inset:0;z-index:2147483647;flex-direction:column;align-items:center;justify-content:center;background:#fff;color:#162543}html.ccr-app-link-pending body{overflow:hidden}#ccr-app-link-cover span{width:28px;height:28px;border:3px solid #d6eaf3;border-top-color:#007fae;border-radius:50%;animation:ccr-link-spin .8s linear infinite}@keyframes ccr-link-spin{to{transform:rotate(360deg)}}@media(prefers-reduced-motion:reduce){#ccr-app-link-cover span{animation:none}}`;
