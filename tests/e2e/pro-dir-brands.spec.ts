import {test,expect} from 'playwright/test';
import {collectPageErrors,expectNoHorizontalOverflow,gotoOK} from './helpers';
import {local,origin,ownerFixture,proOff} from './pro-round2-fixture';
import {dirDb,hideSeededPlaces,label,postJson,seedPlace,uid} from './pro-dir-fixture';
import {featureShots,randomIp} from './pro-dir-features-fixture';

// Place features round (LOCAL Pro, 2026-11-17): brand pages. Synthetic branches imported «from OSM» (brand +
// brand:wikidata by source reference, as the importer does) and one more matched by its normalized name; /marca/<slug>
// lists every public branch by province (ES/EN), the schematic branch map and the review-weighted rating; each branch
// links to its brand. Staff split one branch into a new brand and merge a duplicate brand (the old slug redirects); a
// person claims the brand with a document (UI upload, staff-reviewed), staff approve, and the brand owner edits the
// common information through Pro (CAS → 409). Owner of /[locale]/marca/[slug], /api/marca/[slug]/reclamo(/documentos)
// and /api/pro/brand-info.
test.afterEach(()=>hideSeededPlaces());

test('brands: OSM brand import + name match, brand page, split/merge, claim with documents, owner info',async({page,context},info)=>{
 test.setTimeout(360000);local(info.project.use.baseURL);
 const tag=label(),db=dirDb(),brand=`Cadena Prueba ${tag}`,errors=collectPageErrors(page),staff=uid();
 const slugs=[`cadena-a-${tag}`,`cadena-b-${tag}`,`cadena-c-${tag}`,`cadena-d-${tag}`];
 await seedPlace(db,{slug:slugs[0]!,vertical:'grocery',name:`${brand} Centro`,adminArea1:'San José',lat:9.933,lng:-84.08});
 await seedPlace(db,{slug:slugs[1]!,vertical:'grocery',name:`${brand} Heredia`,adminArea1:'Heredia',lat:9.998,lng:-84.117});
 await seedPlace(db,{slug:slugs[2]!,vertical:'grocery',name:`${brand} Liberia`,adminArea1:'Guanacaste',lat:10.635,lng:-85.437});
 await seedPlace(db,{slug:slugs[3]!,vertical:'grocery',name:`${brand} Express`,adminArea1:'Cartago',lat:9.864,lng:-83.919});
 const f=await ownerFixture(context,'br-'+tag);
 try{
  // Importer path: brand/brand:wikidata by OSM reference (seedPlace records source ref node/e2e-<slug>), then names.
  const wikidata='Q9'+String(Date.now()).slice(-9);
  const imp=await db.rpc('dir_brand_import',{p_actor:staff,p_input:{actionId:uid(),sourceId:'osm',rows:slugs.slice(0,3).map(s=>({ref:'node/e2e-'+s,brand,wikidata}))}});
  expect(imp.error).toBeNull();expect(imp.data).toMatchObject({created:1,assigned:3});
  expect((await db.rpc('dir_brand_match_names',{p_actor:staff,p_input:{actionId:uid()}})).error).toBeNull();
  const b=(await db.from('dir_brands').select('id,slug,revision').eq('wikidata',wikidata).single()).data!;
  expect((await db.from('dir_place_brands').select('source').eq('brand_id',b.id)).data!.map(r=>r.source).sort()).toEqual(['name','osm','osm','osm']);
  for(const language of ['es','en'] as const){
   const en=language==='en',prefix=en?'/en':'/es';
   await gotoOK(page,`${prefix}/marca/${b.slug}`);
   await expect(page.locator('main h1')).toHaveText(brand);
   await expect(page.locator('[data-brand-branches]')).toHaveAttribute('data-brand-branches','4');
   await expect(page.locator('[data-brand-branch]')).toHaveCount(4);
   await expect(page.locator('[data-brand-map]')).toHaveAttribute('data-brand-map','4');
   const provinces=await page.locator('[data-brand-branch] p').allTextContents();
   expect(provinces.map(x=>x.split(', ').pop())).toEqual(['Cartago','Guanacaste','Heredia','San José']);// by province, never by payment
   await expectNoHorizontalOverflow(page);
   await featureShots(page,`brand-page-${language}`,info);
   await gotoOK(page,`${prefix}/lugar/${slugs[0]}`);
   await expect(page.locator(`[data-place-brand="${b.slug}"]`)).toContainText(en?'Branch of':'Sucursal de');
  }
  // Staff split the «Express» branch into a new brand, then merge it back; the merged slug redirects.
  const newBrandId=uid();
  const split=await db.rpc('dir_admin_brand_split',{p_actor:staff,p_input:{actionId:uid(),brandId:b.id,newBrandId,name:`${brand} Express`,placeSlugs:[slugs[3]],reason:'Formato distinto (E2E)',expectedRevision:b.revision}});
  expect(split.error).toBeNull();const express=(split.data as {slug:string}).slug;
  await gotoOK(page,`/marca/${b.slug}`);await expect(page.locator('[data-brand-branch]')).toHaveCount(3);
  const staleMerge=await db.rpc('dir_admin_brand_merge',{p_actor:staff,p_input:{actionId:uid(),brandId:newBrandId,intoBrandId:b.id,reason:'x y z',expectedRevision:99}});
  expect(staleMerge.error?.code).toBe('40001');
  const merge=await db.rpc('dir_admin_brand_merge',{p_actor:staff,p_input:{actionId:uid(),brandId:newBrandId,intoBrandId:b.id,reason:'Es la misma cadena (E2E)',expectedRevision:1}});
  expect(merge.error).toBeNull();
  await gotoOK(page,`/marca/${express}`);await expect(page).toHaveURL(new RegExp(`/marca/${b.slug}$`));await expect(page.locator('[data-brand-branch]')).toHaveCount(4);
  expect((await db.from('dir_moderation_log').select('decision').in('target_id',[b.id,newBrandId]).order('id')).data!.map(r=>r.decision)).toEqual(['split','merge']);

  // The Pro owner (fixture account) claims the brand with a document (UI); staff approve; the owner edits the common
  // information through Pro (/api/pro/brand-info, CAS → 409).
  await context.setExtraHTTPHeaders(randomIp());
  await gotoOK(page,`/marca/${b.slug}`);
  const box=page.locator('[data-brand-claim="idle"][data-ready]');await expect(box).toBeVisible({timeout:45000});
  await box.locator('[data-brand-claim-file]').setInputFiles({name:'personeria.pdf',mimeType:'application/pdf',buffer:Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n')});
  await box.locator('[data-brand-claim-upload]').click();
  await expect(box.locator('[data-brand-claim-docs="1"]')).toBeVisible();
  await box.locator('[data-brand-claim-submit]').click();
  await expect(page.locator('[data-brand-claim="pending"]')).toBeVisible();
  // Someone cannot point at a document they did not upload for that claim.
  const foreign=await postJson(context,`/api/marca/${b.slug}/reclamo`,{actionId:uid(),claimId:uid(),documents:[{kind:'legal_personhood',path:`dir-claims/${uid()}/x.pdf`}]});
  expect([foreign.status,foreign.body?.reason]).toEqual([400,'claim_evidence']);
  const claim=(await db.from('dir_brand_claims').select('id,status').eq('brand_id',b.id).single()).data!;expect(claim.status).toBe('open');
  expect((await db.rpc('dir_admin_brand_claim_decide',{p_actor:f.owner.id,p_input:{actionId:uid(),claimId:claim.id,decision:'approve'}})).error?.hint).toBe('dir_claim_self_review');
  expect((await db.rpc('dir_admin_brand_claim_decide',{p_actor:staff,p_input:{actionId:uid(),claimId:claim.id,decision:'approve'}})).error).toBeNull();
  // PRO_ENABLED off: the brand-info editor is a Pro tool (not in «Mi negocio» yet): closed, the public brand page stays.
  if(proOff){expect((await context.request.get(`${origin}/api/pro/brand-info`)).status()).toBe(404);
   await gotoOK(page,`/es/marca/${b.slug}`);await expect(page.locator('[data-brand-claimed]')).toBeVisible();expect(errors()).toEqual([]);return;}
  const got=await context.request.get(`${origin}/api/pro/brand-info`,{headers:{'X-Pro-Expected-Actor':f.owner.id}});expect(got.status()).toBe(200);
  const mine=((await got.json()).brands as {id:string;revision:number}[]).find(x=>x.id===b.id)!;
  const save=await postJson(context,'/api/pro/brand-info',{actionId:uid(),brandId:b.id,revision:mine.revision,website:'https://cadena.example.test',descriptionEs:'Supermercados de barrio.',descriptionEn:'Neighbourhood supermarkets.'},{'X-Pro-Expected-Actor':f.owner.id});
  expect(save.status,JSON.stringify(save.body)).toBe(200);
  const stale=await postJson(context,'/api/pro/brand-info',{actionId:uid(),brandId:b.id,revision:mine.revision,website:null,descriptionEs:null,descriptionEn:null},{'X-Pro-Expected-Actor':f.owner.id});
  expect([stale.status,stale.body?.reason]).toEqual([409,'reload']);
  for(const language of ['es','en'] as const){
   const prefix=language==='en'?'/en':'/es';// explicit /es: the locale cookie of the earlier EN pass would keep English
   await gotoOK(page,`${prefix}/marca/${b.slug}`);
   await expect(page.locator('[data-brand-claimed]')).toBeVisible();
   await expect(page.locator('[data-brand-website]')).toHaveAttribute('href','https://cadena.example.test');
   await expect(page.locator('main')).toContainText(language==='en'?'Neighbourhood supermarkets.':'Supermercados de barrio.');
   await gotoOK(page,`${prefix}/lugar/${slugs[1]}`);
   await expect(page.locator('[data-place-brand]')).toContainText(language==='en'?'Neighbourhood supermarkets.':'Supermercados de barrio.');
  }
  expect(errors()).toEqual([]);
 }finally{await f.cleanup();}
});
