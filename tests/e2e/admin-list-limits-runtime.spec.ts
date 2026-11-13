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
function setup(size = 1203, options: { authorized?: boolean; failTable?: string; failAfter?: number; heldTable?: string } = {}) {
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
    interaction_events: base.map(row => ({ ...row, event_type: "whatsapp_click", source: "search", category_id: "service", metadata: {} })),
    projects: base.map(row => ({ ...row, title: row.name, status: "open", client_id: row.id })),
    provider_verification_log: [], provider_appeals: [], user_action_audit: [],
  };
  const db = { from(table: string) {
    const filters: ((r: any) => boolean)[] = []; let start=0, end=999, single=false, counted=false, head=false; let patch: any=null;
    const value = (r: any, key: string) => key.includes("->>") ? r[key.split("->>")[0]]?.[key.split("->>")[1]] : r[key];
    const q: any = {
      select: (_s: string, opts?: any) => { counted=!!opts?.count;head=!!opts?.head;return q; },
      order: () => q,
      update: (v: any) => { patch=v; return q; },
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
        if(patch){const blocked=options.heldTable===table;if(!blocked)selected.forEach(r=>Object.assign(r,patch));return Promise.resolve({data:null,error:blocked?{message:"held",code:"42501"}:null}).then(resolve);}
        const fail=options.failTable===table && start>=(options.failAfter??0);
        return Promise.resolve({data:fail||head?null:single?selected[0]??null:selected.slice(start,end+1),count:counted?selected.length:null,error:fail?{message:"Database unavailable",code:"57014"}:null}).then(resolve);
      },
    };return q;
  },rpc: async (): Promise<{data:any;error:any}> => ({data:null,error:null}), auth:{admin:{ listUsers: async ({page,perPage}: any) => ({data:{users:base.slice((page-1)*perPage,page*perPage).map(row=>({id:row.id,user_metadata:{}}))},error:null})}} };
  const mocks = {
    "next-intl/server": {getTranslations: async ({locale,namespace}: {locale:string;namespace:string}) => {
      const messages=JSON.parse(readFileSync(`messages/${locale}.json`,"utf8"));
      return (key:string)=>messages[namespace][key];
    }},
    "@/lib/admin/read-all-rows":paging,
    "@/lib/admin/publication-stats":load("src/lib/admin/publication-stats.ts",{"@/lib/admin/read-all-rows":paging}),
    "@/lib/admin/publication-edit":load("src/lib/admin/publication-edit.ts"),
    "@/lib/audit/user-action":{auditUserAction:async(_db:any,_req:any,input:any)=>{tables.user_action_audit.push(input);}},
    "@/lib/prefijo-de-idioma":{rutasDeCache:(locale:string,path:string)=>[`/${locale}${path}`]},
    "next/cache":{revalidatePath:()=>{}},
    "@/lib/analytics/self-interaction":load("src/lib/analytics/self-interaction.ts"),
    "@/lib/analytics/contact-segments":load("src/lib/analytics/contact-segments.ts"),
    "@/lib/auth/admin":{getApiAdmin:async()=>options.authorized===false?null:{id:"admin"}},
    "@/lib/moderation/admin":{getModerationAdmin:async()=>options.authorized===false?null:{id:"admin"},getIdentityAdmin:async()=>options.authorized===false?null:{id:"admin"},getSupportAdmin:async()=>options.authorized===false?null:{id:"admin"},moderationAccess:async()=>options.authorized===false?null:{admin:{id:"admin"},db}},
    "@/lib/supabase/admin":{createAdminClient:()=>db},
    "@/lib/data/categories":{ALL_CATEGORIES:[],CATEGORY_GROUPS:[],getCategoryLabel:(id:string)=>id,autoEnglishCategoryLabel:(s:string)=>s},
    "@/lib/data/cr-geography":geography,
    "@/lib/marketplace-url":{rutaEmpleo:(id:string)=>`/empleos/${id}`,rutaPromocion:(id:string)=>`/promociones/${id}`},
    "@/lib/moderation/reviews":{validateReviewText:()=>({ok:true})},
    "@/lib/cache/professional-revision":{invalidateProfessionalCache:async()=>{}},
    "@/lib/support/current-names":{withCurrentSupportNames:async(_db:any,tickets:any,messages:any=[])=>({tickets,messages})},
    "@/lib/support/adjuntos":{firmarAdjuntos:async(_db:any,rows:any)=>rows},
    "@/lib/profiles/current-names":{getCurrentProfileNames:async()=>new Map()},
  };
  return {tables,db,mocks,route:(file:string)=>load(`src/app/api/admin/${file}/route.ts`,mocks)};
}
for (const [route, field, badge] of [["insurers","insurers","pendingCount"],["categories","categories","pendingCount"],["support","tickets","needsAttention"],["accounts","accounts",null]] as const) {
  test(`${route} list includes every match beyond the default cap and agrees with its counter`,async()=>{
    const s=setup();const response=await s.route(route).GET(new Request(`https://example.test/api/admin/${route}`));
    expect(response.status).toBe(200);const data=await response.json();expect(data[field]).toHaveLength(1203);
    if(badge)expect(data[badge]).toBe(1203);
  });
}
test("report pages and total reach beyond 1000 without truncating the queue",async()=>{
 const s=setup();const route=s.route("reports");
 const first=await(await route.GET(new Request("https://example.test/api/admin/reports?offset=0"))).json();
 expect(first.total).toBe(1203);expect(first.reports).toHaveLength(50);expect(first.reports[0].id).toBe("id-000000");
 const last=await(await route.GET(new Request("https://example.test/api/admin/reports?offset=1200"))).json();
 expect(last.total).toBe(1203);expect(last.reports).toHaveLength(3);expect(last.reports[2].id).toBe("id-001202");
});
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
test("administrative publication lists distinguish active moderation holds from ordinary pauses",async()=>{
 const s=setup(3);
 s.tables.moderation_holds=[{target_type:'job',target_id:'id-000000',active:true},{target_type:'offer',target_id:'id-000001',active:true},{target_type:'project',target_id:'id-000002',active:true},{target_type:'job',target_id:'id-000001',active:false}];
 for(const [kind,held] of [['jobs','id-000000'],['offers','id-000001']]){
  const data=await(await s.route('marketplace').GET(new Request(`https://example.test/api/admin/marketplace?kind=${kind}`))).json();
  expect(data.items.filter((r:any)=>r.moderationHidden).map((r:any)=>r.id)).toEqual([held]);expect(data.counts.all).toBe(3);
 }
 const projects=await(await s.route('projects').GET(new Request('https://example.test/api/admin/projects'))).json();
 expect(projects.projects.filter((r:any)=>r.moderationHidden).map((r:any)=>r.id)).toEqual(['id-000002']);
 const unavailable=setup(3,{failTable:'moderation_holds'});
 expect((await unavailable.route('marketplace').GET(new Request('https://example.test/api/admin/marketplace?kind=jobs'))).status).toBe(503);
 expect((await unavailable.route('projects').GET(new Request('https://example.test/api/admin/projects'))).status).toBe(503);
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
  expect(data.projects.find((row:any)=>row.id==='id-000000').stats.whatsapp.clicks).toBe(1203);
});
test("admin edit history is complete beyond the former 50-row cutoff",async()=>{
  const s=setup();s.tables.user_action_audit=s.tables.profiles.map(row=>({...row,entity_owner_user_id:'owner',action:'admin_edit_user_data',actor_user_id:null}));
  const response=await s.route('users/[id]/datos').GET(new Request('https://example.test'),{params:Promise.resolve({id:'owner'})});
  expect(response.status).toBe(200);expect((await response.json()).historial).toHaveLength(1203);
});

test("overview and reports separate employment from services beyond the default page cap",async()=>{
  const s=setup();
  s.tables.interaction_events.forEach((e,i)=>{e.source=i<1001?'jobs':'search';e.professional_id='recipient';e.visitor_hash=`visitor-${i}`;});
  const overview=await load('src/lib/admin/overview.ts',s.mocks).getAdminOverview();
  expect(overview.servicios.value).toBe(202);expect(overview.empleos.value).toBe(1001);
  const report=await load('src/lib/admin/reports.ts',s.mocks).getAdminReports();
  expect(report.insights.week.contacts.now).toBe(202);
  expect(report.contactBreakdown.last30.services.clicks).toBe(202);
  expect(report.contactBreakdown.last30.jobs.clicks).toBe(1001);
  const route=s.route('contactos');
  expect((await (await route.GET(new Request('https://example.test/api/admin/contactos'))).json()).total).toBe(202);
  expect((await (await route.GET(new Request('https://example.test/api/admin/contactos?segmento=jobs'))).json()).total).toBe(1001);
});
test("admin and self interactions are excluded while uncertain history remains visible separately",async()=>{
  const s=setup(5);
  s.tables.profiles[0].role='admin';
  const [admin,self,job,unknown,service]=s.tables.interaction_events;
  Object.assign(admin,{viewer_user_id:s.tables.profiles[0].id});
  Object.assign(self,{viewer_user_id:s.tables.profiles[1].id,professional_id:s.tables.professionals[1].id});
  Object.assign(job,{metadata:{jobId:'job'},professional_id:'recipient'});
  Object.assign(unknown,{source:'unknown',professional_id:'recipient'});
  Object.assign(service,{professional_id:'recipient'});
  const report=await load('src/lib/admin/reports.ts',s.mocks).getAdminReports();
  expect(report.contactBreakdown.last30.services.clicks).toBe(1);
  expect(report.contactBreakdown.last30.jobs.clicks).toBe(1);
  expect(report.contactBreakdown.last30.unknown.clicks).toBe(1);
});
test("contact segmentation stays admin-only and missing hire history is not shown as zero",async()=>{
  const denied=setup(1,{authorized:false});
  expect((await denied.route('contactos').GET(new Request('https://example.test/api/admin/contactos'))).status).toBe(403);
  const s=setup(1,{failTable:'growth_conversion_events'});
  const report=await load('src/lib/admin/reports.ts',s.mocks).getAdminReports();
  expect(report.contactBreakdown.declaredHires30).toBeNull();
  expect((await s.route('contactos').GET(new Request('https://example.test/api/admin/contactos?segmento=invalid'))).status).toBe(400);
});

test('admin history includes old events without relabeling 7/30-day contacts',async()=>{
  const s=setup(3);
  const old=new Date(Date.now()-200*86400000).toISOString();
  for(const row of s.tables.interaction_events) {row.event_type='search_performed';row.metadata={q:'electricidad',results:1};}
  s.tables.interaction_events[0].created_at=old;
  s.tables.profiles[0].created_at=old;
  s.tables.profiles.push({id:'old-client-only',role:'client',created_at:old,acquisition_source:null});
  s.tables.professionals[0].created_at=old;
  const rpcCalls:any[]=[];
  s.db.rpc=async(...args:any[])=>{rpcCalls.push(args);return{data:null,error:null};};
  const reports=load('src/lib/admin/reports.ts',s.mocks);
  const week=await reports.getAdminReports('es','week');
  const all=await reports.getAdminReports('es','all');
  expect(week.insights.week.searches.now).toBe(2);
  expect(all.insights.week.searches.now).toBe(3);
  expect(all.insights.week.pros.now).toBe(3);
  expect(week.insights.week.clients.now).toBe(0);
  expect(all.insights.week.clients.now).toBe(1);
  expect(all.insights.week.searches.prev).toBe(0);
  expect(all.insights.searchQuality.total).toBe(3);
  expect(all.analyticsAvailable).toBe(true);
  expect(all.contactBreakdown.allTime).toBeTruthy();
  expect(rpcCalls).toContainEqual(['get_admin_runtime_analytics',{p_days:0}]);
  expect(rpcCalls).toContainEqual(['get_admin_runtime_analytics',{p_days:7}]);
});
test('@contract admin all-time RPCs preserve permissions and retained history',async()=>{
  const {execFileSync}=await import('node:child_process');
  const output=execFileSync(process.execPath,['scripts/verify-admin-analytics-history.mjs'],{encoding:'utf8',timeout:25000});
  expect(output).toContain('PASS:');
});
test('activity history accepts all-time only behind the existing admin gate',async()=>{
  const {NextRequest}=nativeRequire('next/server');
  const denied=setup(1,{authorized:false});
  expect((await denied.route('analytics/activity').GET(new NextRequest('https://example.test/api/admin/analytics/activity?days=0'))).status).toBe(403);
  const s=setup(1),calls:any[]=[];
  s.db.rpc=async(...args:any[])=>{calls.push(args);return{data:[],error:null};};
  const route=s.route('analytics/activity');
  expect((await route.GET(new NextRequest('https://example.test/api/admin/analytics/activity?days=0'))).status).toBe(200);
  expect(calls[0][0]).toBe('admin_activity_journey');expect(calls[0][1].p_days).toBe(0);
  expect((await route.GET(new NextRequest('https://example.test/api/admin/analytics/activity?days=999'))).status).toBe(400);
});

test('own profile exclusion preserves legitimate project replies and quotes in all-time reports',async()=>{
  const s=setup(3);
  const [view,lead,quote]=s.tables.interaction_events;
  for(const row of [view,lead,quote])Object.assign(row,{viewer_user_id:s.tables.profiles[0].id,professional_id:s.tables.professionals[0].id});
  view.event_type='profile_view';
  lead.event_type='project_lead_whatsapp';lead.source='project';lead.metadata={projectId:'another-clients-project'};
  quote.event_type='quote_created';
  const report=await load('src/lib/admin/reports.ts',s.mocks).getAdminReports('es','all');
  expect(report.insights.funnel.profileViews).toBe(0);
  expect(report.insights.week.projectLeads.now).toBe(1);
  expect(report.insights.week.quotes.now).toBe(1);
  expect(report.contactBreakdown.allTime.projects.clicks).toBe(1);
});

test("job and offer rows show WhatsApp clicks, distinct people and views instead of applications",async()=>{
  const s=setup(3);
  let n=0;const ev=(event_type:string,metadata:any,visitor_hash:string)=>({id:`ev-${n++}`,event_type,metadata,visitor_hash,created_at:new Date().toISOString()});
  s.tables.interaction_events=[
    ev('whatsapp_click',{jobId:'id-000000'},'a'),ev('whatsapp_click',{jobId:'id-000000'},'a'),ev('whatsapp_click',{jobId:'id-000000'},'b'),
    ev('job_view',{jobId:'id-000000'},'c'),ev('whatsapp_click',{offerId:'id-000000'},'d'),ev('whatsapp_click',{},'e'),
    ev('offer_view',{offerId:'id-000001'},'f'),ev('whatsapp_click',{offerId:'id-000001'},'f'),
  ];
  const jobs=await(await s.route('marketplace').GET(new Request('https://example.test/api/admin/marketplace?kind=jobs'))).json();
  const job=jobs.items.find((r:any)=>r.id==='id-000000');
  expect(job.applications).toBeUndefined();
  expect(job.stats).toEqual({views:1,whatsapp:{clicks:3,people:2},phone:{clicks:0,people:0}});
  expect(jobs.items.find((r:any)=>r.id==='id-000001').stats.whatsapp.clicks).toBe(0);
  const offers=await(await s.route('marketplace').GET(new Request('https://example.test/api/admin/marketplace?kind=offers'))).json();
  expect(offers.items.find((r:any)=>r.id==='id-000000').stats.whatsapp).toEqual({clicks:1,people:1});
  expect(offers.items.find((r:any)=>r.id==='id-000001').stats).toEqual({views:1,whatsapp:{clicks:1,people:1},phone:{clicks:0,people:0}});
});

test("project rows count WhatsApp and phone contacts and views under both metadata keys",async()=>{
  const s=setup(2);
  s.tables.interaction_events=[
    {id:'p1',event_type:'project_lead_whatsapp',metadata:{project_id:'id-000001'},viewer_user_id:'pro-1'},
    {id:'p2',event_type:'project_lead_whatsapp',metadata:{project_id:'id-000001'},viewer_user_id:'pro-2'},
    {id:'p3',event_type:'project_lead_phone',metadata:{project_id:'id-000001'},viewer_user_id:'pro-1'},
    {id:'p4',event_type:'project_view',metadata:{projectId:'id-000001'},visitor_hash:'v'},
  ];
  const data=await(await s.route('projects').GET(new Request('https://example.test/api/admin/projects'))).json();
  expect(data.projects.find((r:any)=>r.id==='id-000001').stats).toEqual({views:1,whatsapp:{clicks:2,people:2},phone:{clicks:1,people:1}});
});

const editRequest=(body:any,origin='https://example.test')=>new Request('https://example.test/api/admin/publication-edit',{method:'PATCH',headers:{'Content-Type':'application/json',origin},body:JSON.stringify(body)});
const jobId='00000000-0000-4000-8000-000000000001';
test("an administrator corrects a job title and the change is audited with the previous text",async()=>{
  const s=setup(1);
  s.tables.job_posts=[{id:jobId,title:'Ayudannte',description:'Se busca ayudante para obra en Alajuela, jornada completa.',employer_id:'id-000000',status:'published'}];
  const route=s.route('publication-edit');
  const res=await route.PATCH(editRequest({kind:'job',id:jobId,title:'  Ayudante   de construcción ',description:s.tables.job_posts[0].description}));
  expect(res.status).toBe(200);
  expect(await res.json()).toMatchObject({id:jobId,title:'Ayudante de construcción'});
  expect(s.tables.job_posts[0].title).toBe('Ayudante de construcción');
  const audit=s.tables.user_action_audit.at(-1);
  expect(audit).toMatchObject({action:'job.admin_edit',entityTable:'job_posts',entityId:jobId,entityOwnerUserId:'id-000000',beforeData:{title:'Ayudannte'},afterData:{title:'Ayudante de construcción'}});
});
test("publication edits are validated, restricted to moderators and refused for held content",async()=>{
  const s=setup(1);
  s.tables.job_posts=[{id:jobId,title:'Ayudannte',description:'Se busca ayudante para obra en Alajuela, jornada completa.',employer_id:'id-000000'}];
  const route=s.route('publication-edit');
  const ok={kind:'job',id:jobId,title:'Ayudante de construcción',description:s.tables.job_posts[0].description};
  expect((await route.PATCH(editRequest({...ok,title:'A'}))).status).toBe(400);
  expect((await route.PATCH(editRequest({...ok,description:'corta'}))).status).toBe(400);
  expect((await route.PATCH(editRequest({...ok,kind:'review'}))).status).toBe(400);
  expect((await route.PATCH(editRequest({...ok,id:'no-es-uuid'}))).status).toBe(400);
  expect((await route.PATCH(editRequest(ok,'https://evil.test'))).status).toBe(403);
  expect((await route.PATCH(editRequest({...ok,id:'00000000-0000-4000-8000-000000000009'}))).status).toBe(404);
  expect(s.tables.job_posts[0].title).toBe('Ayudannte');
  expect((await setup(1,{authorized:false}).route('publication-edit').PATCH(editRequest(ok))).status).toBe(403);
  const held=setup(1,{heldTable:'job_posts'});held.tables.job_posts=[{...s.tables.job_posts[0]}];
  expect((await held.route('publication-edit').PATCH(editRequest(ok))).status).toBe(409);
  expect(held.tables.user_action_audit).toHaveLength(0);
});
