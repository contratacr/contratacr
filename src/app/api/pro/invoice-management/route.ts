import {z} from 'zod';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
import {invoiceManagementSchema} from '@/lib/pro/invoice-management';
const headers={'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'};
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{const query=new URL(req.url).searchParams;
 if(query.has('id')){const id=z.string().uuid().parse(query.get('id')),result=await access.db.rpc('pro_invoice_management_read',{p_user:access.user.id,p_id:id});if(result.error)return proDbFailure(result.error);return result.data?Response.json(result.data,{headers}):Response.json({error:'Borrador no encontrado.'},{status:404,headers});}
 const q=z.string().trim().max(160).parse(query.get('q')??''),archived=z.enum(['0','1']).parse(query.get('archived')??'0');
 const cursor=decodeCursor(query.get('after'),z.object({at:z.string().datetime({offset:true}),id:z.string().uuid(),q:z.string().max(160),archived:z.enum(['0','1'])}));if(cursor&&(cursor.q!==q||cursor.archived!==archived))throw Error();
 const result=await access.db.rpc('pro_invoice_management_page',{p_user:access.user.id,p_search:q,p_archived:archived==='1',p_after:cursor});if(result.error)return proDbFailure(result.error);
 return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor?{...result.data.nextCursor,q,archived}:null)},{headers});
 }catch{return Response.json({error:'Consulta inválida.'},{status:400,headers});}
}
export async function POST(req:Request){const access=await proApiAccess(req);if(access.error)return access.error;
 try{const input=invoiceManagementSchema.parse(await req.json()),result=await access.db.rpc('pro_invoice_management_save',{p_user:access.user.id,p_input:input});if(result.error){if(result.error.code==='22023')return Response.json({error:'El borrador no está disponible para esta acción.'},{status:400,headers});return proDbFailure(result.error);}return Response.json({id:result.data},{headers});}
 catch{return Response.json({error:'Acción de borrador inválida.'},{status:400,headers});}
}
