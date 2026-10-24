import { test, expect } from 'playwright/test';
import { nearbyContext, nearbyRank, compareNearby } from '@/lib/search/nearby';
import { locationDecisions, ordenFinal, type SearchResult, type SearchFiltersResolved } from '@/lib/search/query-core';
import boundaries from '@/lib/data/cr-canton-boundaries.json';
import { PROVINCES } from '@/lib/data/cr-geography';
const atenas=nearbyContext(9.98,-84.38)!;
const pro=(id:string,fields:Partial<SearchResult>)=>({id,ratingAvg:0,reviewCount:0,...fields}) as SearchResult;
test('national geometry resolves real canton boundaries, including rural areas and new cantons',()=>{
 expect(boundaries).toHaveLength(PROVINCES.flatMap(p=>p.cantons).length);
 expect(new Set(boundaries.map(c=>c.id)).size).toBe(84);
 for(const c of boundaries)expect(PROVINCES.find(p=>p.id===c.provinceId)?.cantons.some(x=>x.id===c.id)).toBe(true);
 expect(atenas.canton.id).toBe('al-at');
 expect(nearbyContext(10.635,-85.437)?.canton.id).toBe('gu-li');
 expect(nearbyContext(8.538,-83.305)?.canton.id).toBe('pu-pj');
 expect(nearbyContext(10.315,-84.825)?.canton.id).toBe('pu-mv');
 expect(nearbyContext(40,-74)).toBeNull();expect(nearbyContext(NaN,0)).toBeNull();
});
test('near me ranks canton, neighboring cantons and then province without requiring map pins',()=>{
 const local=pro('local',{workplaces:[{id:'at',name:'Atenas, Alajuela',...{cantonId:'al-at',provinciaId:'al'}}]});
 const neighbor=pro('neighbor',{workplaces:[{id:'gr',name:'Grecia, Alajuela',...{cantonId:'al-gr',provinciaId:'al'}}]});
 const province=pro('province',{provinceName:'Alajuela',cantonName:'San Carlos'});
 const coverage=pro('coverage',{coverage:{country:false,provincias:['Alajuela'],cantones:[]}});
 const national=pro('national',{coverage:{country:true,provincias:[],cantones:[]},serviceType:'mobile'});
 const remote=pro('remote',{provinceName:'Guanacaste',cantonName:'Liberia'});
 expect(nearbyRank(local,atenas)[0]).toBe(0);
 expect(nearbyRank(neighbor,atenas)[0]).toBe(1);
 expect(nearbyRank(province,atenas)[0]).toBe(2);
 expect(nearbyRank(coverage,atenas)[0]).toBe(2);
 expect(nearbyRank(national,atenas)[0]).toBe(2);
 expect(nearbyRank(remote,atenas)[0]).toBe(Infinity);
 const sorted=[national,coverage,province,neighbor,local].sort((a,b)=>compareNearby(nearbyRank(a,atenas),nearbyRank(b,atenas)));
 expect(sorted.map(p=>p.id)).toEqual(['local','neighbor','province','coverage','national']);
 const filters={sortBy:'cercania',nearLat:9.98,nearLng:-84.38} as SearchFiltersResolved;
 expect(ordenFinal([national,neighbor,local],filters).map(p=>p.id)).toEqual(['local','neighbor','national']);
 // A new province search must still obey the explicitly chosen rating sort.
 expect(ordenFinal([local,{...national,ratingAvg:5,reviewCount:10}],{...filters,sortBy:'rating'})[0].id).toBe('national');
 const decisions=locationDecisions({categoria:'electricidad'},filters);
 expect(decisions.matchesSelectedPhysicalLocation(local)).toBe(true);
 expect(decisions.matchesSelectedPhysicalLocation(coverage)).toBe(true);
 expect(decisions.matchesSelectedPhysicalLocation(remote)).toBe(false);
});
test('broad video coverage is not presented as a local establishment and pins cannot replace declared canton',()=>{
 const video={videoconsulta:true,serviceType:'fixed',coverage:{country:true,provincias:[],cantones:[]}};
 expect(nearbyRank(video,atenas)[0]).toBe(Infinity);
 expect(nearbyRank({workplaces:[{cantonId:'gu-li',lat:9.98,lng:-84.38}]},atenas)[0]).toBe(Infinity);
 expect(nearbyRank({workplaces:[{lat:9.98,lng:-84.38}]},atenas)[0]).toBe(1);
});

test('nearby API includes no-pin canton providers, expands to province and preserves scroll order',async({request,page})=>{
 test.setTimeout(120000);
 expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const {createDisposableAccount,cleanupDisposableAccount}=await import('./disposable-account');
 const {regressionAdminClient}=await import('./seed');
 const db=regressionAdminClient();const accounts:Awaited<ReturnType<typeof createDisposableAccount>>[]=[];
 const ids:string[]=[];
 try{
  const locations=[['al','al-at'],['al','al-gr'],['al','al-sc'],['gu','gu-li'],['sj','sj-sj']];
  for(let i=0;i<locations.length;i++){
   const actor=await createDisposableAccount({prefix:'nearby-canton'});accounts.push(actor);
   const [province,canton]=locations[i];
   const {data,error}=await db.from('professionals').insert({profile_id:actor.id,category_id:'desarrollo_web',slug:'nearby-'+actor.id,business_name:'Prueba cercanía '+i,whatsapp:'',provincia_id:i===4?null:province,canton_id:i===4?null:canton,is_banned:false,oculto_del_buscador:false,verification_status:'pending',services:[{id:'near-test',category:'desarrollo_web',name:'Desarrollo web',active:true}],workplaces:i===4?[]:[{id:'wp-'+i,name:'Zona de prueba',provinciaId:province,cantonId:canton}],coverage_country:i===4,service_type:'mobile'}).select('id').single();
   expect(error).toBeNull();ids.push(data!.id);
  }
  const found:string[]=[];let total=Infinity;
  const query='categoria=desarrollo_web&lat=9.98&lng=-84.38&regression=near-cantons';
  for(let offset=0;offset<Math.min(total,500);offset+=20){
   const response=await request.get(`/api/buscar/results?${query}&offset=${offset}`);
   expect(response.status()).toBe(200);const result=await response.json();total=result.total;
   expect(result.offset).toBe(offset);expect(result.professionals.length).toBeLessThanOrEqual(20);
   found.push(...result.professionals.map((p:{professional:{id:string}})=>p.professional.id));
  }
  expect(new Set(found).size).toBe(found.length);
  expect(found.filter(id=>ids.includes(id))).toEqual([ids[0],ids[1],ids[2],ids[4]]);
  expect(found).not.toContain(ids[3]);
  await page.goto('/buscar?'+query);
  await expect(page.locator('[data-pro-id]')).toHaveCount(Math.min(total,20));
  expect(await page.locator('[data-pro-id]').evaluateAll(nodes=>nodes.map(n=>n.getAttribute('data-pro-id')))).toEqual(found.slice(0,20));
  await expect(page.getByRole('button',{name:'Más cercanos',exact:true}).filter({visible:true}).first()).toBeVisible();
 }finally{for(const account of accounts)await cleanupDisposableAccount(account);}
});

 test('near me chooses nearby ordering by default, retaining explicit rating and named places',async()=>{
 const {resolveSearchSort}=await import('@/lib/search/sort');
 expect(resolveSearchSort({lat:'9.98',lng:'-84.38'})).toBe('cercania');
 expect(resolveSearchSort({lat:'9.98',lng:'-84.38',sortBy:'rating'})).toBe('rating');
 expect(resolveSearchSort({lat:'9.98',lng:'-84.38',provincia:'al'})).toBe('rating');
 expect(resolveSearchSort({sortBy:'cercania'})).toBe('rating');
 });
