import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
function fixture() {
  const storage = new Map<string,string>();
  const session = new Map<string,string>();
  const cookieWrites: string[]=[];
  const events = new EventTarget();
  const localStorage = { getItem: (key:string) => storage.get(key) ?? null, setItem: (key:string,value:string) => storage.set(key,value) };
  const box = {exports:{} as typeof import("../../src/lib/privacy/optional-consent")};
  const location={protocol:"https:",hostname:"contratacr.com"};
  const document={set cookie(value:string){cookieWrites.push(value);}};
  class Custom extends Event { detail:unknown; constructor(type:string, options:{detail:unknown}) {super(type);this.detail=options.detail;} }
  runInNewContext(ts.transpileModule(readFileSync("src/lib/privacy/optional-consent.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS}}).outputText,{
    module:box,exports:box.exports,window:Object.assign(events,{localStorage,sessionStorage:{removeItem:(key:string)=>session.delete(key)}}),location,document,Event,CustomEvent:Custom,
  });
  return {api:box.exports, storage, session, cookieWrites};
}
test("no choice, legacy implicit flags, malformed or expired permissions never authorize advertising",()=>{
 const h=fixture();expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 h.storage.set("contratacr:analytics-consent","enabled");expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 for(const record of ["not-json",JSON.stringify({version:"old",choice:"accepted",at:new Date().toISOString()}),JSON.stringify({version:"2026-10-19",choice:"accepted",at:"2025-01-01"})]){
  h.storage.set(h.api.consentKey("advertising"),record);expect(h.api.readOptionalConsent("advertising")).toBe("unknown");
 }
 h.api.syncAdvertisingCookie();expect(h.cookieWrites.some(value=>value.startsWith("ccr_ads_consent_v1=declined"))).toBe(true);
});
test("permission is versioned, purpose-specific, withdrawable, and does not bundle AI with advertising",()=>{
 const h=fixture();h.api.saveOptionalConsent("advertising","accepted");
 expect(h.api.readOptionalConsent("advertising")).toBe("accepted");expect(h.api.readOptionalConsent("ai")).toBe("unknown");
 h.session.set("contratacr:meta-pendientes","old queued events");h.api.saveOptionalConsent("advertising","declined");
 expect(h.api.readOptionalConsent("advertising")).toBe("declined");expect(h.session.size).toBe(0);
 expect(h.cookieWrites.some(value=>value.startsWith("_fbp=;"))).toBe(true);
 h.api.saveOptionalConsent("ai","accepted");expect(h.api.readOptionalConsent("ai")).toBe("accepted");expect(h.api.readOptionalConsent("advertising")).toBe("declined");
});
