import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {clientFiscalSettingsSchema} from '@/lib/pro/client-fiscal';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const clientId=z.string().trim().min(1).max(160).parse(new URL(req.url).searchParams.get('clientId'));
 const result=await access.db.rpc('pro_client_fiscal_read',{p_user:access.user.id,p_client:clientId});
 if(result.error)return proDbFailure(result.error);
 return result.data?Response.json(result.data,{headers}):Response.json({error:'Cliente no disponible.'},{status:404,headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const input=clientFiscalSettingsSchema.parse(await req.json());
 const owned=await access.db.rpc('pro_client_fiscal_read',{p_user:access.user.id,p_client:input.clientId});if(owned.error)return proDbFailure(owned.error);if(!owned.data)return Response.json({error:'Cliente no disponible.'},{status:404,headers});
 const result=await access.db.rpc('pro_client_fiscal_save',{p_user:access.user.id,p_client:input.clientId,p_revision:input.revision,p_receiver:input.receiver});
 if(result.error){if(['22023','23514','23503'].includes(result.error.code))return Response.json({error:'Revise el cliente y sus datos para facturas.'},{status:400,headers});return proDbFailure(result.error);}
 return Response.json(result.data,{headers});
 }catch{return Response.json({error:'Revise los datos para facturas.'},{status:400,headers});}
}
