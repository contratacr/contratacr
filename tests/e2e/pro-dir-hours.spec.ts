import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,label,trackPlace,uid} from './pro-dir-fixture';

// Multivertical F2 extras (LOCAL Pro): hours and website imported from OpenStreetMap. A synthetic place whose hours and
// website come from the OSM source shows «Horario según OpenStreetMap; confírmelo con el negocio», «24 horas» for
// 00:00–24:00 and a nofollow/ugc/noopener website link; «Abierto ahora» on /restaurantes keeps a 24/7 place and drops
// one that is closed at this moment in America/Costa_Rica; hours set by the owner never show the OSM note.
test.afterEach(()=>hideSeededPlaces());

/** Costa Rica (UTC-6, no DST) weekday and HH:MM at `offsetMin` minutes from now. */
function crClock(offsetMin:number){const d=new Date(Date.now()-6*3600_000+offsetMin*60_000);return {weekday:d.getUTCDay(),hm:`${String(d.getUTCHours()).padStart(2,'0')}:${String(d.getUTCMinutes()).padStart(2,'0')}`};}

for(const language of ['es','en'] as const)test(`F2 extras: OSM hours note, website rel and «Abierto ahora» [${language}]`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 const en=language==='en',t=(es:string,english:string)=>en?english:es,prefix=en?'/en':'',db=dirDb(),tag=label(),errors=collectPageErrors(page);
 const make=async(slug:string,name:string,hours:{weekday:number;opens:string;closes:string}[],hoursSource:'osm'|'owner',website?:string)=>{
  const staff=uid(),placeId=uid();trackPlace(placeId,staff);
  const m=async(input:Record<string,unknown>)=>{const r=await db.rpc('dir_place_mutate',{p_actor:staff,p_input:{actionId:uid(),placeId,...input}});if(r.error)throw new Error(r.error.message);return (r.data as {revision:number}).revision;};
  let rev=await m({action:'create',revision:0,source:{id:'osm',ref:'node/e2e-'+slug},verificationLevel:'imported',
   place:{slug,vertical:'restaurant',name,adminArea1:'San José',adminArea2:'San José',locality:'San José',lat:9.933,lng:-84.08,...(website?{website}:{})}});
  rev=await m({action:'hours',revision:rev,hours,source:{id:hoursSource,...(hoursSource==='osm'?{ref:'node/e2e-'+slug}:{})}});
  await m({action:'status',revision:rev,status:'published'});
 };
 const open247=`e2e-osm-247-${tag}`,openNow=`e2e-osm-ahora-${tag}`,closed=`e2e-osm-cerrado-${tag}`,owner=`e2e-owner-${tag}`;
 // a slot is [opens, closes) on the weekday of `opens`; when closes < opens it crosses midnight (dir_search_open_at)
 const slot=(from:number,to:number)=>{const a=crClock(from),b=crClock(to);return [{weekday:a.weekday,opens:a.hm,closes:b.hm}];};
 await make(open247,`Soda Horario ${tag} abierta`,[0,1,2,3,4,5,6].map(weekday=>({weekday,opens:'00:00',closes:'24:00'})),'osm','http://www.example.com');
 await make(openNow,`Soda Horario ${tag} ahora`,slot(-60,60),'osm');// open from 1 h ago to 1 h from now (Costa Rica)
 await make(closed,`Soda Horario ${tag} cerrada`,slot(360,420),'osm');// opens 6 h from now: closed right now
 await make(owner,`Soda Horario ${tag} dueño`,[{weekday:1,opens:'08:00',closes:'17:00'}],'owner');

 await gotoOK(page,`${prefix}/lugar/${open247}`);
 const hours=page.locator('section[aria-labelledby="place-hours"]');
 await expect(hours.locator('[data-place-hours-source="osm"]')).toHaveText(t('Horario según OpenStreetMap.','Hours from OpenStreetMap.'));
 await expect(hours.locator('dd').first()).toHaveText(t('24 horas','24 hours'));
 const site=page.locator('[data-place-side-card] [data-place-action="website"][href="http://www.example.com"]');await expect(site).toHaveAttribute('href','http://www.example.com');
 const rel=(await site.getAttribute('rel'))!.split(' ');for(const r of ['nofollow','ugc','noopener'])expect(rel).toContain(r);
 await expect(page.locator('[data-place-source="OpenStreetMap"]')).toBeVisible();
 // Header open status (2026-11-19, Yelp model), computed from the same hours in Costa Rica time.
 await expect(page.locator('[data-place-open-status="open24"]')).toContainText(t('Abierto 24 horas','Open 24 hours'));
 await expectNoHorizontalOverflow(page);
 await gotoOK(page,`${prefix}/lugar/${openNow}`);
 await expect(page.locator('[data-place-open-status="open"]')).toContainText(t('Abierto ahora · cierra a las ','Open now · closes at '));
 await gotoOK(page,`${prefix}/lugar/${closed}`);
 await expect(page.locator('[data-place-open-status="closed"]')).toContainText(en?/Closed · opens (today|tomorrow) at \d\d:\d\d/:/Cerrado · abre (hoy|mañana) a las \d\d:\d\d/);
 await gotoOK(page,`${prefix}/lugar/${owner}`);
 await expect(page.locator('section[aria-labelledby="place-hours"]')).not.toContainText(t('Confirme el horario','Please confirm the hours'));// 2026-11-19: moved to the Terms (13.1)
 await expect(page.locator('[data-place-hours-source]')).toHaveCount(0);

 const q=encodeURIComponent(`Soda Horario ${tag}`);
 await gotoOK(page,`${prefix}/restaurantes?q=${q}`);
 await expect(page.locator(`[data-search-item="p:${open247}"] [data-open="24h"]`)).toBeVisible();
 await expect(page.locator(`[data-search-item="p:${openNow}"] [data-open="now"]`)).toBeVisible();
 await expect(page.locator(`[data-search-item="p:${closed}"] [data-open="closed"]`)).toBeVisible();
 await gotoOK(page,`${prefix}/restaurantes?q=${q}&openNow=1`);
 await expect(page.locator(`[data-search-item="p:${open247}"]`)).toBeVisible();
 await expect(page.locator(`[data-search-item="p:${openNow}"]`)).toBeVisible();
 await expect(page.locator(`[data-search-item="p:${closed}"]`)).toHaveCount(0);
 // the real OSM seed now has hours: the unfiltered «Abierto ahora» facet is > 0
 const f=await page.request.get(`${origin}/api/directorio/facets?vertical=restaurantes&openNow=1`);expect(f.status()).toBe(200);
 const facets=await f.json() as {total:number};expect(facets.total).toBeGreaterThan(0);
 expect(errors()).toEqual([]);
});
