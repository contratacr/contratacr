import { advertisingMeasurementEnabled, syncAdvertisingCookie } from "@/lib/privacy/optional-consent";
import type { MetaConversion } from "./growth-contract";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { esNavegadorAutomatizado } from "@/lib/analytics/trafico-automatizado";

// Compatibility entry points for existing callers. No third-party browser script,
// automatic matching, page scraping, form capture or raw URL forwarding.
function allowed(): boolean {
  return typeof window !== "undefined" && !isNativeAppRuntime() && !esNavegadorAutomatizado()
    && ["contratacr.com", "www.contratacr.com"].includes(window.location.hostname) && advertisingMeasurementEnabled();
}
function prepareIds() {
  syncAdvertisingCookie();
  const suffix = "; Path=/; SameSite=Lax; Max-Age=2592000; Secure";
  if (!/(?:^|;\s*)_fbp=fb\.1\.\d{13}\.\d+/.test(document.cookie)) {
    const bytes = new Uint32Array(1); window.crypto.getRandomValues(bytes);
    document.cookie = `_fbp=fb.1.${Date.now()}.${bytes[0]}${suffix}`;
  }
  const click = new URLSearchParams(window.location.search).get("fbclid");
  if (click && /^[a-zA-Z0-9_-]{1,500}$/.test(click)) {
    // Preserve the original click timestamp across rerenders on this landing URL.
    const current = document.cookie.split(";").map(v=>v.trim()).find(v=>v.startsWith("_fbc="))?.slice(5);
    if (!current?.endsWith(`.${click}`)) {
      document.cookie = `_fbc=fb.1.${Date.now()}.${click}${suffix}`;
      // A new campaign click in the same tab is a new landing visit.
      try {
        window.sessionStorage.removeItem("ccr:meta-minimal:PageView");
        window.sessionStorage.removeItem("ccr:meta-minimal:PageView:sent");
        window.sessionStorage.removeItem("ccr:meta-minimal:PageView:at");
      } catch { /* storage unavailable */ }
    }
  }
}
function send(event: "PageView" | "CompleteRegistration") {
  if (!allowed()) return;
  prepareIds();
  const key = `ccr:meta-minimal:${event}`;
  let id: string;
  try {
    const at = Number(window.sessionStorage.getItem(`${key}:at`));
    if (!at || Date.now() - at > 30 * 60 * 1000) {
      window.sessionStorage.removeItem(key);
      window.sessionStorage.removeItem(`${key}:sent`);
      window.sessionStorage.setItem(`${key}:at`, String(Date.now()));
    }
    if (window.sessionStorage.getItem(`${key}:sent`)) return;
    id = window.sessionStorage.getItem(key) || window.crypto.randomUUID();
    window.sessionStorage.setItem(key, id);
  } catch { return; }
  void fetch("/api/analytics/meta", {
    method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ event, id }), keepalive: true,
  }).then(response => {
    if (response.ok) window.sessionStorage.setItem(`${key}:sent`, "1");
  }).catch(()=>{ /* An unsuccessful request is retried on the next navigation. */ });
}
export function trackMetaEvent(eventName: string, _params?: Record<string, unknown>) {
  void _params;
  // Search text and service/location details stay exclusively in internal analytics.
  if (eventName === "CompleteRegistration") send("CompleteRegistration");
}
export function trackMetaPageView() { send("PageView"); }
// Successful business conversions are already queued on the authorized server
// action, with the same deduplication receipt. Never send them a second time here.
export function trackMetaConversion(_conversion: MetaConversion | null | undefined) { void _conversion; }
export function enviarEventosMetaPendientes() {
  try { window.sessionStorage.removeItem("contratacr:meta-pendientes"); } catch { /* obsolete raw envelopes */ }
}
export function hayEventosMetaPendientes() { return false; }
