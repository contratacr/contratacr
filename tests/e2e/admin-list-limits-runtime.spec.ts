/* eslint-disable @typescript-eslint/no-explicit-any -- Runtime route exports and a PostgREST double with the real default row cap. */
import { test, expect } from "playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { runInNewContext } from "node:vm";
import ts from "typescript";
const nativeRequire = createRequire(`${process.cwd()}/tests/e2e/admin-list-limits-runtime.spec.ts`);
function load(path: string, mocks: Record<string, any> = {}) {
  const box = { exports: {} as Record<string, any> };
  runInNewContext(ts.transpileModule(readFileSync(path, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText,
    { module: box, exports: box.exports, require: (id: string) => mocks[id] ?? (id.startsWith("@/") ? {} : nativeRequire(id)), Request, Response, URL, Date, console });
  return box.exports;
}
const paging = load("src/lib/admin/read-all-rows.ts");
const geography = load("src/lib/data/cr-geography.ts");
function setup(size = 1203, options: { authorized?: boolean; failTable?: string; failAfter?: number } = {}) {
  const now = new Date(Date.now() - 3600_000).toISOString();
  const base = Array.from({ length: size }, (_, i) => ({ id: `id-${String(i).padStart(6,"0")}`, created_at: now, name: i === size-1 ? "needle-last" : `Item ${i}` }));
  const tables: Record<string, any[]> = {
    profiles: base.map(row => ({ ...row, full_name: row.name, role: "client", is_disabled: true, client_identity_status: "verified", professionals: [], acquisition_source: null })),
    professionals: base.map(row => ({ ...row, profile_id: row.id, business_name: row.name, profiles: { id: row.id, full_name: row.name }, verification_status: row.id === base.at(-1)!.id ? "pending" : "verified", category_id: "service", professions: [], services: [], provincia_id: "al", canton_id: "al-at" })),
    categories: base.map(row => ({ ...row, name_en: row.name, group_id: "other" })), category_groups: [],
    category_suggestions: base.map(row => ({ ...row, status: "pending", suggested_by: row.id })),
    reports: base.map(row => ({ ...row, status: "open", professional_id: row.id })),
    insurers: base.map(row => ({ ...row, status: "pending" })),
    reviews: base.map(row => ({ ...row, professional_id: row.id, client_id: row.id, rating: 5, comment: row.name, moderation_status: "published" })),
    job_posts: base.map(row => ({ ...row, title: row.name, employer_id: row.id, status: "published" })),
    professional_offers: base.map(row => ({ ...row, title: row.name, professional_id: row.id, status: "published" })),
    support_tickets: base.map(row => ({ ...row, status: "open", user_id: row.id, last_reply_role: "user" })),
    support_ticket_messages: base.map(row => ({ ...row, ticket_id: "ticket", sender_role: "user" })),
    account_deletion_requests: base.map(row => ({ ...row, status: "pending", user_id: row.id })),
    interaction_events: base.map(row => ({ ...row, event_type: "whatsapp_click", category_id: "service", metadata: {} })),
    projects: base.map(row => ({ ...row, title: row.name, status: "open", client_id: row.id })),
    provider_verification_log: [], provider_appeals: [], user_action_audit: [],
  };
  const db = { from(table: string) {
    const filters: ((r: any) => boolean)[] = []; let start=0, end=999, single=false, counted=false, head=false;
    const value = (r: any, key: string) => key.includes("->>") ? r[key.split("->>")[0]]?.[key.split("->>")[1]] : r[key];
    const q: any = {
      select: (_s: string, opts?: any) => { counted=!!opts?.count;head=!!opts?.head;return q; },
      order: () => q,
      range: (from: number, to: number) => { start=from;end=Math.min(to,from+999);return q; },
      limit: (n: number) => { start=0;end=Math.min(n,1000)-1;return q; },
      eq: (key: string, v: any) => {filters.push(r=>value(r,key)===v);return q;},
      neq: (key: string,v: any) => {filters.push(r=>value(r,key)!==v);return q;},
      in: (key: string, ids: any[]) => {filters.push(r=>ids.includes(value(r,key)));return q;},
      gte: (key: string,v: any) => {filters.push(r=>value(r,key)>=v);return q;},
      lte: (key: string,v: any) => {filters.push(r=>value(r,key)<=v);return q;},
      is: () => q, not: () => q, or: () => q,
      single: () => {single=true;return q;},maybeSingle: () => {single=true;return q;},
      then(resolve: any) {
        const selected=(tables[table]??[]).filter(r=>filters.every(f=>f(r)));
        const fail=options.failTable===table && start>=(options.failAfter??0);
        return Promise.resolve({data:fail||head?null:single?selected[0]??null:selected.slice(start,end+1),count:counted?selected.length:null,error:fail?{message:"Database unavailable",code:"57014"}:null}).then(resolve);
      },
    };return q;
  },rpc: async () => ({data:null,error:null}), auth:{admin:{ listUsers: async ({page,perPage}: any) => ({data:{users:base.slice((page-1)*perPage,page*perPage).map(row=>({id:row.id,user_metadata:{}}))},error:null})}} };
  const mocks = {
    "next-intl/server": {getTranslations: async ({locale,namespace}: {locale:string;namespace:string}) => {
      const messages=JSON.parse(readFileSync(`messages/${locale}.json`,"utf8"));
      return (key:string)=>messages[namespace][key];
    }},
    "@/lib/admin/read-all-rows":paging,
    "@/lib/auth/admin":{getApiAdmin:async()=>options.authorized===false?null:{id:"admin"}},
    "@/lib/supabase/admin":{createAdminClient:()=>db},
    "@/lib/data/categories":{ALL_CATEGORIES:[],CATEGORY_GROUPS:[],getCategoryLabel:(id:string)=>id,autoEnglishCategoryLabel:(s:string)=>s},
    "@/lib/data/cr-geography":geography,
    "@/lib/marketplace-url":{rutaEmpleo:(id:string)=>`/empleos/${id}`,rutaPromocion:(id:string)=>`/promociones/${id}`},
    "@/lib/moderation/reviews":{validateReviewText:()=>({ok:true})},
    "@/lib/support/current-names":{withCurrentSupportNames:async(_db:any,tickets:any,messages:any=[])=>({tickets,messages})},
    "@/lib/support/adjuntos":{firmarAdjuntos:async(_db:any,rows:any)=>rows},
    "@/lib/profiles/current-names":{getCurrentProfileNames:async()=>new Map()},
  };
  return {tables,db,mocks,route:(file:string)=>load(`src/app/api/admin/${file}/route.ts`,mocks)};
}
for (const [route, field, badge] of [["reports","reports","openCount"],["insurers","insurers","pendingCount"],["categories","categories","pendingCount"],["support","tickets","needsAttention"],["accounts","accounts",null]] as const) {
  test(`${route} list includes every match beyond the default cap and agrees with its counter`,async()=>{
    const s=setup();const response=await s.route(route).GET(new Request(`https://example.test/api/admin/${route}`));
    expect(response.status).toBe(200);const data=await response.json();expect(data[field]).toHaveLength(1203);
    if(badge)expect(data[badge]).toBe(1203);
  });
}
test("all support messages remain available beyond the database cap",async()=>{
  const s=setup();const response=await s.route('support').GET(new Request('https://example.test/api/admin/support?id=does-not-exist'));
  // Missing tickets do not imply that an unrelated thread can be read.
  expect((await response.json()).messages).toHaveLength(0);
  const full=await s.route('support').GET(new Request('https://example.test/api/admin/support?id=ticket'));
  expect((await full.json()).messages).toHaveLength(1203);
});
test("review search can find older reviews after 500 and 1000 records",async()=>{
  const s=setup();const route=s.route('reviews');const all=await (await route.GET(new Request('https://example.test/api/admin/reviews'))).json();expect(all.counts.total).toBe(1203);expect(all.pagination.total).toBe(1203);expect(all.reviews).toHaveLength(50);
  const found=await (await route.GET(new Request('https://example.test/api/admin/reviews?q=needle-last'))).json();expect(found.reviews).toHaveLength(1);expect(found.reviews[0].professional.name).toBe('needle-last');
});
for(const kind of ['jobs','offers'])test(`${kind} filters and pages use all records`,async()=>{
  const s=setup();const route=s.route('marketplace');const all=await (await route.GET(new Request(`https://example.test/api/admin/marketplace?kind=${kind}`))).json();expect(all.counts.all).toBe(1203);
  const found=await (await route.GET(new Request(`https://example.test/api/admin/marketplace?kind=${kind}&q=needle-last`))).json();expect(found.items).toHaveLength(1);
});
test("coverage includes every matching professional beyond its old 300-row cutoff",async()=>{
  const s=setup();const data=await (await s.route('coverage').GET(new Request('https://example.test/api/admin/coverage?service=service'))).json();expect(data.totals.professionals).toBe(1203);expect(data.professionals).toHaveLength(1203);expect(data.filter.total).toBe(1203);
});
test("overview contacts and analytics search quality include events after 1000",async()=>{
  const s=setup();const overview=await load('src/lib/admin/overview.ts',s.mocks).getAdminOverview();expect(overview.servicios.value).toBe(1203);
  s.tables.interaction_events.forEach(row=>{row.event_type='search_performed';row.metadata={results_count:0,term:row.name};});
  const report=await load('src/lib/admin/reports.ts',s.mocks).getAdminReports();expect(report.users.total).toBe(1203);expect(report.pros.total).toBe(1203);expect(report.insights.searchQuality.total).toBe(1203);
});
test("users and projects no longer stop silently at 10000 rows",async()=>{
  const s=setup(10003);const users=await (await s.route('users').GET(new Request('https://example.test/api/admin/users?mode=list&page=401'))).json();expect(users.counts.all).toBe(10003);expect(users.pagination.total).toBe(10003);
  const projects=await (await s.route('projects').GET(new Request('https://example.test/api/admin/projects?page=401'))).json();expect(projects.counts.all).toBe(10003);
});
test("a failed later page produces an error instead of a misleading partial list",async()=>{
  const s=setup(1203,{failTable:'support_tickets',failAfter:500});expect((await s.route('support').GET(new Request('https://example.test/api/admin/support'))).status).toBe(500);
});
test("complete queue reads remain restricted to administrators",async()=>{
  const s=setup(1203,{authorized:false});for(const name of ['reports','insurers','categories','support','accounts','reviews','marketplace','coverage','users','projects'])expect((await s.route(name).GET(new Request(`https://example.test/api/admin/${name}`))).status).toBe(403);
});


for (const locale of ["es","en"]) test(`overview pending count deduplicates reviews and translates client labels (${locale})`,async()=>{
  const s=setup(3);
  s.tables.professionals[0].verification_status="unverified";
  s.tables.professionals[1].verification_status="under_appeal";
  s.tables.professionals[2].verification_status="verified";
  s.tables.profiles[1].client_identity_status="pending";
  s.tables.profiles.push({id:"client-only",role:"client",client_identity_status:"pending",created_at:new Date().toISOString(),full_name:"Pending client"});
  const overview=await load('src/lib/admin/overview.ts',s.mocks).getAdminOverview(locale);
  expect(overview.pending.find((row:any)=>row.id==='client-only').category).toBe(locale==='en'?'Client':'Cliente');
  expect(overview.pendingCount).toBe(2);expect(overview.pending.map((row:any)=>row.id).sort()).toEqual(['client-only','id-000001']);
});

test("project contact counts include every matching event beyond the first page",async()=>{
  const s=setup();s.tables.interaction_events.forEach(row=>{row.event_type='project_lead_whatsapp';row.metadata={project_id:'id-000000'};});
  const data=await (await s.route('projects').GET(new Request('https://example.test/api/admin/projects'))).json();
  expect(data.projects.find((row:any)=>row.id==='id-000000').contactos).toBe(1203);
});
test("admin edit history is complete beyond the former 50-row cutoff",async()=>{
  const s=setup();s.tables.user_action_audit=s.tables.profiles.map(row=>({...row,entity_owner_user_id:'owner',action:'admin_edit_user_data',actor_user_id:null}));
  const response=await s.route('users/[id]/datos').GET(new Request('https://example.test'),{params:Promise.resolve({id:'owner'})});
  expect(response.status).toBe(200);expect((await response.json()).historial).toHaveLength(1203);
});
