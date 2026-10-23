import { build } from "esbuild";
import { test, expect } from "playwright/test";
import { paginateFeed, type FeedItem, type FeedSection } from "../../src/lib/marketplace/feed";

const asOf="2026-10-22T12:00:00.000Z";
function catalogue(section:FeedSection,count=125):FeedItem[]{
  return Array.from({length:count},(_,i)=>({id:String(count-i).padStart(8,"0"),title:`${i>=120?"Latehit":"Publicación"} ${i}`,description:"Descripción de prueba con suficiente información",created_at:new Date(Date.parse(asOf)-i*1000).toISOString(),location_label:"Atenas, Alajuela",category_name:"Desarrollo web",category_id:"desarrollo_web",professional_name:"Proveedor",service_label:"Desarrollo web",offer_type:"service_offer",employer_name:"Empleador",workplace_type:"remote",employment_type:"full_time",experience_level:"any",requirements:[],responsibilities:[]} as unknown as FeedItem));
}

test("cursor pagination covers ties, deletions, new posts and filtering beyond one hundred",()=>{
  for(const section of ["proyectos","promociones","empleos"] as const){
    const rows=catalogue(section);rows[20].created_at=rows[19].created_at;
    const first=paginateFeed(rows,section,{},asOf);expect(first.items).toHaveLength(20);expect(first.total).toBe(125);
    const seen=first.items.map(i=>i.id);let cursor=first.nextCursor;
    const changed=rows.filter(i=>i.id!==seen.at(-1));changed.unshift({...rows[0],id:"new",created_at:"2026-10-22T12:00:01.000Z"});
    while(cursor){const page=paginateFeed(changed,section,{},asOf,cursor);expect(page.items.length).toBeLessThanOrEqual(20);seen.push(...page.items.map(i=>i.id));cursor=page.nextCursor;}
    expect(new Set(seen).size).toBe(125);expect(seen).not.toContain("new");
    const filtered=paginateFeed(rows,section,{q:"Latehit"},asOf);expect(filtered.total).toBe(5);expect(filtered.items).toHaveLength(5);
    expect(paginateFeed(rows,section,{q:"no-match"},asOf).nextCursor).toBeNull();
    const selected=paginateFeed(rows,section,{},asOf,undefined,rows[124].id);expect(selected.selected?.id).toBe(rows[124].id);
  }
});

async function mount(page:import("playwright/test").Page,section:FeedSection,isMobile:boolean){
  const initial=paginateFeed(catalogue(section),section,{},asOf);
  const bundle=await build({stdin:{contents:`import React,{useState} from 'react'; import {createRoot} from 'react-dom/client'; import {useMarketplaceFeed} from './src/hooks/use-marketplace-feed'; import {MarketplaceFeedFeedback} from './src/components/marketplace/feed-loading';
    const initial=${JSON.stringify(initial)};
    function App(){const [filters,setFilters]=useState({});window.changeFeed=q=>setFilters({q});const feed=useMarketplaceFeed('${section}',initial,filters,'es');return <><output data-total>{feed.total}</output><div id="list" className="ccr-lista-tablero" style={${isMobile?"{}":"{height:450,overflowY:'auto'}"}}>{(feed.items??[]).map(i=><article key={i.id} data-feed-row={i.id}>{i.title}</article>)}<MarketplaceFeedFeedback feed={feed}/></div></>};createRoot(document.getElementById('root')).render(<App/>);`,resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,format:"iife",platform:"browser",jsx:"automatic",plugins:[{name:"feed-harness",setup(b){
    b.onResolve({filter:/^(next-intl|@\/hooks\/use-profesional-con-app)$/},a=>({path:a.path,namespace:"feed-harness"}));
    b.onLoad({filter:/.*/,namespace:"feed-harness"},a=>({contents:a.path==="next-intl"?`export const useLocale=()=> 'es';export const useTranslations=()=>key=>key;`:`export const useProfesionalConApp=()=>false;export const ContactAvailabilityProvider=({children})=>children;export const ResolvedContactAvailabilityProvider=({children})=>children;`,resolveDir:process.cwd()}));
  }}]});
  await page.route("**/marketplace-harness",r=>r.fulfill({contentType:"text/html",body:'<!doctype html><style>article{height:300px;border-bottom:1px solid #ccc}.ccr-skeleton-shimmer{display:block;min-height:15px;background:#eee}</style><div id="root"></div>'}));
  await page.goto("/marketplace-harness");await page.addScriptTag({content:bundle.outputFiles[0].text});
}
async function scrollEnd(page:import("playwright/test").Page,isMobile:boolean){await page.evaluate(mobile=>{if(mobile)window.scrollTo(0,document.body.scrollHeight);else{const list=document.querySelector('#list')!;list.scrollTop=list.scrollHeight;}},isMobile);}
for(const section of ["proyectos","promociones","empleos"] as const)for(const slow of [false,true]){
  test(`${section}: next twenty ${slow?"wait behind full-row skeletons":"arrive without a loading flash"}`,async({page,isMobile})=>{
    let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let requests=0;
    await page.route("**/api/marketplace/results?*",async route=>{requests++;const p=new URL(route.request().url()).searchParams;if(slow)await gate;await route.fulfill({json:paginateFeed(catalogue(section),section,{},p.get("asOf")!,p.get("cursor"))});});
    try{
      await mount(page,section,isMobile);await expect(page.locator('[data-feed-row]')).toHaveCount(20);expect(requests).toBe(0);
      await page.evaluate(()=>{(window as unknown as {skeletonSeen:boolean}).skeletonSeen=false;new MutationObserver(()=>{if(document.querySelector('[data-marketplace-skeleton]'))(window as unknown as {skeletonSeen:boolean}).skeletonSeen=true;}).observe(document.body,{childList:true,subtree:true});});
      await scrollEnd(page,isMobile);await expect.poll(()=>requests).toBe(1);
      if(slow){await expect(page.locator('[data-marketplace-skeleton]')).toBeVisible();await expect(page.locator('[data-feed-row]')).toHaveCount(20);await expect(page.locator('[data-marketplace-skeleton] .ccr-delayed-loading')).toHaveCount(0);release();}
      await expect(page.locator('[data-feed-row]')).toHaveCount(40);await expect(page.locator('[data-marketplace-skeleton]')).toHaveCount(0);expect(requests).toBe(1);
      expect(await page.locator('[data-feed-row]').evaluateAll(nodes=>new Set(nodes.map(n=>n.getAttribute('data-feed-row'))).size)).toBe(40);
      if(!slow)expect(await page.evaluate(()=>(window as unknown as {skeletonSeen:boolean}).skeletonSeen)).toBe(false);
    }finally{release();await page.unrouteAll({behavior:"wait"});}
  });
}
for(const section of ["proyectos","promociones","empleos"] as const){
  test(`${section}: changing filters discards a late previous response`,async({page,isMobile})=>{
    let release=()=>{};const gate=new Promise<void>(resolve=>{release=resolve;});let oldStarted=false;
    await page.route("**/api/marketplace/results?*",async route=>{const p=new URL(route.request().url()).searchParams;const q=p.get('q')??'';if(q==='old'){oldStarted=true;await gate;}await route.fulfill({json:paginateFeed(catalogue(section),section,{q},asOf)}).catch(()=>{});});
    try{await mount(page,section,isMobile);await page.evaluate(()=>(window as unknown as {changeFeed:(q:string)=>void}).changeFeed('old'));await expect.poll(()=>oldStarted).toBe(true);
      await page.evaluate(()=>(window as unknown as {changeFeed:(q:string)=>void}).changeFeed('Latehit'));await expect(page.locator('[data-feed-row]')).toHaveCount(5);await expect(page.locator('[data-total]')).toHaveText('5');release();
      await expect(page.locator('[data-feed-row]')).toHaveCount(5);await expect(page.locator('[data-marketplace-skeleton]')).toHaveCount(0);expect(await page.locator('[data-feed-row]').allTextContents()).toEqual(expect.arrayContaining(['Latehit 120']));
    }finally{release();await page.unrouteAll({behavior:'wait'});}
  });
  test(`${section}: a failed page keeps existing results and retry continues once`,async({page,isMobile})=>{
    let requests=0;await page.route("**/api/marketplace/results?*",async route=>{requests++;if(requests===1)return route.fulfill({status:503,json:{error:'temporary'}});const p=new URL(route.request().url()).searchParams;return route.fulfill({json:paginateFeed(catalogue(section),section,{},asOf,p.get('cursor'))});});
    await mount(page,section,isMobile);await scrollEnd(page,isMobile);await expect(page.getByRole('button',{name:'Reintentar',exact:true})).toBeVisible();await expect(page.locator('[data-feed-row]')).toHaveCount(20);await page.getByRole('button',{name:'Reintentar',exact:true}).click();await expect(page.locator('[data-feed-row]')).toHaveCount(40);expect(requests).toBe(2);await expect(page.locator('[data-marketplace-skeleton]')).toHaveCount(0);
  });
}
