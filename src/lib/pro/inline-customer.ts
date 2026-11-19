import {clientSchema,type Client} from './business';
import {clearClientWrite,continueClientWrite,createClientWrite,readClientWrite} from './client-write-recovery';

/**
 * «Agregar cliente» inside «Agregar solicitud»: creates the customer in place (no jump to Clientes and
 * back) through the SAME single-customer write contract as Clientes › Nuevo cliente
 * (client-write-recovery: one idempotent PATCH /api/pro/catalog, recovery record in localStorage,
 * canonical read before the customer is accepted). The lead draft never leaves the lead form.
 */
export type InlineCustomerFields={name:string;email:string;phone:string};
export type InlineCustomerResult=
 |{status:'created';client:Client}
 |{status:'invalid';field:'name'|'email'|'phone'}
 |{status:'pending'} // an unresolved customer save from Clientes exists: resolve it there first
 |{status:'rejected'}
 |{status:'uncertain'};
type Store=Pick<Storage,'getItem'|'setItem'|'removeItem'>;
type Fetch=(url:string,init?:RequestInit)=>Promise<Response>;

export function inlineCustomerRow(fields:InlineCustomerFields,id:string):{ok:true;row:Client}|{ok:false;field:'name'|'email'|'phone'}{
 const name=fields.name.trim(),email=fields.email.trim(),phone=fields.phone.trim();
 if(!name||name.length>160)return {ok:false,field:'name'};
 const parsed=clientSchema.strict().safeParse({id,name,email,phone,notes:'',archived:false});
 if(!parsed.success)return {ok:false,field:parsed.error.issues[0]?.path[0]==='phone'?'phone':parsed.error.issues[0]?.path[0]==='email'?'email':'name'};
 return {ok:true,row:parsed.data};
}

async function currentRevision(request:Fetch,actor:string){
 const response=await request('/api/pro/catalog?'+new URLSearchParams({kind:'clients'}),{cache:'no-store',headers:{'X-Pro-Expected-Actor':actor}});
 if(!response.ok)throw Error('revision');
 const body=await response.json() as {revision?:unknown;userId?:unknown};
 if(body.userId!==actor||typeof body.revision!=='number'||!Number.isInteger(body.revision)||body.revision<0)throw Error('revision');
 return body.revision;
}

export async function createCustomerInline({actor,fields,request,store,newId=()=>crypto.randomUUID(),currentAccount=()=>actor}:{actor:string;fields:InlineCustomerFields;request:Fetch;store:Store;newId?:()=>string;currentAccount?:()=>string|undefined}):Promise<InlineCustomerResult>{
 const built=inlineCustomerRow(fields,newId());
 if(!built.ok)return {status:'invalid',field:built.field};
 try{if(readClientWrite(store,actor))return {status:'pending'};}catch{return {status:'pending'};}
 // One automatic retry only for a revision conflict that the server rejected (nothing was written).
 for(let round=0;round<2;round++){
  let revision:number;
  try{revision=await currentRevision(request,actor);}catch{return {status:'uncertain'};}
  const attempt=createClientWrite(actor,{kind:'clients',revision,rows:[built.row],movements:[],importing:false,clientActionId:crypto.randomUUID(),clientWriteMode:'create'});
  try{
   const result=await continueClientWrite({store,attempt,request,currentAccount,onCheckpoint:()=>{}});
   if(result.status==='confirmed'){try{clearClientWrite(store,result.attempt);}catch{/* a confirmed record is harmless: Clientes reads it back and clears it */}return {status:'created',client:result.client};}
   if(result.code===409&&round===0)continue;
   return {status:'rejected'};
  }catch{
   // The attempt stays in localStorage: Clientes offers «Comprobar guardado» for it, exactly as for its own form.
   return {status:'uncertain'};
  }
 }
 return {status:'rejected'};
}
