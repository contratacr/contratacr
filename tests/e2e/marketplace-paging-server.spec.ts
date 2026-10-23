import { test,expect } from "playwright/test";
import { canRunSeededRegression,regressionAdminClient } from "./seed";
import { createDisposableAccount,cleanupDisposableAccount,type DisposableAccount } from "./disposable-account";
import { gotoOK,waitForInteractivePage,loginAs } from "./helpers";

let account:DisposableAccount|undefined;
let namespace="";
const ids:Record<string,string[]>={proyectos:[],promociones:[],empleos:[]};
test.beforeAll(async()=>{
  test.setTimeout(180000);if(!canRunSeededRegression())return;
  account=await createDisposableAccount({prefix:"marketplace-paging",professional:true,publicDiscoverable:true});
  namespace=`ZqxFeed${crypto.randomUUID().replace(/[^a-z]/gi,'')}`;
  const db=regressionAdminClient();const now=Date.now()-60000;
  const common=Array.from({length:125},(_,i)=>({title:`${namespace} ${i>=120?'Latehit':'Publicación'} ${i}`,description:`${namespace} Descripción de prueba de una publicación con suficiente detalle.`,created_at:new Date(now-i*1000).toISOString()}));
  const projectRows=common.map(row=>({...row,client_id:account!.id,category_id:'redes_internet',provincia_id:'al',canton_id:'al-al',status:'open',allow_direct_contact:true,allow_phone_contact:false}));
  const offerRows=common.map(row=>({...row,professional_id:account!.professionalId,offer_type:'service_offer',image_urls:['https://assets.contratacr.com/test-paging.png'],price_now:10000,price_unit:'total',currency:'CRC',status:'published',contact_whatsapp:'+50670005555'}));
  const jobRows=common.map(row=>({...row,employer_id:account!.professionalId,employment_type:'full_time',workplace_type:'remote',experience_level:'any',currency:'CRC',salary_period:'monthly',status:'published',contact_whatsapp:'+50670005555'}));
  for(const [section,table,rows] of [['proyectos','projects',projectRows],['promociones','professional_offers',offerRows],['empleos','job_posts',jobRows]] as const){const {data}=await db.from(table).insert([...rows]).select('id,title').throwOnError();ids[section]=common.map(row=>data!.find(item=>item.title===row.title)!.id);}
});
test.afterAll(async()=>{test.setTimeout(120000);if(account)await cleanupDisposableAccount(account);});

for(const section of ['proyectos','promociones','empleos'] as const){
  test(`${section}: real API has no hundred-row cutoff and filters across all pages`,async({request})=>{
    test.skip(!canRunSeededRegression(),'Requires isolated TEST fixtures.');test.setTimeout(120000);
    let cursor:string|null=null;let asOf:string|undefined;const seen:string[]=[];
    do{
      const params=new URLSearchParams({section,q:namespace,locale:'es'});if(cursor)params.set('cursor',cursor);if(asOf)params.set('asOf',asOf);
      const response=await request.get('/api/marketplace/results?'+params);expect(response.status()).toBe(200);const page=await response.json();expect(page.items.length).toBeLessThanOrEqual(20);expect(page.total).toBe(125);asOf=page.asOf;cursor=page.nextCursor;seen.push(...page.items.map((row:{id:string})=>row.id));
      expect(JSON.stringify(page.items)).not.toContain('70005555');expect(page.items.every((row:Record<string,unknown>)=>!row.contact_whatsapp&&!row.client_id&&!row.professionals)).toBe(true);
    }while(cursor);
    expect(seen).toHaveLength(125);expect(new Set(seen).size).toBe(125);expect(seen).toEqual(ids[section]);
    const response=await request.get('/api/marketplace/results?'+new URLSearchParams({section,q:namespace+' Latehit',locale:'es'}));const filtered=await response.json();expect(filtered.total).toBe(5);expect(filtered.items).toHaveLength(5);expect(filtered.nextCursor).toBeNull();
  });
  test(`${section}: real board keeps twenty visible while the next page waits`,async({page,context,baseURL,isMobile})=>{
    test.skip(!canRunSeededRegression(),'Requires isolated TEST fixtures.');test.setTimeout(120000);
    if(isMobile){await context.addCookies([{name:'ccr_platform',value:'native',url:baseURL!}]);await page.addInitScript(()=>localStorage.setItem('ccr:native-first-run-onboarding:v12','1'));}
    let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let requests=0;
    await page.route('**/api/marketplace/results?*',async route=>{requests++;const response=await route.fetch();await gate;await route.fulfill({response});});
    await page.route('https://assets.contratacr.com/test-paging.png',route=>route.fulfill({contentType:'image/svg+xml',body:'<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48"/>'}));
    try{
      await gotoOK(page,`/${section}?q=${namespace}`);await waitForInteractivePage(page);
      const rows=page.locator(`[data-marketplace-row="${section}"]`);await expect(rows).toHaveCount(20);expect(requests).toBe(0);
      await page.locator('[data-marketplace-sentinel]').scrollIntoViewIfNeeded();await expect.poll(()=>requests).toBe(1);await expect(page.locator('[data-marketplace-skeleton]')).toBeVisible();await expect(rows).toHaveCount(20);release();await expect(rows).toHaveCount(40);await expect(page.locator('[data-marketplace-skeleton]')).toHaveCount(0);await expect(page.locator('[data-contact-pending]').filter({visible:true})).toHaveCount(0);
    }finally{release();await page.unrouteAll({behavior:'wait'});}
  });
}

test('shared links can select a publication beyond the first hundred',async({page,request})=>{
  test.skip(!canRunSeededRegression(),'Requires isolated TEST fixtures.');test.setTimeout(120000);
  for(const section of ['promociones','empleos'] as const){const id=ids[section][124];const response=await request.get('/api/marketplace/results?'+new URLSearchParams({section,q:namespace,selected:id}));const body=await response.json();expect(body.selected.id).toBe(id);expect(body.items.map((i:{id:string})=>i.id)).not.toContain(id);}
  for(const section of ['empleos','proyectos'] as const){await gotoOK(page,`/${section}/${ids[section][124]}`);await expect(page.getByText(`${namespace} Latehit 124`,{exact:true}).filter({visible:true}).first()).toBeVisible();}
});

test('owner editing keeps its publication contact private from anonymous lists',async({page})=>{
  test.skip(!canRunSeededRegression(),'Requires isolated TEST fixtures.');test.setTimeout(120000);
  await loginAs(page,account!.email,account!.password);
  for(const section of ['promociones','empleos'] as const){const response=await page.request.get('/api/marketplace/results?'+new URLSearchParams({section,q:namespace}));expect(response.ok()).toBe(true);const data=await response.json();expect(data.items[0].contact_whatsapp).toBe('+50670005555');}
});
