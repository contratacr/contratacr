import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function fixture(transport?: typeof fetch) {
  const storage = new Map<string,string>();
  const session = new Map<string,string>();
  const cookieWrites: string[]=[];
  const events = new EventTarget();
  const localStorage = { getItem: (key:string) => storage.get(key) ?? null, setItem: (key:string,value:string) => storage.set(key,value), removeItem: (key:string)=>storage.delete(key) };
  const box = {exports:{} as typeof import("../../src/lib/privacy/optional-consent")};
  const location={protocol:"https:",hostname:"contratacr.com"};
  const document={set cookie(value:string){cookieWrites.push(value);}};
  class Custom extends Event { detail:unknown; constructor(type:string, options:{detail:unknown}) {super(type);this.detail=options.detail;} }
  runInNewContext(ts.transpileModule(readFileSync("src/lib/privacy/optional-consent.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    module:box,exports:box.exports,window:Object.assign(events,{localStorage,sessionStorage:{removeItem:(key:string)=>session.delete(key)}}),location,document,Event,CustomEvent:Custom,fetch:transport,AbortSignal,
  });
  return {api:box.exports, storage, session, cookieWrites};
}
test("no choice, legacy implicit flags, malformed or expired records never become an acceptance receipt",()=>{
 const h=fixture();expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 h.storage.set("contratacr:analytics-consent","enabled");expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 for(const record of ["not-json",JSON.stringify({version:"old",choice:"accepted",at:new Date().toISOString()}),JSON.stringify({version:"2026-10-19",choice:"accepted",at:"2025-01-01"})]){
  h.storage.set(h.api.consentKey("advertising"),record);expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 }
 h.api.syncAdvertisingCookie();expect(h.cookieWrites.some(value=>value.startsWith("ccr_ads_consent_v2=declined"))).toBe(true);
});
test("permission is versioned, purpose-specific, withdrawable, and does not bundle AI with advertising",()=>{
 const h=fixture();h.api.saveOptionalConsent("advertising","accepted");
 expect(h.api.readOptionalConsent("advertising")).toBe("accepted");expect(h.api.readOptionalConsent("ai")).toBe("unknown");
 h.session.set("contratacr:meta-pendientes","old queued events");h.api.saveOptionalConsent("advertising","declined");
 expect(h.api.readOptionalConsent("advertising")).toBe("declined");expect(h.session.size).toBe(0);
 expect(h.cookieWrites.some(value=>value.startsWith("_fbp=;"))).toBe(true);
 h.api.saveOptionalConsent("ai","accepted");expect(h.api.readOptionalConsent("ai")).toBe("accepted");expect(h.api.readOptionalConsent("advertising")).toBe("declined");
});

 test("measurement is opt-in and preserves legacy/expired refusals",()=>{
 const h=fixture(); expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 h.api.syncAdvertisingCookie();expect(h.cookieWrites.some(v=>v.startsWith("ccr_ads_consent_v2=declined"))).toBe(true);
 expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 h.storage.set("contratacr:analytics-consent","declined");expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 h.storage.delete("contratacr:analytics-consent");
 h.storage.set(h.api.consentKey("advertising"),JSON.stringify({choice:"declined",version:"old",at:"2020-01-01"}));
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 });


test("guest withdrawal survives offline and server errors without enabling measurement", async () => {
 let requests = 0;
 const h = fixture((async () => {
  requests++;
  if (requests === 1) throw new Error("offline");
  return Response.json({}, {status: requests >= 3 ? 200 : 503});
 }) as typeof fetch);
 h.api.saveOptionalConsent("advertising", "declined");
 await h.api.retryAdvertisingWithdrawal();
 expect(requests).toBe(1);
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 // An attempted re-enable cannot bypass an unacknowledged withdrawal.
 h.api.saveOptionalConsent("advertising", "accepted");
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 await h.api.retryAdvertisingWithdrawal();
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 await h.api.retryAdvertisingWithdrawal();
 expect(requests).toBe(3);
 expect(h.api.advertisingMeasurementEnabled()).toBe(true);
 expect([...h.storage.keys()].some(key => key.includes("withdrawal-pending"))).toBe(false);
});

test("concurrent withdrawal retries share a single request and preserve the refusal", async () => {
 let release!: () => void;
 let requests = 0;
 const wait = new Promise<void>(resolve => { release = resolve; });
 const h = fixture((async () => { requests++; await wait; return Response.json({ok:true}); }) as typeof fetch);
 h.api.saveOptionalConsent("advertising", "declined");
 const first = h.api.retryAdvertisingWithdrawal();
 const second = h.api.retryAdvertisingWithdrawal();
 expect(requests).toBe(1);
 release();
 await Promise.all([first, second]);
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 expect(h.api.readOptionalConsent("advertising")).toBe("declined");
 expect([...h.storage.keys()].some(key => key.includes("withdrawal-pending"))).toBe(false);
});

 test("statistics and advertising are independent and withdrawal removes optional attribution", async () => {
 const h = fixture((async () => new Response(null, {status:204})) as typeof fetch);
 expect(h.api.analyticsMeasurementEnabled()).toBe(false);
 h.api.saveOptionalConsent("analytics", "accepted");
 expect(h.api.analyticsMeasurementEnabled()).toBe(true);
 expect(h.api.advertisingMeasurementEnabled()).toBe(false);
 h.api.saveOptionalConsent("advertising", "accepted");
 h.storage.set("contratacr:attribution", "old attribution");
 h.api.saveOptionalConsent("analytics", "declined");
 await h.api.retryStatisticsCleanup();
 expect(h.api.analyticsMeasurementEnabled()).toBe(false);
 expect(h.api.advertisingMeasurementEnabled()).toBe(true);
 expect(h.storage.has("contratacr:attribution")).toBe(false);
 expect(h.cookieWrites.some(v => v.startsWith("ccr_statistics_consent_v1=declined"))).toBe(true);
 });
 test("cookie refresh cannot extend an existing consent beyond 180 days", () => {
 const h=fixture();
 h.storage.set(h.api.consentKey("advertising"), JSON.stringify({version:h.api.OPTIONAL_CONSENT_VERSION,choice:"accepted",at:new Date(Date.now()-179*86400000).toISOString()}));
 h.api.syncAdvertisingCookie();
 const cookie=h.cookieWrites.find(v=>v.startsWith("ccr_ads_consent_v2=accepted"))!;
 expect(Number(cookie.match(/Max-Age=(\d+)/)?.[1])).toBeLessThanOrEqual(86400);
 });
