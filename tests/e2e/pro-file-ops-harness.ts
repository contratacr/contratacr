import {expect,type BrowserContext,type Page} from 'playwright/test';
import {createHash} from 'node:crypto';
import {createServerClient} from '@supabase/ssr';
import {createDisposableAccount,cleanupDisposableAccount,type DisposableAccount} from './disposable-account';
import {regressionAdminClient} from './seed';
import {emptyBusiness} from '../../src/lib/pro/business';
import {crTodayISO} from '../../src/lib/time-cr';
import {stabilizeLocalProRuntime} from './pro-local-stable-runtime';

/** Shared setup of the file-operations specs (rows 28 to 31): a Pro owner with one job, a login helper and storage cleanup. */
export const origin='http://127.0.0.1:3185';
export const sha=(bytes:Uint8Array)=>createHash('sha256').update(bytes).digest('hex');
export const pdf=(text:string)=>Buffer.from(`%PDF-1.4\n% ${text}\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF\n`,'latin1');
export async function loginAs(context:BrowserContext,actor:DisposableAccount){await stabilizeLocalProRuntime(context,origin);const auth=createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{cookies:{getAll:()=>[],setAll:async cookies=>context.addCookies(cookies.map(cookie=>({name:cookie.name,value:cookie.value,url:origin,sameSite:'Lax' as const})))}});expect((await auth.auth.signInWithPassword({email:actor.email,password:actor.password})).error).toBeNull();}
export async function proOwner(page:Page,prefix:string){
 const db=regressionAdminClient(),owner=await createDisposableAccount({prefix});
 const user=await db.auth.admin.getUserById(owner.id);expect((await db.auth.admin.updateUserById(owner.id,{user_metadata:{...user.data.user!.user_metadata,is_provider:true,role:'professional'}})).error).toBeNull();
 await db.from('profiles').update({is_provider:true,role:'professional'}).eq('id',owner.id).throwOnError();await db.from('pro_memberships').insert({user_id:owner.id,status:'active'}).throwOnError();
 await db.from('professionals').insert({profile_id:owner.id,category_id:'desarrollo_web',business_name:'Biblioteca local',slug:prefix+'-'+owner.id,whatsapp:'',provincia_id:'al',canton_id:'al-at',verification_status:'pending',is_banned:false,is_available:true}).throwOnError();
 const workId=crypto.randomUUID(),clientId=prefix+'-client',day=crTodayISO(),document=emptyBusiness();
 document.clients=[{id:clientId,name:'Cliente biblioteca',email:'',phone:'',notes:'',archived:false}];
 document.work=[{id:workId,clientId,client:'Cliente biblioteca',service:'Obra de archivos',stage:'scheduled',start:day+'T09:00:00-06:00',end:day+'T10:00:00-06:00',cancelled:false}];
 await db.from('pro_workspaces').insert({user_id:owner.id,document,revision:1}).throwOnError();await loginAs(page.context(),owner);
 for(const endpoint of ['/api/auth/session-mfa','/api/auth/registration-state','/api/pro/access'])expect((await page.request.get(endpoint,{timeout:45000})).status()).toBe(200);
 expect((await page.request.get('/api/pro/client-operations?'+new URLSearchParams({workId,clientId}),{timeout:45000})).status()).toBe(200);
 const headers={Origin:origin,'X-Pro-Expected-Actor':owner.id};
 const post=async(url:string,data:Record<string,unknown>,status=200)=>{const r=await page.request.post(url,{headers,data,timeout:60000});expect(r.status(),JSON.stringify(data).slice(0,160)).toBe(status);return status===200?await r.json():null;};
 const cleanStorage=async()=>{for(const [table,bucket] of [['pro_company_files','pro-company-files'],['pro_work_files','pro-work-files']] as const){const paths=(await db.from(table).select('object_path').eq('owner_id',owner.id).throwOnError()).data!.map(row=>row.object_path as string);if(paths.length)expect((await db.storage.from(bucket).remove(paths)).error).toBeNull();}};
 return{db,owner,workId,clientId,headers,post,cleanStorage,cleanup:async()=>{await cleanStorage().catch(()=>{});await cleanupDisposableAccount(owner);}};
}

/** Minimal stored (uncompressed) zip: enough for the server's OOXML check (same helper as pro-files-library.spec.ts). */
const crcTable=Array.from({length:256},(_,n)=>{let c=n;for(let k=0;k<8;k++)c=c&1?0xedb88320^(c>>>1):c>>>1;return c>>>0;});
const crc32=(data:Buffer)=>{let c=0xffffffff;for(const b of data)c=crcTable[(c^b)&0xff]^(c>>>8);return (c^0xffffffff)>>>0;};
export function zip(entries:Record<string,string>){
 const locals:Buffer[]=[],centrals:Buffer[]=[];let offset=0;
 for(const [name,text] of Object.entries(entries)){
  const data=Buffer.from(text,'utf8'),file=Buffer.from(name,'utf8'),crc=crc32(data);
  const local=Buffer.alloc(30);local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);local.writeUInt32LE(crc,14);local.writeUInt32LE(data.length,18);local.writeUInt32LE(data.length,22);local.writeUInt16LE(file.length,26);
  const central=Buffer.alloc(46);central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);central.writeUInt16LE(20,6);central.writeUInt32LE(crc,16);central.writeUInt32LE(data.length,20);central.writeUInt32LE(data.length,24);central.writeUInt16LE(file.length,28);central.writeUInt32LE(offset,42);
  locals.push(local,file,data);centrals.push(central,file);offset+=30+file.length+data.length;
 }
 const dir=Buffer.concat(centrals),end=Buffer.alloc(22);end.writeUInt32LE(0x06054b50,0);end.writeUInt16LE(Object.keys(entries).length,8);end.writeUInt16LE(Object.keys(entries).length,10);end.writeUInt32LE(dir.length,12);end.writeUInt32LE(offset,16);
 return Buffer.concat([...locals,dir,end]);
}
const types='<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"/>';
export const DOCX='application/vnd.openxmlformats-officedocument.wordprocessingml.document';
export const docx=()=>zip({'[Content_Types].xml':types,'word/document.xml':'<w:document/>'});
