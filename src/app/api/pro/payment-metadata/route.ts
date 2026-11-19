import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {paymentMetadataQuery,paymentMetadataCursor,paymentMetadataCorrection} from '@/lib/pro/payment-metadata';
const headers={'Cache-Control':'private, no-store'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const input=paymentMetadataQuery.parse(Object.fromEntries(new URL(req.url).searchParams));
  const result=await access.db.rpc('pro_payment_metadata_read',{p_user:access.user.id,p_id:input.id,p_after:decodeCursor(input.after,paymentMetadataCursor)});
  if(result.error)return result.error.code==='22023'?Response.json({error:'Consulta inválida.'},{status:400,headers}):proDbFailure(result.error);
  return result.data?Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor)},{headers}):Response.json({error:'Pago no encontrado.'},{status:404,headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 const parsed=paymentMetadataCorrection.safeParse(await req.json().catch(()=>null));
 if(!parsed.success)return Response.json({error:'Revise la fecha, el medio, la referencia y el motivo de la corrección.'},{status:400,headers});
 const result=await access.db.rpc('pro_payment_metadata_correct',{p_user:access.user.id,p_input:parsed.data});
 if(result.error){if(result.error.code==='40001')return Response.json({error:'Los datos del pago cambiaron. Recargue y revise su corrección.'},{status:409,headers});if(['22023','23503','23505','23514'].includes(result.error.code))return Response.json({error:'Revise los datos y confirme que el pago sigue activo. No se guardaron cambios.'},{status:400,headers});return proDbFailure(result.error);}
 return result.data?Response.json(result.data,{headers}):Response.json({error:'Pago no encontrado.'},{status:404,headers});
}
