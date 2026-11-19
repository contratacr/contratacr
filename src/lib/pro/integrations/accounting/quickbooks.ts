import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {timedFetch} from '../server';
import {quickbooksApiBase} from '../oauth/providers';

/**
 * Round 6B: QuickBooks Online adapter. Entities are plain QBO JSON (Customer, Invoice, Payment). Updates
 * send Id + SyncToken (optimistic concurrency of QBO: a stale SyncToken is rejected by Intuit).
 * · MockQuickbooks: pro_mock_qbo_entities is the company (seeded accounts and Costa Rica tax codes).
 * · RealQuickbooks: REST v3 (minorversion 75) with the OAuth access token and realmId. Not run locally.
 */
type Db=ReturnType<typeof createAdminClient>;
export type QboEntity='customer'|'invoice'|'payment';
export type QboRecord={id:string;syncToken:string;data:Record<string,unknown>};
export type QboOption={id:string;name:string;type:string};
export interface QuickbooksAdapter{
 get(entity:QboEntity,id:string):Promise<QboRecord|null>;
 upsert(entity:QboEntity,data:Record<string,unknown>,current?:{id:string;syncToken:string}):Promise<QboRecord>;
 options():Promise<{accounts:QboOption[];taxCodes:QboOption[]}>;
 calls:{operation:string;url:string;status:number;durationMs:number}[];
}
const SEED_ACCOUNTS:QboOption[]=[{id:'1',name:'Servicios de construcción y remodelación',type:'Income'},{id:'2',name:'Venta de materiales',type:'Income'},{id:'35',name:'Banco Nacional · cuenta corriente',type:'Bank'},{id:'36',name:'BAC · cuenta colones',type:'Bank'},{id:'4',name:'Fondos no depositados',type:'Other Current Asset'}];
const SEED_TAX:QboOption[]=[{id:'5',name:'IVA 13 %',type:'TaxCode'},{id:'6',name:'IVA 4 %',type:'TaxCode'},{id:'7',name:'IVA 2 %',type:'TaxCode'},{id:'8',name:'IVA 1 %',type:'TaxCode'},{id:'9',name:'IVA 0,5 %',type:'TaxCode'},{id:'10',name:'Exento',type:'TaxCode'},{id:'11',name:'0 % sin crédito',type:'TaxCode'}];
export class MockQuickbooks implements QuickbooksAdapter{
 calls:QuickbooksAdapter['calls']=[];
 constructor(private db:Db,private owner:string){}
 private note(operation:string,status=200){this.calls.push({operation,url:'https://quickbooks.mock.local/v3/company/9130350000000001/'+operation,status,durationMs:0});}
 async options(){
  this.note('query_accounts');
  const existing=await this.db.from('pro_mock_qbo_entities').select('entity,id,data').eq('owner_id',this.owner).in('entity',['account','taxcode']);
  if(!existing.data?.length){
   await this.db.from('pro_mock_qbo_entities').insert([...SEED_ACCOUNTS.map(a=>({owner_id:this.owner,entity:'account',id:a.id,data:a})),...SEED_TAX.map(t=>({owner_id:this.owner,entity:'taxcode',id:t.id,data:t}))]);
   return {accounts:SEED_ACCOUNTS,taxCodes:SEED_TAX};
  }
  const rows=existing.data as {entity:string;data:QboOption}[];
  return {accounts:rows.filter(r=>r.entity==='account').map(r=>r.data),taxCodes:rows.filter(r=>r.entity==='taxcode').map(r=>r.data)};
 }
 async get(entity:QboEntity,id:string){
  this.note('read_'+entity);
  const row=await this.db.from('pro_mock_qbo_entities').select('id,sync_token,data').eq('owner_id',this.owner).eq('entity',entity).eq('id',id).maybeSingle();
  return row.data?{id:row.data.id as string,syncToken:String(row.data.sync_token),data:row.data.data as Record<string,unknown>}:null;
 }
 async upsert(entity:QboEntity,data:Record<string,unknown>,current?:{id:string;syncToken:string}){
  if(current){
   const row=await this.get(entity,current.id);
   if(!row)throw new QuickbooksError(400,'Object Not Found');
   // Same rule as Intuit: a stale SyncToken is rejected (stale object error 5010).
   if(row.syncToken!==current.syncToken){this.note('update_'+entity,400);throw new QuickbooksError(400,'Stale Object Error');}
   const next=Number(row.syncToken)+1;
   await this.db.from('pro_mock_qbo_entities').update({data:{...data,Id:current.id,SyncToken:String(next)},sync_token:next,updated_at:new Date().toISOString()}).eq('owner_id',this.owner).eq('entity',entity).eq('id',current.id).throwOnError();
   this.note('update_'+entity);return {id:current.id,syncToken:String(next),data};
  }
  const max=await this.db.from('pro_mock_qbo_entities').select('id').eq('owner_id',this.owner).in('entity',['customer','invoice','payment']);
  const id=String(100+(max.data?.length??0)+1);
  await this.db.from('pro_mock_qbo_entities').insert({owner_id:this.owner,entity,id,sync_token:0,data:{...data,Id:id,SyncToken:'0'}}).throwOnError();
  this.note('create_'+entity,200);return {id,syncToken:'0',data};
 }
 /** Mock only: an edit made directly in QuickBooks (bumps SyncToken). */
 async remoteEdit(entity:QboEntity,id:string){
  const row=await this.get(entity,id);if(!row)throw new QuickbooksError(400,'Object Not Found');
  const data={...row.data};
  if(entity==='customer')data.Notes=String(data.Notes??'')+' · editado en QuickBooks';else data.PrivateNote=String(data.PrivateNote??'')+' · editado en QuickBooks';
  const next=Number(row.syncToken)+1;
  await this.db.from('pro_mock_qbo_entities').update({data:{...data,SyncToken:String(next)},sync_token:next,updated_at:new Date().toISOString()}).eq('owner_id',this.owner).eq('entity',entity).eq('id',id).throwOnError();
 }
}
export class QuickbooksError extends Error{constructor(readonly status:number,message:string){super(message);this.name='QuickbooksError';}}
export class RealQuickbooks implements QuickbooksAdapter{
 calls:QuickbooksAdapter['calls']=[];
 constructor(private mode:'sandbox'|'production',private token:string,private realmId:string){}
 private url(path:string){return `${quickbooksApiBase(this.mode)}/v3/company/${encodeURIComponent(this.realmId)}/${path}${path.includes('?')?'&':'?'}minorversion=75`;}
 private async call(operation:string,path:string,init:RequestInit={}){
  const url=this.url(path),result=await timedFetch(url,{...init,headers:{Authorization:'Bearer '+this.token,Accept:'application/json','Content-Type':'application/json'}});
  this.calls.push({operation,url,status:result.status,durationMs:result.durationMs});
  if(!result.response||result.status>=300)throw new QuickbooksError(result.status,'QuickBooks '+operation+' '+result.status);
  return await result.response.json() as Record<string,unknown>;
 }
 private static key:Record<QboEntity,string>={customer:'Customer',invoice:'Invoice',payment:'Payment'};
 async get(entity:QboEntity,id:string){
  try{const json=await this.call('read_'+entity,`${entity}/${encodeURIComponent(id)}`);const row=json[RealQuickbooks.key[entity]] as {Id:string;SyncToken:string}&Record<string,unknown>;return {id:row.Id,syncToken:row.SyncToken,data:row};}
  catch(error){if(error instanceof QuickbooksError&&error.status===400)return null;throw error;}
 }
 async upsert(entity:QboEntity,data:Record<string,unknown>,current?:{id:string;syncToken:string}){
  const json=await this.call((current?'update_':'create_')+entity,entity,{method:'POST',body:JSON.stringify(current?{...data,Id:current.id,SyncToken:current.syncToken,sparse:true}:data)});
  const row=json[RealQuickbooks.key[entity]] as {Id:string;SyncToken:string}&Record<string,unknown>;return {id:row.Id,syncToken:row.SyncToken,data:row};
 }
 async options(){
  const q=async(sql:string)=>((await this.call('query',`query?query=${encodeURIComponent(sql)}`)).QueryResponse??{}) as Record<string,{Id:string;Name:string;AccountType?:string}[]>;
  const items=(await q("select Id, Name, Type from Item where Type = 'Service' maxresults 100")).Item??[];
  const banks=(await q("select Id, Name, AccountType from Account where AccountType in ('Bank','Other Current Asset') maxresults 100")).Account??[];
  const taxes=(await q('select Id, Name from TaxCode maxresults 100')).TaxCode??[];
  return {accounts:[...items.map(i=>({id:i.Id,name:i.Name,type:'Income'})),...banks.map(a=>({id:a.Id,name:a.Name,type:a.AccountType??'Bank'}))],taxCodes:taxes.map(t=>({id:t.Id,name:t.Name,type:'TaxCode'}))};
 }
}
