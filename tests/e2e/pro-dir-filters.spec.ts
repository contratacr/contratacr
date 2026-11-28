import {test,expect,type Page} from 'playwright/test';
import {mkdirSync} from 'node:fs';
import {homedir} from 'node:os';
import {join} from 'node:path';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,origin} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,label,seedPlace} from './pro-dir-fixture';

// 2026-11-27 (owner «aplica tus recomendaciones», migration 546, src/lib/directory/section-filters.ts): section filter
// chips with data. Every filter returns only matching places (API over the real imported data + synthetic places),
// friendly empty state, combinations with «Abierto ahora» and «Más cercanos», state in the URL across reload and Back,
// whole chip labels at 390/360 px, and «Abierto ahora» only where the hours coverage reaches the threshold.
test.afterEach(()=>hideSeededPlaces());
const shots=process.env.FILTER_SHOTS_DIR??join(homedir(),'dl/out-filters');
const ALL_DAY=[0,1,2,3,4,5,6].map(weekday=>({weekday,opens:'00:00',closes:'24:00'}));
type Item={key:string;slug:string;name:string;attributes?:Record<string,unknown>};
const api=async(page:Page,qs:string)=>{const r=await page.request.get(`${origin}/api/directorio/search?${qs}`);expect(r.status(),qs).toBe(200);return (await r.json()).items as Item[];};
const attr=(it:Item,k:string)=>it.attributes?.[k];
// Section pages are heavy on the dev server: a navigation can be aborted while the previous page still hydrates.
const open=async(page:Page,path:string)=>expect(async()=>{await gotoOK(page,path);}).toPass({timeout:60000});
/** Opens a chip menu (after hydration: retried until its options show) and picks one option by its label. */
async function pick(page:Page,menu:string,option:string){
 const link=page.getByRole('link',{name:option,exact:true}).filter({visible:true}).first();
 await expect(async()=>{if(!(await link.isVisible()))await page.locator(`[data-chip-menu="${menu}"]`).filter({visible:true}).first().click();
  await expect(link).toBeVisible({timeout:2000});}).toPass({timeout:30000});
 await link.click();
}

type Stats={total:number;withHours:number;cuisines:{value:string;count:number}[];brands:{value:string;label:string;count:number}[];soda:number;atm:number;public:number;reservations:number};
/** The same numbers the chips are built from (dir_section_filter_stats). A seeded CI database has no imported OSM data:
 *  the data-dependent checks follow these numbers instead of assuming the local import. */
async function stats(section:string):Promise<Stats>{const {data,error}=await dirDb().rpc('dir_section_filter_stats',{p_vertical:section});expect(error).toBeNull();return data as Stats;}
const brandCount=(s:Stats,v:string)=>s.brands.find(b=>b.value===v)?.count??0;
const cuisineCount=(s:Stats,v:string)=>s.cuisines.find(b=>b.value===v)?.count??0;

// Real-data checks (local imported OSM data): every result of the first page matches the filter.
// The 4th value: how many places the stats say match (the first page must then not be empty); null = not counted there.
const REAL:[string,string,(it:Item)=>boolean,((s:Stats)=>number)|null][]=[
 ['restaurantes','cuisine=pizza',it=>Array.isArray(attr(it,'cuisines'))&&(attr(it,'cuisines') as string[]).includes('pizza'),s=>cuisineCount(s,'pizza')],
 ['restaurantes','soda=1',it=>attr(it,'soda')===true,s=>s.soda],
 ['bancos','brand=bcr',it=>attr(it,'brand')==='BCR',s=>brandCount(s,'bcr')],
 ['bancos','atm=1',it=>attr(it,'atm')===true||attr(it,'kind')==='atm',s=>s.atm],
 ['gasolineras','brand=delta',it=>attr(it,'brand')==='Delta',s=>brandCount(s,'delta')],
 ['supermercados','brand=auto-mercado',it=>attr(it,'chain')==='Auto Mercado',s=>brandCount(s,'auto-mercado')],
 ['salud','public=1',it=>attr(it,'publicService')===true,s=>s.public],
 ['educacion','public=1',it=>attr(it,'publicService')===true,s=>s.public],
 ['hospedaje','kind=cabins',it=>attr(it,'kind')==='cabins',null],
];

test('every section filter returns only matching places (API, real data and synthetic places)',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 for(const [section,qs,ok,expected] of REAL){
  const items=await api(page,`vertical=${section}&${qs}&limit=50`);
  if(expected&&expected(await stats(section))>0)expect(items.length,`${section}?${qs} has data`).toBeGreaterThan(0);
  const bad=items.filter(it=>!ok(it)).map(it=>it.name);
  expect(bad,`${section}?${qs}`).toEqual([]);
 }
 // A filter of another section is refused, not ignored.
 expect((await page.request.get(`${origin}/api/directorio/search?vertical=bancos&cuisine=pizza`)).status()).toBe(400);
 expect((await page.request.get(`${origin}/api/directorio/search?vertical=restaurantes&cuisine=Pizza!`)).status()).toBe(400);

 const db=dirDb(),tag=label();
 const seed=(slug:string,vertical:Parameters<typeof seedPlace>[1]['vertical'],name:string,attributes:Record<string,unknown>)=>
  seedPlace(db,{slug:`e2e-flt-${slug}-${tag}`,vertical,name:`${name} ${tag}`,attributes});
 await seed('pizza','restaurant','Soda Filtro Pizza',{cuisines:['pizza'],soda:true});
 await seed('china','restaurant','Restaurante Filtro China',{cuisines:['china']});
 await seed('bcr','banking','Banco Filtro Uno',{kind:'bank',brand:'BCR',atm:true});
 await seed('bac','banking','Banco Filtro Dos',{kind:'bank',brand:'BAC'});
 await seed('ccss','health','EBAIS Filtro',{kind:'clinic',publicService:true});
 await seed('privada','health','Clinica Filtro',{kind:'clinic'});
 await seed('delta','fuel','Estacion Filtro Uno',{brand:'Delta'});
 await seed('sinmarca','fuel','Estacion Filtro Dos',{});
 await seed('am','grocery','Super Filtro Uno',{chain:'Auto Mercado'});
 await seed('mxm','grocery','Super Filtro Dos',{chain:'Más x Menos'});
 await seed('mep','education','Escuela Filtro Uno',{kind:'school',publicService:true});
 await seed('priv','education','Escuela Filtro Dos',{kind:'school'});
 await seed('cab','lodging','Cabinas Filtro',{kind:'cabins'});
 await seed('hot','lodging','Hotel Filtro',{kind:'hotel'});
 const only=async(section:string,qs:string,expected:string[])=>{
  const got=(await api(page,`vertical=${section}&q=${tag}&${qs}`)).map(it=>it.slug).sort();
  expect(got,`${section}?${qs}`).toEqual(expected.map(s=>`e2e-flt-${s}-${tag}`).sort());
 };
 await only('restaurantes','cuisine=pizza',['pizza']);
 await only('restaurantes','cuisine=china',['china']);
 await only('restaurantes','soda=1',['pizza']);
 await only('restaurantes','reservations=1',[]);
 await only('bancos','brand=bcr',['bcr']);
 await only('bancos','atm=1',['bcr']);
 await only('salud','public=1',['ccss']);
 await only('gasolineras','brand=delta',['delta']);
 await only('supermercados','brand=mas-x-menos',['mxm']);
 await only('educacion','public=1',['mep']);
 await only('hospedaje','kind=cabins',['cab']);
});

test('chips filter the list, keep the state in the URL across reload and Back, and the empty state is friendly',async({page},info)=>{
 test.setTimeout(300000);local(info.project.use.baseURL);
 const db=dirDb(),tag=label(),errors=collectPageErrors(page);
 await seedPlace(db,{slug:`e2e-flt-open-${tag}`,vertical:'restaurant',name:`Soda Chip Abierta ${tag}`,attributes:{cuisines:['pizza'],soda:true}},{hours:ALL_DAY});
 await seedPlace(db,{slug:`e2e-flt-other-${tag}`,vertical:'restaurant',name:`Restaurante Chip Otro ${tag}`,attributes:{cuisines:['china']}});
 const item=(s:string)=>page.locator(`[data-search-item="p:e2e-flt-${s}-${tag}"]`).filter({visible:true});
 const chip=(k:string)=>page.locator(`[data-chip="${k}"]`).filter({visible:true}).first();

 await open(page,`/restaurantes?q=${tag}`);
 await expect(item('open')).toHaveCount(1);await expect(item('other')).toHaveCount(1);
 const st=await stats('restaurantes');
 // Toggle «Sodas» (offered with ≥ 5 sodas; a seeded CI database has none: then through the URL, where the chip shows on).
 if(st.soda>=5)await chip('soda').click();else await open(page,`/restaurantes?q=${tag}&soda=1`);
 await expect(page).toHaveURL(/[?&]soda=1/);
 await expect(item('open')).toHaveCount(1);await expect(item('other')).toHaveCount(0);
 await expect(chip('soda')).toHaveAttribute('aria-pressed','true');
 // Menu «Tipo de comida» → China: no soda serves Chinese food here → friendly empty state.
 if(cuisineCount(st,'china')>=5)await pick(page,'cuisine','China');else await open(page,`/restaurantes?q=${tag}&soda=1&cuisine=china`);
 await expect(page).toHaveURL(/cuisine=china/);await expect(page).toHaveURL(/soda=1/);
 const empty=page.getByRole('status').filter({hasText:'No encontramos resultados con estos filtros.'});
 await expect(empty).toBeVisible();
 await expect(empty).toContainText('Pruebe con menos filtros u otra zona.');
 await expect(empty.getByRole('link',{name:'Limpiar filtros'})).toBeVisible();
 // Reload keeps it; Back returns to the soda-only list with the chip still on.
 await page.reload();await expect(page).toHaveURL(/cuisine=china/);await expect(empty).toBeVisible();
 await page.goBack();
 await expect(page).toHaveURL(/soda=1/);await expect(page).not.toHaveURL(/cuisine=/);
 await expect(item('open')).toHaveCount(1);await expect(chip('soda')).toHaveAttribute('aria-pressed','true');

 // «Abierto ahora» from the URL (combination): the 24 h soda stays; the chip shows on to remove it.
 await open(page,`/restaurantes?q=${tag}&cuisine=pizza&openNow=1`);
 await expect(item('open')).toHaveCount(1);await expect(item('other')).toHaveCount(0);
 await expect(chip('open-now')).toHaveAttribute('aria-pressed','true');
 // Empty with «Abierto ahora» + another filter: a button removes only «Abierto ahora».
 await open(page,`/restaurantes?q=${tag}&cuisine=china&soda=1&openNow=1`);
 await expect(page.locator('[data-empty-remove="open-now"]')).toHaveText('Quitar "Abierto ahora"');
 // «Más cercanos» with a position keeps the filters.
 await open(page,`/restaurantes?q=${tag}&cuisine=pizza&openNow=1&sort=distance&lat=9.93&lng=-84.08`);
 await expect(item('open')).toHaveCount(1);await expect(item('other')).toHaveCount(0);
 await expect(page.locator('[data-chip-menu="sort"]').filter({visible:true}).first()).toContainText('Más cercanos');
 await expect(page.locator('[data-chip-menu="cuisine"]').filter({visible:true}).first()).toContainText('Pizza');
 // A filter of another section: controlled message, no page error.
 await open(page,`/bancos?cuisine=pizza`);
 await expect(page.locator('[data-search-problem="invalid"]')).toContainText('Revise los filtros e intente de nuevo.');
 expect(errors()).toEqual([]);
});

test('«Abierto ahora» shows only where enough places have hours; the value lists come from the data',async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 for(const section of ['restaurantes','bancos','gasolineras','supermercados','salud','educacion','hospedaje','tiendas']){
  const s=await stats(section);const useful=s.withHours>=20&&s.withHours/s.total>=0.3;
  await open(page,`/${section}`);
  const n=await page.locator('[data-chip="open-now"]').count();
  expect(n>0,`${section}: ${s.withHours}/${s.total} with hours`).toBe(useful);
 }
 // Bancos: «Banco» lists the banks with ≥ 5 places by count; «Con cajero» with ≥ 5; no price chip at fuel stations.
 const banks=await stats('bancos'),listed=banks.brands.filter(b=>b.count>=5);
 await open(page,'/bancos');
 await expect(page.locator('[data-chip="atm"]').filter({visible:true})).toHaveCount(banks.atm>=5?1:0);
 if(banks.atm>=5)await expect(page.locator('[data-chip="atm"]').filter({visible:true})).toHaveText('Con cajero');
 await expect(page.locator('[data-chip-menu="brand"]').filter({visible:true})).toHaveCount(listed.length?1:0);
 if(listed.length){
 const opener=page.locator('[data-chip-menu="brand"]').filter({visible:true}).first();
 const options=page.locator('[data-chip-sheet="brand"] a, [data-chip-menu="brand"] ul a').filter({visible:true});
 await expect(async()=>{if(!(await options.count()))await opener.click();await expect(options.first()).toHaveText(/^Todos los bancos/,{timeout:2000});}).toPass({timeout:30000});
 const names=await options.allInnerTexts();
 expect(names.slice(1).map(x=>x.replace('✓','').trim())).toEqual(listed.map(b=>b.label));// count order, same labels
 }
 const fuel=await stats('gasolineras');
 await open(page,'/gasolineras');
 if(fuel.brands.some(b=>b.count>=5))await expect(page.locator('[data-chip-menu="brand"]').filter({visible:true})).toContainText('Marca');
 await expect(page.locator('[data-chip-menu="price"], [data-chip="price"]')).toHaveCount(0);
 const rest=await stats('restaurantes');
 await open(page,'/en/restaurantes');
 if(rest.cuisines.some(c=>c.count>=5))await expect(page.locator('[data-chip-menu="cuisine"]').filter({visible:true})).toContainText('Cuisine');
 if(rest.reservations>=1)await expect(page.locator('[data-chip="reservations"]').filter({visible:true})).toHaveText('Takes reservations');
});

for(const width of [390,360])test(`chip rows at ${width} px: whole labels, no ellipsis, no page overflow`,async({page},info)=>{
 test.setTimeout(240000);local(info.project.use.baseURL);
 await page.setViewportSize({width,height:844});
 for(const section of ['restaurantes','bancos','hospedaje','gasolineras','supermercados','salud','educacion']){
  await open(page,`/${section}`);
  const rail=page.locator('[data-places-home] [role="group"]').filter({visible:true}).first();
  await expect(rail).toBeVisible();
  const chips=rail.locator('a, button');
  expect(await chips.count()).toBeGreaterThan(0);
  const cut=await chips.evaluateAll(els=>els.flatMap(el=>{const t=(el as HTMLElement).innerText;
   const clipped=el.scrollWidth>el.clientWidth+1||/…|\.\.\./.test(t)||getComputedStyle(el).textOverflow==='ellipsis';return clipped?[t]:[];}));
  expect(cut,`${section} at ${width}px`).toEqual([]);
  await expectNoHorizontalOverflow(page);
  if(width===390&&['restaurantes','bancos','hospedaje'].includes(section)){
   mkdirSync(shots,{recursive:true});
   await rail.screenshot({path:join(shots,`${section}-chips-390-${info.project.name}.png`)});
   await page.screenshot({path:join(shots,`${section}-390-${info.project.name}.png`)});
  }
 }
});

test('directory off: section pages answer 404 and /buscar keeps its own chips (production unchanged)',async({page},info)=>{
 local(info.project.use.baseURL);
 const r=await page.request.get(`${origin}/restaurantes?cuisine=pizza`);
 if(r.status()===404){expect((await page.request.get(`${origin}/api/directorio/search?vertical=restaurantes&cuisine=pizza`)).status()).toBe(404);return;}
 // Directory on (this run): /buscar does not take the section chips (they live only on the section pages).
 await open(page,'/buscar?q=restaurantes');
 for(const k of ['soda','reservations','atm','public'])await expect(page.locator(`[data-chip="${k}"]`)).toHaveCount(0);
 await expect(page.locator('[data-chip-menu="cuisine"], [data-chip-menu="brand"]')).toHaveCount(0);
});
