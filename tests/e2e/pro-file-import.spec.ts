import {test,expect} from 'playwright/test';
import {gotoOK,expectNoHorizontalOverflow,collectPageErrors} from './helpers';
import {origin,proOwner} from './pro-file-ops-harness';
import {ImportAdapterError,driveImportAdapter,liveDriveAdapter,sandboxDriveAdapter} from '../../src/lib/pro/file-import';
import {importItemIds} from '../../src/lib/pro/file-import-ids'

// Row 31: import from an external drive behind an adapter. The adapter contract (sandbox, live with a fake Google) is tested
// without a network; the API and the screen run in sandbox mode. Real Google Drive is NOT exercised: it needs the owner's
// Google project and a per-company connection screen, so that part stays open and is said so in the register.
const api='/api/pro/file-import',lib='/api/pro/company-files';

test('Drive adapter contract: sandbox, live selection and live protocol with a fake Google',async()=>{
 const sandbox=sandboxDriveAdapter();expect(sandbox.mode).toBe('sandbox');
 const list=await sandbox.list();expect(list.map(f=>f.id)).toEqual(['sandbox-plano','sandbox-foto','sandbox-notas','sandbox-instalador']);
 expect((await sandbox.fetch('sandbox-plano')).bytes.subarray(0,5).toString('latin1')).toBe('%PDF-');
 await expect(sandbox.fetch('nope')).rejects.toMatchObject({code:'not_found'});
 expect(driveImportAdapter({}).mode).toBe('sandbox');
 expect(()=>driveImportAdapter({PRO_DRIVE_IMPORT_MODE:'live'})).toThrow(ImportAdapterError);
 expect(()=>driveImportAdapter({PRO_DRIVE_IMPORT_MODE:'live',GOOGLE_DRIVE_CLIENT_ID:'a'})).toThrow(/not_configured/);
 // Deterministic ids per batch and item, different across batches and items.
 const batch=crypto.randomUUID(),one=importItemIds(batch,'x'),two=importItemIds(batch,'x');expect(one).toEqual(two);
 expect(importItemIds(batch,'y').fileId).not.toBe(one.fileId);expect(importItemIds(crypto.randomUUID(),'x').fileId).not.toBe(one.fileId);expect(one.fileId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-8[0-9a-f]{3}-[0-9a-f]{12}$/);
 // Live protocol against a fake Google: token refresh, list without native Google Docs, size limit, secrets only from the environment.
 const calls:string[]=[];
 const fake:typeof fetch=async(input,init)=>{const url=String(input);calls.push(url.split('?')[0]);
  if(url.startsWith('https://oauth2.googleapis.com/token')){expect(String(init?.body)).toContain('refresh_token=rt');return new Response(JSON.stringify({access_token:'at'}));}
  expect((init?.headers as Record<string,string>).Authorization).toBe('Bearer at');
  if(url.includes('/drive/v3/files?'))return new Response(JSON.stringify({files:[{id:'abcde1',name:'plano.pdf',mimeType:'application/pdf',size:'1200',modifiedTime:'2026-02-01T00:00:00Z'},{id:'doc111',name:'Doc nativo',mimeType:'application/vnd.google-apps.document',modifiedTime:'2026-02-01T00:00:00Z'}]}));
  if(url.includes('alt=media'))return new Response(Buffer.from('%PDF-1.4\n%%EOF\n'));
  if(url.includes('/files/huge1'))return new Response(JSON.stringify({name:'enorme.pdf',size:String(500*1024*1024)}));
  if(url.includes('/files/gone1'))return new Response('{}',{status:404});
  return new Response(JSON.stringify({name:'plano.pdf',size:'14'}));};
 const live=liveDriveAdapter({GOOGLE_DRIVE_CLIENT_ID:'id',GOOGLE_DRIVE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_REFRESH_TOKEN:'rt'},fake);expect(live.mode).toBe('live');
 expect(await live.list()).toEqual([{id:'abcde1',name:'plano.pdf',mimeType:'application/pdf',sizeBytes:1200,modifiedAt:'2026-02-01T00:00:00Z'}]);
 expect((await live.fetch('abcde1')).name).toBe('plano.pdf');
 await expect(live.fetch('huge1')).rejects.toMatchObject({code:'size'});await expect(live.fetch('gone1')).rejects.toMatchObject({code:'not_found'});await expect(live.fetch('../etc')).rejects.toMatchObject({code:'not_found'});
 const down=liveDriveAdapter({GOOGLE_DRIVE_CLIENT_ID:'id',GOOGLE_DRIVE_CLIENT_SECRET:'secret',GOOGLE_DRIVE_REFRESH_TOKEN:'rt'},async()=>new Response('x',{status:500}));
 await expect(down.list()).rejects.toMatchObject({code:'unavailable'});expect(calls.length).toBeGreaterThan(3);
});

for(const language of ['es','en'] as const)test(`Drive import in sandbox mode: batch, per-file result, idempotent retry [${language}]`,async({page,baseURL})=>{
 test.setTimeout(300000);expect(baseURL).toBe(origin);expect(process.env.NEXT_PUBLIC_SUPABASE_URL).toBe('http://127.0.0.1:54321');
 const en=language==='en',errors=collectPageErrors(page);
 const h=await proOwner(page,'fim');const {db,owner,headers,post}=h;
 try{
  const state=await page.request.get(api,{headers:{'X-Pro-Expected-Actor':owner.id}});expect(state.status()).toBe(200);
  const listed=await state.json();expect(listed.mode).toBe('sandbox');expect(listed.candidates).toHaveLength(4);
  const folderId=crypto.randomUUID();await post(lib,{action:'folder_save',actionId:crypto.randomUUID(),folderId,revision:0,parentId:null,name:'Importados',favorite:false});
  const actionId=crypto.randomUUID(),body={action:'import',source:'drive',actionId,folderId,items:[{externalId:'sandbox-plano'},{externalId:'sandbox-foto'},{externalId:'sandbox-notas'},{externalId:'sandbox-instalador'}]};
  const first=await post(api,body);expect(first.mode).toBe('sandbox');
  expect(first.results.map((r:{externalId:string;ok:boolean})=>[r.externalId,r.ok])).toEqual([['sandbox-plano',true],['sandbox-foto',true],['sandbox-notas',true],['sandbox-instalador',false]]);
  expect(first.results[3].reason).toBe('type');
  const stored=(await db.from('pro_company_files').select('id,name,mime_type,folder_id,ready').eq('owner_id',owner.id).throwOnError()).data!;expect(stored).toHaveLength(3);expect(stored.every(f=>f.folder_id===folderId&&f.ready)).toBe(true);
  // A retry of the same batch never duplicates: same files, receipts replayed.
  const again=await post(api,body);expect(again.results.filter((r:{ok:boolean})=>r.ok).every((r:{replayed:boolean})=>r.replayed)).toBe(true);
  expect((await db.from('pro_company_files').select('id').eq('owner_id',owner.id).throwOnError()).data).toHaveLength(3);
  expect((await db.from('pro_file_transfers').select('item_key,status,reason,mode,kind').eq('owner_id',owner.id).eq('kind','import').throwOnError()).data).toHaveLength(4);
  expect((await db.from('pro_file_transfers').update({status:'done'}).eq('owner_id',owner.id)).error).not.toBeNull();
  // Validation: unknown source, too many, duplicates, empty, foreign origin, unknown folder.
  await post(api,{...body,source:'dropbox'},400);await post(api,{...body,actionId:crypto.randomUUID(),items:[]},400);
  await post(api,{...body,actionId:crypto.randomUUID(),items:[{externalId:'a'},{externalId:'a'}]},400);
  await post(api,{...body,actionId:crypto.randomUUID(),items:Array.from({length:11},(_,i)=>({externalId:'x'+i}))},400);
  await post(api,{...body,actionId:crypto.randomUUID(),folderId:crypto.randomUUID()},404);
  expect((await page.request.post(api,{headers:{...headers,Origin:'http://evil.example'},data:body})).status()).toBe(403);
  const missing=await post(api,{...body,actionId:crypto.randomUUID(),items:[{externalId:'no-existe'}]});expect(missing.results[0]).toMatchObject({ok:false,reason:'not_found'});

  // ---- UI ----
  await gotoOK(page,`/${language}/dashboard/pro?tab=pro_files`);const library=page.locator('[data-company-files]');
  await library.locator('[data-file-import-open]').click({timeout:60000});
  const dialog=page.getByRole('dialog',{name:en?'Import from Drive':'Importar desde Drive'});
  await expect(dialog.locator('[data-file-import-mode="sandbox"]')).toContainText(en?'Test mode':'Modo de prueba',{timeout:60000});
  await expect(dialog.locator('[data-file-import-item]')).toHaveCount(4);
  await dialog.getByLabel(en?'Choose Foto de ejemplo.jpg':'Elegir Foto de ejemplo.jpg').check();await dialog.getByLabel(en?'Choose instalador.exe':'Elegir instalador.exe').check();
  await dialog.locator('[data-file-import-run]').click();
  await expect(dialog.locator('[data-file-import-item="sandbox-foto"] [data-file-import-result]')).toHaveAttribute('data-file-import-result','done',{timeout:60000});
  await expect(dialog.locator('[data-file-import-item="sandbox-instalador"] [data-file-import-result]')).toContainText(en?'Format not accepted.':'Formato no aceptado.');
  await expectNoHorizontalOverflow(page);expect(errors()).toEqual([]);
 }finally{await page.goto('about:blank').catch(()=>{});await h.cleanup();}
});
