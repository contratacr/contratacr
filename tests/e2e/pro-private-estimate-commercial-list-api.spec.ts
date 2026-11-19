import {test,expect} from 'playwright/test';
import {commercialFixture,cleanupCommercial,local,savedDraft,publishState,sales,publicationRows,assertCompact,snapshot,state,oldDocuments,estimateRows,post,estimates,publications} from './private-estimate-commercial-list-fixture';

// Preserve the cursor's six-digit UTC wire format without losing microseconds.
function cursorTimestamp(value:string){
 expect(value).toMatch(/Z$|\+00:00$/);
 const utc=value.replace(/\+00:00$/, 'Z');
 return utc.replace(/(?:\.(\d{1,6}))?Z$/,(_,fraction:string|undefined)=>'.'+(fraction??'').padEnd(6,'0')+'Z');
}

test('Commercial quote list API: latest publication states override mutable draft fields and archive visibility is explicit',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await commercialFixture(context,browser);
 try {
  const pending=await savedDraft(context,f,{title:'Cotización sin compartir'});
  const documents=[];
  for(const status of ['awaiting_claim','shared','changes_requested','accepted','declined','withdrawn'] as const){
   const draft=await savedDraft(context,f,{title:'PUBLICADA '+status}),publication=await publishState(context,f,draft,status);
   documents.push({draft,publication,status});
  }
  const accepted=documents.find(item=>item.status==='accepted')!;
  const contextB=await context.request.get(estimates+'?'+new URLSearchParams({view:'context',clientId:f.secondClient}));expect(contextB.status()).toBe(200);
  const draftB={...accepted.draft.input,actionId:crypto.randomUUID(),revision:1,clientId:f.secondClient,clientFingerprint:(await contextB.json()).clientFingerprint,refreshClient:true,title:'DRAFT_B_HIDDEN_SEARCH',currency:'CRC',lines:accepted.draft.input.lines.map(line=>({...line,unitPriceCents:10000}))};
  expect((await post(context,f.owner,draftB)).status()).toBe(200);
  const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),draftRows=await estimateRows(f),publishedRows=await publicationRows(f);
  const page=await sales(context);expect(page.items).toHaveLength(7);
  const bare=page.items.find((row:{id:string})=>row.id===pending.estimate.id);expect(bare).toMatchObject({status:'draft',publication:null,draft:{revision:1,status:'draft'}});
  for(const item of documents){
   const row=page.items.find((row:{id:string})=>row.id===item.draft.estimate.id),published=item.publication.publication;
   const commercial=['awaiting_claim','shared','changes_requested'].includes(item.status)?'sent':item.status;
   expect(row).toMatchObject({title:item.draft.estimate.title,clientId:f.clientId,client:item.draft.estimate.client.name,currency:'USD',totalCents:2472,status:commercial,at:cursorTimestamp(published.createdAt),publication:{publicationId:published.publicationId,version:1,estimateRevision:1,revision:published.revision,status:item.status,contentHash:published.contentHash,createdAt:published.createdAt},draft:{revision:item.status==='accepted'?2:1,status:'draft'}});
  }
  page.items.forEach(assertCompact);
  expect((await sales(context,{status:'draft'})).items.map((row:{id:string})=>row.id)).toEqual([pending.estimate.id]);
  expect((await sales(context,{status:'sent'})).items).toHaveLength(3);
  expect((await sales(context,{status:'accepted',clientId:f.clientId})).items.map((row:{id:string})=>row.id)).toEqual([accepted.draft.estimate.id]);
  expect((await sales(context,{status:'accepted',clientId:f.secondClient})).items).toEqual([]);
  expect((await sales(context,{q:'DRAFT_B_HIDDEN_SEARCH'})).items).toEqual([]);
  expect((await sales(context,{q:'PUBLICADA accepted'})).items.map((row:{id:string})=>row.id)).toEqual([accepted.draft.estimate.id]);
  expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(draftRows);expect(await publicationRows(f)).toEqual(publishedRows);

  expect((await post(context,f.owner,{action:'archive',actionId:crypto.randomUUID(),estimateId:accepted.draft.estimate.id,revision:2})).status()).toBe(200);
  expect((await sales(context)).items.some((row:{id:string})=>row.id===accepted.draft.estimate.id)).toBe(false);
  expect((await sales(context,{status:'accepted'})).items).toEqual([]);
  const archived=await sales(context,{status:'archived'});expect(archived.items).toHaveLength(1);expect(archived.items[0]).toMatchObject({id:accepted.draft.estimate.id,status:'archived',publication:{status:'accepted',publicationId:accepted.publication.publication.publicationId},draft:{revision:3,status:'archived'},title:accepted.draft.estimate.title,currency:'USD',totalCents:2472});
  expect((await post(context,f.owner,{action:'restore',actionId:crypto.randomUUID(),estimateId:accepted.draft.estimate.id,revision:3})).status()).toBe(200);
  expect((await sales(context,{status:'accepted'})).items[0]).toMatchObject({id:accepted.draft.estimate.id,status:'accepted',draft:{revision:4,status:'draft'}});
  expect((await f.db.from('professionals').select('*').eq('profile_id',f.owner.id).throwOnError()).data).toEqual([]);
 } finally {await cleanupCommercial(f);}
});

test('Commercial quote list API: immutable latest-version ordering pages mixed sources without full document reads or legacy rewrites',async({context,browser,baseURL})=>{
 test.setTimeout(180000);local(baseURL);const f=await commercialFixture(context,browser);
 try {
  const professional=(await f.db.from('professionals').insert({profile_id:f.owner.id,category_id:'desarrollo_web',business_name:'Emisor real del documento anterior',slug:'commercial-list-'+f.owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).select('id').single().throwOnError()).data!;
  const standardInput={context:'direct',clientActionId:crypto.randomUUID(),proClientId:f.clientId,clientName:'Cliente privado sin cuenta',clientPhone:null,clientEmail:null,clientCedula:null,title:'Documento estándar %_ á',notes:'Documento local, sin entrega externa.',items:[{description:'Servicio anterior',quantity:1,unit_price:50}],taxMode:'exento',validDays:15};
  const standardResponse=await post(context,f.owner,standardInput,'/api/pro/quote-create');expect(standardResponse.status()).toBe(200);const standardBody=await standardResponse.json(),standard=standardBody.quote??standardBody;expect(standard.professional_id).toBe(professional.id);
  await f.db.from('pro_legacy_quotes').insert({user_id:f.owner.id,id:standard.id,clientId:f.clientId,title:'Documento panel %_ á',status:'draft',validUntil:'2030-12-31'}).throwOnError();
  await f.db.from('pro_legacy_quote_lines').insert({user_id:f.owner.id,quote_id:standard.id,line_number:1,description:'Línea histórica',quantity:1.5,price:12.5,tax:13}).throwOnError();
  const selected=await savedDraft(context,f,{estimateId:standard.id,title:'PUBLICADA %_ á'}),firstVersion=await publishState(context,f,selected,'shared');
  const ids=[selected.estimate.id];
  for(let index=0;index<18;index++){const draft=await savedDraft(context,f,{title:'Privada %_ á '+index});ids.push(draft.estimate.id);}
  await savedDraft(context,f,{title:'Privada XX fuera del literal'});
  const before=await snapshot(f),privateBefore=await state(f),old=await oldDocuments(f),draftsBefore=await estimateRows(f),publicationsBefore=await publicationRows(f);
  const first=await sales(context,{q:'%_',clientId:f.clientId});expect(first.items).toHaveLength(20);expect(first.nextCursor).toEqual({at:first.items[19].at,key:first.items[19].key});
  const tail=await sales(context,{q:'%_',clientId:f.clientId,after:JSON.stringify(first.nextCursor)});expect(tail.items).toHaveLength(1);expect(tail.nextCursor).toBeNull();
  const rows=[...first.items,...tail.items];expect(rows.map((row:{key:string})=>row.key).toSorted()).toEqual([...ids.map(id=>'private_estimate:'+id),'standard:'+standard.id,'legacy:'+standard.id].toSorted());rows.forEach(assertCompact);
  expect(rows.filter((row:{id:string})=>row.id===standard.id).map((row:{kind:string})=>row.kind).toSorted()).toEqual(['legacy','private_estimate','standard']);
  expect(rows.find((row:{kind:string})=>row.kind==='standard')).toMatchObject({currency:'CRC',totalCents:5000,status:'sent'});expect(rows.find((row:{kind:string})=>row.kind==='legacy')).toMatchObject({currency:'CRC',totalCents:2119,status:'draft'});
  expect(rows.find((row:{key:string})=>row.key==='private_estimate:'+standard.id)).toMatchObject({currency:'USD',totalCents:2472,status:'sent',publication:{publicationId:firstVersion.publication.publicationId}});
  expect(await snapshot(f)).toEqual(before);expect(await state(f)).toEqual(privateBefore);expect(await oldDocuments(f)).toEqual(old);expect(await estimateRows(f)).toEqual(draftsBefore);expect(await publicationRows(f)).toEqual(publicationsBefore);

  // Move a real private anchor by publishing it, without changing the cursor shape.
  for(let index=0;index<2;index++){const draft=await savedDraft(context,f,{title:'Extra privada %_ á '+index});ids.push(draft.estimate.id);}
  const anchored=await sales(context,{q:'%_',clientId:f.clientId}),anchor=anchored.items.at(-1)!;
  expect(anchored.items).toHaveLength(20);expect(anchor.kind).toBe('private_estimate');expect(anchor.publication).toBeNull();
  const anchorPublish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:anchor.id,estimateRevision:anchor.draft.revision,recipient:{kind:'claim',email:f.recipient.email,code:crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-','')}};
  expect((await post(context,f.owner,anchorPublish,publications)).status()).toBe(200);
  expect((await context.request.get(estimates+'?'+new URLSearchParams({view:'sales',q:'%_',clientId:f.clientId,after:JSON.stringify(anchored.nextCursor)}))).status()).toBe(409);
  const fresh=await sales(context,{q:'%_',clientId:f.clientId}),freshTail=await sales(context,{q:'%_',clientId:f.clientId,after:JSON.stringify(fresh.nextCursor)});
  expect(fresh.items).toHaveLength(20);expect(freshTail.items).toHaveLength(3);expect(freshTail.nextCursor).toBeNull();
  expect([...fresh.items,...freshTail.items].map((row:{key:string})=>row.key).toSorted()).toEqual([...ids.map(id=>'private_estimate:'+id),'standard:'+standard.id,'legacy:'+standard.id].toSorted());

  const update={...selected.input,actionId:crypto.randomUUID(),revision:1,title:'NUEVA PUBLICADA %_ á',currency:'CRC',lines:selected.input.lines.map(line=>({...line,unitPriceCents:10000}))};
  const changed=await post(context,f.owner,update);expect(changed.status()).toBe(200);const changedEstimate=(await changed.json()).estimate;
  const publish={action:'publish',actionId:crypto.randomUUID(),publicationId:crypto.randomUUID(),estimateId:selected.estimate.id,estimateRevision:2,recipient:{kind:'existing',recipientId:f.recipient.id}};
  const published=await post(context,f.owner,publish,publications);expect(published.status()).toBe(200);const latest=(await published.json()).publication;
  const afterPublish=await sales(context,{q:'%_',clientId:f.clientId});expect(afterPublish.items[0]).toMatchObject({key:'private_estimate:'+selected.estimate.id,title:update.title,currency:'CRC',totalCents:changedEstimate.totalCents,at:cursorTimestamp(latest.createdAt),publication:{publicationId:latest.publicationId,version:2,estimateRevision:2,status:'shared'}});
  const oldDetail=await context.request.get(publications+'?'+new URLSearchParams({view:'detail',publicationId:firstVersion.publication.publicationId}));expect(oldDetail.status()).toBe(200);expect((await oldDetail.json()).publication).toMatchObject({status:'superseded',content:{title:selected.estimate.title,currency:'USD',totalCents:2472}});
  expect((await context.request.get(estimates+'?'+new URLSearchParams({view:'sales',q:'NO_MATCH',after:JSON.stringify(first.nextCursor)}))).status()).toBe(409);
  expect((await context.request.get(estimates+'?view=sales&after=bad')).status()).toBe(400);
  expect(await oldDocuments(f)).toEqual(old);
 } finally {await cleanupCommercial(f);}
});
