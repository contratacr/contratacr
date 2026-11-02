import { test, expect } from "playwright/test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import { AdminMeasurement } from "../../src/components/admin/admin-measurement";
import { summarizeOperationalContacts, summarizeConsentReceipts, summarizeContactCampaigns, type MeasurementReport, type ConversionReceipt } from "../../src/lib/analytics/measurement-report";
const now = Date.parse("2026-11-02T18:00:00Z"), since = now - 7 * 86400000;
const at = new Date(now - 1000).toISOString();
const conversations = [{id:"c",client_id:"buyer",professional_profile_id:"pro",project_id:null}, {id:"p",client_id:"buyer",professional_profile_id:"pro",project_id:"project"}, {id:"empty",client_id:"buyer",professional_profile_id:"pro",project_id:null}, {id:"staff",client_id:"admin",professional_profile_id:"pro",project_id:null}, {id:"self",client_id:"pro",professional_profile_id:"pro",project_id:null}];
test("operational contacts require saved client messages, exclude staff/self, deduplicate receipts, and keep project chats separate", () => {
 const message = (id:string, conversation_id="c", sender_id="buyer", created_at=at) => ({id,conversation_id,sender_id,created_at});
 const rows = [message("1"),message("1"),message("2"),message("3","c","pro"),message("4","p"),message("5","staff","admin"),message("6","self","pro"),message("7","missing"),message("8","c","buyer",new Date(since-1).toISOString()),message("9","c","buyer",new Date(now+1).toISOString())];
 expect(summarizeOperationalContacts(conversations,rows,new Set(["admin"]),since,now)).toEqual({conversations:2,clientMessages:3,projectConversations:1});
 expect(summarizeOperationalContacts(conversations,[],new Set(),since,now).conversations).toBe(0);
});
test("consent coverage uses latest account receipt, not event totals, old versions, or historical acceptances after withdrawal", () => {
 const choice = (id:number, accepted:boolean, extra={}) => ({id,user_id:"buyer",purpose:"analytics",accepted,version:"2026-10-29",recorded_at:at,...extra});
 const rows = [choice(2,false),choice(1,true),choice(3,true,{user_id:"admin"}),choice(4,true,{user_id:"old",version:"old"}),choice(5,true,{user_id:"expired",recorded_at:new Date(now-181*86400000).toISOString()}),choice(6,true,{purpose:"advertising"}),choice(7,true,{user_id:"future",recorded_at:new Date(now+1).toISOString()})];
 expect(summarizeConsentReceipts(rows,new Set(["admin"]),now,"2026-10-29")).toEqual({analytics:{accepted:0,declined:1},advertising:{accepted:1,declined:0}});
});
test("campaign report separates unknown origin, production receipt, retries, test delivery and excludes staff and other actions", () => {
 const row=(event_id:string,extra:Partial<ConversionReceipt>={}):ConversionReceipt=>({event_id,action:"service_contact",actor_hash:"buyer",created_at:at,attribution:{campaign:"clientes"},status:"sent",delivery_mode:"production",...extra});
 expect(summarizeContactCampaigns([row("source",{attribution:{source:"instagram"}})],new Set(),since,now)[0].campaign).toBe("Sin campaña identificada · instagram");
 const rows=[row("1"),row("1"),row("2",{delivery_mode:"test"}),row("3",{status:"pending",delivery_mode:null}),row("4",{status:"browser_only",delivery_mode:null}),row("5",{actor_hash:"staff"}),row("6",{action:"employer_job_published"}),row("7",{attribution:null}),row("8",{created_at:new Date(since-1).toISOString()}),row("9",{created_at:new Date(now+1).toISOString()})];
 expect(summarizeContactCampaigns(rows,new Set(["staff"]),since,now)).toEqual([{campaign:"clientes",signals:3,received:1,pending:1,other:1,tests:1},{campaign:"Origen desconocido",signals:1,received:1,pending:0,other:0,tests:0}]);
});
test("admin view labels missing sources and does not confuse server receipt with ad attribution", async ({page}) => {
 const data:MeasurementReport={period:"week",operations:{conversations:2,clientMessages:3,projectConversations:1},consent:{analytics:{accepted:4,declined:3},advertising:{accepted:2,declined:5}},campaigns:[{campaign:"clientes_cr",signals:3,received:1,pending:1,other:1,tests:2}]};
 await page.setContent(renderToStaticMarkup(createElement(AdminMeasurement,{data})));
 await expect(page.getByRole("heading",{name:/Mensajes reales/})).toBeVisible();
 await expect(page.getByText(/no confirma atribución al anuncio/)).toBeVisible();
 await expect(page.getByText(/no es el porcentaje de visitantes/)).toBeVisible();
 await expect(page.getByText(/Su origen publicitario no está vinculado/)).toBeVisible();
 await expect(page.getByRole("row",{name:/clientes_cr/}).locator("td")).toHaveText(["clientes_cr","3","1","1","1","2"]);
 await page.setContent(renderToStaticMarkup(createElement(AdminMeasurement,{data:{period:"all",operations:null,consent:null,campaigns:null}})));
 await expect(page.getByRole("status")).toHaveCount(3);
 await expect(page.getByText("0",{exact:true})).toHaveCount(0);
});
test("server aggregation reads no message bodies or ad payloads and fails closed per source", async () => {
 const queries:Array<{table:string;columns:string;filters:unknown[]}> = [];
 const mockRows:Record<string,unknown[]> = {profiles:[{id:"admin",role:"admin"}],direct_messages:[{id:"m",conversation_id:"c",sender_id:"buyer",created_at:at}],direct_conversations:conversations,privacy_choices:[],growth_conversion_events:[]};
 let unavailable = "";
 const db={from(table:string) {
   const query={table,columns:"",filters:[] as unknown[]};queries.push(query);
   const builder={select(columns:string){query.columns=columns;return builder;},in(...args:unknown[]){query.filters.push(args);return builder;},gte(...args:unknown[]){query.filters.push(args);return builder;},lte(...args:unknown[]){query.filters.push(args);return builder;},eq(...args:unknown[]){query.filters.push(args);return builder;},order(){return builder;},range(from:number,to:number){return Promise.resolve({data:table===unavailable?null:(mockRows[table]??[]).slice(from,to+1),error:table===unavailable?{code:"unavailable"}:null});}};
   return builder;
 }};
 const source=readFileSync("src/lib/admin/measurement.ts","utf8");
 const moduleBox={exports:{} as {getAdminMeasurement:(period:"week"|"all")=>Promise<MeasurementReport>}};
 const paging=await import("../../src/lib/admin/read-all-rows");
 const crypto=await import("node:crypto");
 runInNewContext(ts.transpileModule(source,{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,{module:moduleBox,exports:moduleBox.exports,require:(name:string)=>({"server-only":{},"node:crypto":crypto,"@/lib/supabase/admin":{createAdminClient:()=>db},"@/lib/privacy/legal-version":{privacyChoiceVersion:()=>"2026-10-29"},"./read-all-rows":paging,"@/lib/analytics/measurement-report":{summarizeOperationalContacts,summarizeConsentReceipts,summarizeContactCampaigns}})[name],Date:class extends Date {static now(){return now;}},Set,Promise});
 const result=await moduleBox.exports.getAdminMeasurement("all");
 expect(result.operations?.conversations).toBe(1);
 for(const query of queries) expect(query.columns).not.toMatch(/\b(body|last_message|payload|email|phone|full_name)\b/);
 expect(queries.find(q=>q.table==="growth_conversion_events")?.filters).toContainEqual(["is_baseline",false]);
 unavailable="direct_messages";const partial=await moduleBox.exports.getAdminMeasurement("week");expect(partial.operations).toBeNull();expect(partial.consent).not.toBeNull();
 unavailable="profiles";expect(await moduleBox.exports.getAdminMeasurement("week")).toEqual({period:"week",operations:null,consent:null,campaigns:null});
});
