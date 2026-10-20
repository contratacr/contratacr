import { test, expect } from "playwright/test";
import { cleanJourney, routeSection } from "../../src/lib/analytics/journey-contract";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const id="00000000-0000-4000-8000-000000000001";
test("journey contract removes private fields and classifies routes without names or queries",()=>{
 expect(cleanJourney({id,action:"navigation",target:"proyectos",section:"buscar",value:999,name:"Private Name",email:"private@example.com",input:"secret",url:"https://private.test"})).toEqual({id,action:"navigation",target:"proyectos",section:"buscar",value:100});
 expect(routeSection("/en/isaac-sanchez?private=secret")).toBe("perfil_publico");
 expect(routeSection("/es/proyectos/private-id")).toBe("proyectos");
 for (const change of [{action:"password"},{target:"private@example.com"},{section:"private@example.com"},{id:"account-id"}]) expect(cleanJourney({id,action:"button",target:"action",section:"home",...change})).toBeNull();
});
function nativeRuntime() {
 let native=true,available=true,choice=true;
 const calls:{method:string;data:Record<string,unknown>}[]=[];
 let subscribe:()=>void=()=>{};
 const requireNode=createRequire(`${process.cwd()}/tests/e2e/journey-privacy.spec.ts`);
 const mocks:Record<string,unknown>={
  "@capacitor/core":{Capacitor:{getPlatform:()=>"android",isNativePlatform:()=>native,isPluginAvailable:()=>available},registerPlugin:()=>({configure:async(data:Record<string,unknown>)=>{calls.push({method:"configure",data});return{available:true};},track:async(data:Record<string,unknown>)=>{calls.push({method:"track",data});return{queued:true};}})},
  "@/lib/privacy/optional-consent":{advertisingMeasurementEnabled:()=>choice,syncAdvertisingCookie:()=>{},subscribeOptionalConsent:(fn:()=>void)=>{subscribe=fn;return()=>{};}},
  "./growth-contract":requireNode("../../src/lib/analytics/growth-contract.ts"),
 };
 const box={exports:{}};
 const code=ts.transpileModule(readFileSync("src/lib/analytics/native-measurement.ts","utf8"),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
 runInNewContext(code,{module:box,exports:box.exports,require:(key:string)=>mocks[key],location:{hostname:"contratacr.com"},crypto:{randomUUID:()=>id}});
 return{lib:box.exports as typeof import("../../src/lib/analytics/native-measurement"),calls,setNative:(v:boolean)=>{native=v;},setAvailable:(v:boolean)=>{available=v;},decline:()=>{choice=false;subscribe();}};
}
test("native bridge gates events on server role check, keeps IDs opaque and honors withdrawal",async()=>{
 const {lib,calls,decline}=nativeRuntime();
 lib.trackNativeMeasurement("Contact",id); expect(calls).toHaveLength(0);
 await lib.configureNativeMeasurement(true);expect(calls).toEqual([{method:"configure",data:{enabled:false}}]);
 await lib.configureNativeMeasurement(false);lib.trackNativeMeasurement("PrivateMessage",id);lib.trackNativeMeasurement("Contact","private@example.com");
 lib.trackNativeMeasurement("Contact",id);
 expect(calls.filter(x=>x.method==="track")).toEqual([{method:"track",data:{event:"Contact",id}}]);
 decline();await Promise.resolve();lib.trackNativeMeasurement("Contact",id);
 expect(calls.at(-1)).toEqual({method:"configure",data:{enabled:false}});
 expect(calls.filter(x=>x.method==="track")).toHaveLength(1);
});
test("old installed apps and browser never call a missing native plugin",async()=>{
 for(const mode of ["web","old"]){const runtime=nativeRuntime();if(mode==="web")runtime.setNative(false);else runtime.setAvailable(false);await runtime.lib.configureNativeMeasurement(false);expect(runtime.calls).toHaveLength(0);}
});
