import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {clientSchema} from '@/lib/pro/business';
import {readClientRecord} from '@/lib/pro/catalog-records';

const headers={'Cache-Control':'no-store'};
const inputSchema=z.object({requestId:z.string().uuid()}).strict();
const failure=(status:number,error:string)=>Response.json({error},{status,headers});

async function context(req:Request,prepare:boolean){
 const a=await proApiAccess(req);if(a.error)return a.error;
 try{
  let input;
  if(prepare){const raw=await req.text();if(new TextEncoder().encode(raw).length>1024)return failure(413,'Solicitud demasiado grande.');input=inputSchema.parse(JSON.parse(raw));}
  else input=inputSchema.parse(Object.fromEntries(new URL(req.url).searchParams));
  const request=await a.db.from('pro_appointment_requests').select('id,owner_id,client_user_id,client_name,service,status').eq('id',input.requestId).eq('owner_id',a.user.id).maybeSingle();
  if(request.error)return proDbFailure(request.error);
  if(!request.data)return failure(404,'Solicitud no encontrada.');
  if(!['requested','proposed','confirmed'].includes(request.data.status))return failure(409,'Esta solicitud ya no permite preparar una cotización.');
  const clientId='reservation-'+request.data.client_user_id;
  // Read CAS revision before the contact: a concurrent insertion must never become an upsert over enriched data.
  const core=prepare?await a.db.from('pro_workspace_core').select('revision').eq('user_id',a.user.id).maybeSingle():null;
  if(core?.error)return proDbFailure(core.error);
  const read=()=>a.db.from('pro_clients').select('*').eq('user_id',a.user.id).eq('id',clientId).maybeSingle();
  let contact=await read();if(contact.error)return proDbFailure(contact.error);
  if(!contact.data&&prepare){
   const row=clientSchema.parse({id:clientId,name:request.data.client_name.trim()||'Cliente',email:'',phone:'',notes:'',archived:false});
   const saved=await a.db.rpc('pro_mutate_catalog',{p_user:a.user.id,p_kind:'clients',p_rows:[row],p_revision:core?.data?.revision??0,p_movements:[],p_importing:true});
   if(saved.error){
    if(!['40001','23505'].includes(saved.error.code))return proDbFailure(saved.error);
    contact=await read();if(contact.error)return proDbFailure(contact.error);
    if(!contact.data)return failure(409,'Los datos cambiaron. Intente preparar la cotización nuevamente.');
   }else{contact=await read();if(contact.error)return proDbFailure(contact.error);}
  }
  if(!contact.data)return failure(404,'Prepare la cotización desde la solicitud para asociar al cliente.');
  const client=readClientRecord(contact.data);
  if(client.archived)return failure(409,'El cliente está archivado. Revíselo en Clientes antes de preparar una cotización.');
  return Response.json({requestId:request.data.id,clientId,service:request.data.service,clientName:client.name},{headers});
 }catch{return failure(400,'Solicitud inválida.');}
}
export async function POST(req:Request){return context(req,true);}
export async function GET(req:Request){return context(req,false);}
