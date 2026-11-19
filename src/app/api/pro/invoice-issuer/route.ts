import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {issuerSettingsSchema} from '@/lib/pro/issuer-settings';
const headers={'Cache-Control':'no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const result=await access.db.rpc('pro_invoice_issuer_read',{p_user:access.user.id});
 return result.error?proDbFailure(result.error):Response.json(result.data,{headers});
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const input=issuerSettingsSchema.parse(await req.json());const result=await access.db.rpc('pro_invoice_issuer_save',{p_user:access.user.id,p_revision:input.revision,p_issuer:input.issuer});return result.error?proDbFailure(result.error):Response.json(result.data,{headers});}
 catch{return Response.json({error:'Revise los datos del emisor.'},{status:400,headers});}
}
