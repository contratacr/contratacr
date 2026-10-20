import { Capacitor, registerPlugin } from "@capacitor/core";
import { advertisingMeasurementEnabled, subscribeOptionalConsent, syncAdvertisingCookie } from "@/lib/privacy/optional-consent";
import { GROWTH_ACTIONS, type MetaConversion } from "./growth-contract";
interface NativeMeasurement {
  configure(options: { enabled: boolean; schemaReady?: boolean }): Promise<{ available: boolean }>;
  track(options: { event: string; id: string }): Promise<{ queued: boolean }>;
}
const bridge = registerPlugin<NativeMeasurement>("ContrataCRMeasurement");
let lastExcluded = true, generation = 0, actorKey: string | undefined, skanReady = false;
let enabled = false, configured = false, unsubscribe: (()=>void) | undefined;
let pending: {event:string;id:string}[] = [];
export function setNativeMeasurementActor(actor: string) {
  if (actorKey === actor) return;
  actorKey = actor; enabled = false; configured = false; ++generation;
  if (Capacitor.isNativePlatform() && Capacitor.isPluginAvailable("ContrataCRMeasurement")) void bridge.configure({ enabled: false }).catch(()=>undefined);
}
export async function configureNativeMeasurement(excluded: boolean, schemaReady = skanReady) {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable("ContrataCRMeasurement")) return;
  skanReady = schemaReady;
  const current = ++generation;
  lastExcluded = excluded;
  syncAdvertisingCookie();
  enabled = !excluded && advertisingMeasurementEnabled() && ["contratacr.com","www.contratacr.com"].includes(location.hostname);
  try {
    await bridge.configure({ enabled, ...(Capacitor.getPlatform() === "ios" ? { schemaReady } : {}) });
    if (current !== generation) return;
    configured = true;
    if (!enabled) pending = [];
    else { const batch = pending; pending = []; for (const item of batch) await bridge.track(item); }
  } catch { configured = false; pending = []; }
  if (!unsubscribe) unsubscribe = subscribeOptionalConsent(()=>{ void configureNativeMeasurement(lastExcluded); });
}
export function trackNativeMeasurement(event: string, id = crypto.randomUUID()) {
  if (!Capacitor.isNativePlatform() || !advertisingMeasurementEnabled()) return;
  const allowed = ["PageView","Search","CompleteRegistration",...Object.values(GROWTH_ACTIONS).map(x=>x.event)];
  if (!allowed.includes(event) || !/^[a-zA-Z0-9_-]{16,128}$/.test(id)) return;
  if (event === "PageView" || event === "CompleteRegistration") {
    try {
      const key = `ccr:native-meta:${event}`;
      const old = JSON.parse(sessionStorage.getItem(key) ?? "null");
      if (old && Date.now()-old.at < 1800000 && old.at <= Date.now()) return;
      sessionStorage.setItem(key,JSON.stringify({ at: Date.now() }));
    } catch { /* SDK/server receipt deduplication remains in place */ }
  }
  if (!configured) { if (pending.length < 20) pending.push({event,id}); return; }
  if (enabled) void bridge.track({event,id}).catch(()=>undefined);
}
export function trackNativeConversion(conversion: MetaConversion | null | undefined) {
  if (conversion && Object.values(GROWTH_ACTIONS).some(x=>x.event===conversion.eventName)) trackNativeMeasurement(conversion.eventName, conversion.eventId);
}
