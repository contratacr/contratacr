import 'server-only';
import type {createAdminClient} from '@/lib/supabase/admin';
import {logOutbound} from '../server';
import {moneyText} from '../esign/document';
import {accessToken,connectionMode,OAuthError} from '../oauth/service';
import {invoiceBreakdown,mappingGaps,type AccountingMapping,type SourceCustomer,type SourceInvoice,type SourcePayment,type Sources} from './model';
import {MockQuickbooks,QuickbooksError,RealQuickbooks,type QboEntity,type QuickbooksAdapter} from './quickbooks';

/**
 * Round 6B: QuickBooks sync. Order: customers → invoices → payments (each needs the remote id of the previous).
 * Per record: new → create; only ContrataCR changed → update with the stored SyncToken; only QuickBooks
 * changed → the QuickBooks version is kept (token recorded, nothing overwritten); BOTH changed or the remote
 * record disappeared → conflict with both versions, untouched until the owner resolves it.
 */
type Db=ReturnType<typeof createAdminClient>;
type Link={entity:QboEntity;localId:string;remoteId:string|null;syncToken:string|null;hash:string;label:string;status:'synced'|'conflict'|'error';conflict:unknown};
export type AccountingRead={mapping:AccountingMapping;links:Link[];history:unknown[]};
async function rpc<T>(db:Db,name:string,args:Record<string,unknown>):Promise<T>{
 const result=await db.rpc(name,args);
 if(result.error){const e=result.error as {code?:string;hint?:string};throw new OAuthError(e.code==='40001'?409:e.code==='42501'?403:e.code==='22023'?400:503,e.hint||e.code||'db','db');}
 return result.data as T;
}
export async function quickbooksFor(db:Db,owner:string){
 const resolved=await connectionMode(db,owner,'quickbooks');
 if(resolved.status!=='ready')throw new OAuthError(409,resolved.status,'QuickBooks no disponible en este modo.');
 const token=await accessToken(db,owner,'quickbooks');
 if(!token||token.mode!==resolved.mode)throw new OAuthError(409,'not_connected','Conecte QuickBooks primero.');
 const adapter:QuickbooksAdapter=resolved.mode==='mock'?new MockQuickbooks(db,owner):new RealQuickbooks(resolved.mode,token.token,token.realmId??'');
 return {adapter,mode:resolved.mode};
}
async function flush(db:Db,owner:string,mode:'mock'|'sandbox'|'production',adapter:QuickbooksAdapter,correlation:string){
 for(const call of adapter.calls.splice(0))await logOutbound(db,owner,{provider:'quickbooks',mode,operation:call.operation.slice(0,60),url:call.url,statusCode:call.status,outcome:call.status>=200&&call.status<300?'ok':'error',durationMs:call.durationMs,correlation});
}
const money=(cents:number)=>Math.round(cents)/100;
function customerBody(c:SourceCustomer){return {DisplayName:(c.tradeName||c.name).slice(0,100),CompanyName:c.tradeName?c.name.slice(0,100):undefined,PrimaryEmailAddr:c.email?{Address:c.email}:undefined,PrimaryPhone:c.phone?{FreeFormNumber:c.phone.slice(0,30)}:undefined,Notes:('Identificación: '+(c.identification||'-')).slice(0,2000)};}
function invoiceBody(i:SourceInvoice,customerId:string,m:AccountingMapping){
 return {CustomerRef:{value:customerId},DocNumber:i.number.slice(0,21),TxnDate:i.date,CurrencyRef:{value:i.currency},PrivateNote:(i.emitted?'Clave Hacienda '+i.clave:'Borrador interno (no emitido ante Hacienda)').slice(0,4000),
  Line:invoiceBreakdown(i).rows.map(row=>({DetailType:'SalesItemLineDetail',Amount:money(row.netCents),Description:row.description.slice(0,4000),SalesItemLineDetail:{ItemRef:{value:m.incomeAccount},TaxCodeRef:{value:m.vatMap[row.vatCode as keyof typeof m.vatMap]}}}))};
}
function paymentBody(p:SourcePayment,customerId:string,invoiceId:string,m:AccountingMapping){return {CustomerRef:{value:customerId},TotalAmt:money(p.amountCents),TxnDate:p.date,DepositToAccountRef:{value:m.depositAccount},PaymentRefNum:p.reference.slice(0,21)||undefined,Line:[{Amount:money(p.amountCents),LinkedTxn:[{TxnId:invoiceId,TxnType:'Invoice'}]}]};}
const summary=(entity:QboEntity,item:SourceCustomer|SourceInvoice|SourcePayment)=>entity==='customer'?{name:(item as SourceCustomer).name,email:(item as SourceCustomer).email}:entity==='invoice'?{number:(item as SourceInvoice).number,totalCents:(item as SourceInvoice).totalCents}:{amountCents:(item as SourcePayment).amountCents,date:(item as SourcePayment).date};
const remoteSummary=(data:Record<string,unknown>)=>({syncToken:String(data.SyncToken??''),displayName:data.DisplayName,docNumber:data.DocNumber,total:data.TotalAmt,note:typeof data.Notes==='string'?data.Notes.slice(0,200):typeof data.PrivateNote==='string'?data.PrivateNote.slice(0,200):undefined});
const label=(entity:QboEntity,item:SourceCustomer|SourceInvoice|SourcePayment)=>entity==='customer'?(item as SourceCustomer).name:entity==='invoice'?(item as SourceInvoice).number+' · '+(item as SourceInvoice).customer:'Pago '+(item as SourcePayment).date+' · '+moneyText((item as SourcePayment).amountCents);
export type AccountingSummary={created:number;updated:number;remoteKept:number;conflicts:number;errors:number;unchanged:number;gaps:string[]};
export async function syncQuickbooks(db:Db,owner:string,correlation:string):Promise<AccountingSummary>{
 const {adapter,mode}=await quickbooksFor(db,owner);
 const out:AccountingSummary={created:0,updated:0,remoteKept:0,conflicts:0,errors:0,unchanged:0,gaps:[]};
 try{
  const read=await rpc<AccountingRead>(db,'pro_accounting_read',{p_actor:owner,p_mode:mode}),sources=await rpc<Sources>(db,'pro_accounting_sources',{p_actor:owner,p_scope:null});
  const mapping=read.mapping;out.gaps=mappingGaps(mapping,sources);
  if(out.gaps.length)return out;
  const links=new Map(read.links.map(l=>[l.entity+':'+l.localId,l]));
  const remoteOf=(entity:QboEntity,id:string)=>links.get(entity+':'+id)?.status==='synced'||links.get(entity+':'+id)?.status==='conflict'?links.get(entity+':'+id)!.remoteId:null;
  const put=async(link:Record<string,unknown>)=>{await rpc(db,'pro_accounting_link_put',{p_actor:owner,p_mode:mode,p_link:link});links.set(link.entity+':'+link.localId,link as unknown as Link);};
  const step=async(entity:QboEntity,item:SourceCustomer|SourceInvoice|SourcePayment,body:()=>Record<string,unknown>|string)=>{
   const link=links.get(entity+':'+item.localId),base={entity,localId:item.localId,hash:item.hash,label:label(entity,item).slice(0,200)};
   if(link?.status==='conflict'){out.conflicts++;return;}
   try{
    if(!link||!link.remoteId){
     const data=body();if(typeof data==='string'){await put({...base,status:'error',error:data});out.errors++;return;}
     const made=await adapter.upsert(entity,data);await put({...base,remoteId:made.id,syncToken:made.syncToken,status:'synced'});out.created++;return;
    }
    const remote=await adapter.get(entity,link.remoteId),localChanged=link.hash!==item.hash||link.status==='error',remoteChanged=!remote||remote.syncToken!==link.syncToken;
    if(!localChanged&&!remoteChanged){out.unchanged++;return;}
    if(!remote){await put({...base,hash:link.hash,remoteId:link.remoteId,syncToken:link.syncToken,status:'conflict',conflict:{reason:'remote_deleted',local:summary(entity,item),remote:null}});out.conflicts++;return;}
    if(localChanged&&remoteChanged){await put({...base,hash:link.hash,remoteId:link.remoteId,syncToken:link.syncToken,status:'conflict',conflict:{reason:'both_changed',local:summary(entity,item),remote:remoteSummary(remote.data)}});out.conflicts++;return;}
    if(remoteChanged){await put({...base,hash:link.hash,remoteId:link.remoteId,syncToken:remote.syncToken,status:'synced'});out.remoteKept++;return;}
    const data=body();if(typeof data==='string'){await put({...base,hash:link.hash,remoteId:link.remoteId,syncToken:link.syncToken,status:'error',error:data});out.errors++;return;}
    const updated=await adapter.upsert(entity,data,{id:link.remoteId,syncToken:link.syncToken!});await put({...base,remoteId:link.remoteId,syncToken:updated.syncToken,status:'synced'});out.updated++;
   }catch(error){
    if(error instanceof QuickbooksError&&/Stale/.test(error.message)&&link){await put({...base,hash:link.hash,remoteId:link.remoteId,syncToken:link.syncToken,status:'conflict',conflict:{reason:'both_changed',local:summary(entity,item),remote:null}});out.conflicts++;return;}
    await put({...base,hash:link?.hash??item.hash,remoteId:link?.remoteId??null,syncToken:link?.syncToken??null,status:'error',error:(error instanceof Error?error.message:'error').slice(0,200)});out.errors++;
   }
  };
  const customers=new Map(sources.customers.map(c=>[c.localId,c]));
  for(const c of sources.customers)await step('customer',c,()=>customerBody(c));
  for(const i of sources.invoices)await step('invoice',i,()=>{const customer=remoteOf('customer',i.clientId);return customer?invoiceBody(i,customer,mapping):customers.has(i.clientId)?'Cliente sin sincronizar':'Cliente archivado: no se puede sincronizar';});
  for(const p of sources.payments)await step('payment',p,()=>{const customer=remoteOf('customer',p.clientId),invoice=remoteOf('invoice',p.invoiceId);return customer&&invoice?paymentBody(p,customer,invoice,mapping):'Factura sin sincronizar';});
  await rpc(db,'pro_accounting_note',{p_actor:owner,p_action:'sync',p_detail:{mode,...out}});
  return out;
 }finally{await flush(db,owner,mode,adapter,correlation);}
}
export async function resolveQuickbooks(db:Db,owner:string,input:{entity:QboEntity;localId:string;choice:'keep_local'|'keep_remote'},correlation:string){
 const {adapter,mode}=await quickbooksFor(db,owner);
 try{
  const read=await rpc<AccountingRead>(db,'pro_accounting_read',{p_actor:owner,p_mode:mode}),link=read.links.find(l=>l.entity===input.entity&&l.localId===input.localId&&l.status==='conflict');
  if(!link)throw new OAuthError(409,'no_conflict','Ese conflicto ya se resolvió.');
  const sources=await rpc<Sources>(db,'pro_accounting_sources',{p_actor:owner,p_scope:'all'});
  const item=(input.entity==='customer'?sources.customers:input.entity==='invoice'?sources.invoices:sources.payments).find(row=>row.localId===input.localId);
  const remote=link.remoteId?await adapter.get(input.entity,link.remoteId):null;
  const base={entity:input.entity,localId:input.localId,label:link.label};
  if(input.choice==='keep_remote'){
   if(!remote)throw new OAuthError(400,'remote_deleted','El registro ya no existe en QuickBooks: conserve la versión de ContrataCR.');
   await rpc(db,'pro_accounting_link_put',{p_actor:owner,p_mode:mode,p_link:{...base,hash:item?.hash??link.hash,remoteId:link.remoteId,syncToken:remote.syncToken,status:'synced'}});
  }else{
   if(!item)throw new OAuthError(400,'local_missing','El registro ya no existe en ContrataCR.');
   const customerRemote=(id:string)=>read.links.find(l=>l.entity==='customer'&&l.localId===id)?.remoteId??null;
   const invoiceRemote=(id:string)=>read.links.find(l=>l.entity==='invoice'&&l.localId===id)?.remoteId??null;
   const data=input.entity==='customer'?customerBody(item as SourceCustomer):input.entity==='invoice'?invoiceBody(item as SourceInvoice,customerRemote((item as SourceInvoice).clientId)??'',read.mapping):paymentBody(item as SourcePayment,customerRemote((item as SourcePayment).clientId)??'',invoiceRemote((item as SourcePayment).invoiceId)??'',read.mapping);
   const written=remote?await adapter.upsert(input.entity,data,{id:remote.id,syncToken:remote.syncToken}):await adapter.upsert(input.entity,data);
   await rpc(db,'pro_accounting_link_put',{p_actor:owner,p_mode:mode,p_link:{...base,hash:item.hash,remoteId:written.id,syncToken:written.syncToken,status:'synced'}});
  }
  await rpc(db,'pro_accounting_note',{p_actor:owner,p_action:'resolve',p_detail:{entity:input.entity,choice:input.choice}});
  return {status:'synced'};
 }finally{await flush(db,owner,mode,adapter,correlation);}
}
export async function simulateRemoteEdit(db:Db,owner:string,input:{entity:'customer'|'invoice';localId:string}){
 const {adapter,mode}=await quickbooksFor(db,owner);
 if(mode!=='mock'||!(adapter instanceof MockQuickbooks))throw new OAuthError(400,'mock_only','Solo disponible en simulación.');
 const read=await rpc<AccountingRead>(db,'pro_accounting_read',{p_actor:owner,p_mode:mode}),link=read.links.find(l=>l.entity===input.entity&&l.localId===input.localId);
 if(!link?.remoteId)throw new OAuthError(400,'not_synced','Sincronice primero ese registro.');
 await adapter.remoteEdit(input.entity,link.remoteId);return {ok:true};
}
