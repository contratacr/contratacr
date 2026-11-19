import {mkdirSync} from 'node:fs';
import {join} from 'node:path';
import {expect,type Page} from 'playwright/test';
import {seedPlace,uid,type Db} from './pro-dir-fixture';
import {retireItems} from './pro-dir-ops-fixture';

// Multivertical P3/A2 (LOCAL Pro): synthetic price comparison data for /precios and the assistant specs. Everything is
// SYNTHETIC (example.invalid source URL, «E2E» names, restricted-circulation GTINs) and is undone by cleanup():
// observations rejected (rows are append-only), items deactivated (no longer searchable), places hidden by
// hideSeededPlaces() in the spec's afterEach. Import batches stay as append-only provenance rows (never public).
export type PriceSeed={tag:string;staff:string;rice:string;otc:string;rx:string;places:{centro:string;norte:string;viejo:string;farmacia:string;sinPermiso:string};
 placeIds:{centro:string;norte:string;viejo:string;farmacia:string;sinPermiso:string};
 riceName:string;otcName:string;rxName:string;cleanup:()=>Promise<void>};

const gtin=(body12:string)=>{for(let c=0;c<10;c++){const v=body12+c,d=v.padStart(14,'0');let s=0;for(let i=0;i<13;i++)s+=Number(d[i])*(i%2===0?3:1);if((10-s%10)%10===c)return v;}throw new Error('gtin');};
async function rpc(db:Db,fn:string,actor:string,input:Record<string,unknown>){
 const r=await db.rpc(fn,{p_actor:actor,p_input:input});if(r.error)throw new Error(`${fn}: ${r.error.code} ${r.error.message} ${r.error.hint??''}`);return r.data as Record<string,unknown>;
}

export async function seedPriceComparison(db:Db):Promise<PriceSeed>{
 const tag=crypto.randomUUID().replace(/-/g,'').slice(0,8),staff=uid();
 const digits=String(parseInt(tag.slice(0,6),16)%1_000_000_000).padStart(9,'0');
 const centro=await seedPlace(db,{slug:`super-centro-${tag}`,vertical:'grocery',name:`Almacén Centro ${tag}`,adminArea1:'San José',adminArea2:'San José',locality:'Catedral'});
 const norte=await seedPlace(db,{slug:`mercado-norte-${tag}`,vertical:'grocery',name:`Mercado Norte ${tag}`,adminArea1:'Heredia',adminArea2:'Heredia',locality:'Mercedes'});
 const viejo=await seedPlace(db,{slug:`super-viejo-${tag}`,vertical:'grocery',name:`Abastecedor Viejo ${tag}`,adminArea1:'Cartago',adminArea2:'Cartago',locality:'Oriental'});
 const farmacia=await seedPlace(db,{slug:`farmacia-cmp-${tag}`,vertical:'pharmacy',name:`Farmacia Comparada ${tag}`,adminArea1:'San José',adminArea2:'San José',locality:'Catedral'},{license:true});
 const sinPermiso=await seedPlace(db,{slug:`farmacia-sin-${tag}`,vertical:'pharmacy',name:`Farmacia Sin Permiso ${tag}`});
 const rice=`arroz-e2e-${tag}`,otc=`acetaminofen-e2e-${tag}`,rx=`amoxicilina-e2e-${tag}`;
 const riceName=`Arroz E2E ${tag}`,otcName=`Acetaminofén E2E ${tag}`,rxName=`Amoxicilina E2E ${tag}`;
 await rpc(db,'price_catalog_upsert',staff,{actionId:uid(),slug:rice,kind:'grocery',name:riceName,brand:'Marca Sintética',category:'granos',gtin:gtin('200'+digits),presentation:'1 kg',unitBase:'kg',unitQty:1,aliases:['arroz']});
 await rpc(db,'price_catalog_upsert',staff,{actionId:uid(),slug:otc,kind:'medicine',rxRequired:false,name:otcName,category:'otc_dolor',presentation:'10 tabletas',unitBase:'unit',unitQty:10});
 await rpc(db,'price_item_upsert',staff,{actionId:uid(),slug:rx,kind:'medicine',name:rxName,presentation:'12 cápsulas',unitBase:'unit',unitQty:12});
 // Synthetic official import (provenance: example.invalid URL, random sha256). Never a real MEIC file.
 const day=new Date(Date.now()-3*864e5).toLocaleDateString('en-CA',{timeZone:'America/Costa_Rica'});
 const imp=await rpc(db,'price_official_import_record',staff,{actionId:uid(),sourceId:'meic',sourceUrl:`https://example.invalid/e2e/${tag}.csv`,publicationDate:day,
  surveyRef:`E2E-${tag}`,fileName:`e2e-${tag}.csv`,fileSha256:(uid()+uid()).replace(/-/g,'').slice(0,64),fileFormat:'csv',rows:[
   {rowNo:1,itemSlug:rice,placeSlug:`super-centro-${tag}`,price:1250},
   {rowNo:2,itemSlug:rice,placeSlug:`mercado-norte-${tag}`,price:1190},
   {rowNo:3,itemSlug:otc,placeSlug:`farmacia-cmp-${tag}`,price:850},
   {rowNo:4,itemSlug:otc,placeSlug:`farmacia-sin-${tag}`,price:700},
   {rowNo:5,itemSlug:rx,placeSlug:`farmacia-cmp-${tag}`,price:4200},
  ]});
 expect(imp.counts).toEqual({recorded:4,rx_refused:1});
 // An old official price (out of date) at a third store, cheaper: it must be shown last and flagged.
 await rpc(db,'price_observation_record',staff,{actionId:uid(),sourceKind:'official_meic',sourceRef:`E2E-OLD-${tag}`,itemSlug:rice,placeSlug:`super-viejo-${tag}`,price:900,
  observedAt:new Date(Date.now()-200*864e5).toISOString()});
 return {tag,staff,rice,otc,rx,riceName,otcName,rxName,places:{centro:`super-centro-${tag}`,norte:`mercado-norte-${tag}`,viejo:`super-viejo-${tag}`,farmacia:`farmacia-cmp-${tag}`,sinPermiso:`farmacia-sin-${tag}`},
  placeIds:{centro:centro.placeId,norte:norte.placeId,viejo:viejo.placeId,farmacia:farmacia.placeId,sinPermiso:sinPermiso.placeId},
  cleanup:()=>retireItems(db,staff,[rice,otc,rx])};
}

/** Screenshot into DIR_PRICES_SHOTS_DIR (owner widths 1440 and 390) when set. */
export async function pricesShot(page:Page,name:string,width:1440|390){
 const dir=process.env.DIR_PRICES_SHOTS_DIR;if(!dir)return;
 mkdirSync(dir,{recursive:true});
 await page.setViewportSize({width,height:width===390?844:900});await page.waitForTimeout(400);
 await page.screenshot({path:join(dir,`${name}-${width}.png`),fullPage:true});
}
