import {z} from 'zod';
import {preparationFromDefaults,documentDefaultsSchema} from '@/lib/pro/invoice-document-settings';
import {invoiceIssuerSchema} from '@/lib/pro/invoice-preparation';
import {crTodayISO} from '@/lib/time-cr';
import {proApiAccess,proDbFailure} from '@/lib/pro/api-access';
import {invoiceMutationSchema,invoiceSourceKind} from '@/lib/pro/invoice-drafts';
import {decodeCursor,encodeCursor} from '@/lib/pro/panel-queries';
const headers={'Cache-Control':'no-store'};
function failure(error:{code?:string;message?:string;hint?:string}|null){
 // Round 6A: an emitted electronic document locks the draft content.
 if(error?.code==='22023'&&error.hint==='pro_einvoice_emitted')return Response.json({error:'Este borrador ya se emitió como comprobante electrónico y quedó bloqueado. Para corregirlo emita una nota de crédito.',reason:'emitted'},{status:400,headers});
 if(error?.code==='22023'&&error.hint==='pro_credit_notes_balance')return Response.json({error:'El total no puede quedar por debajo de los pagos y las notas de crédito aplicados. Revierta primero la aplicación que desea corregir.',reason:'credit_notes'},{status:400,headers});
 if(error?.code==='22023'&&error.message==='Invoice total is below active applications')return Response.json({error:'El total no puede ser menor que los pagos aplicados. Quite primero la aplicación que desea corregir.',reason:'applied_payments'},{status:400,headers});
 if(error?.code==='22023'||error?.code==='23503'||error?.code==='23514')return Response.json({error:'Revise el origen, el cliente y los impuestos del borrador. No se guardó ningún cambio.'},{status:400,headers});
 return proDbFailure(error);
}
export async function GET(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const query=new URL(req.url).searchParams,id=query.get('id');
  if(id){
   z.string().uuid().parse(id);
   const cursor=decodeCursor(query.get('after'),z.object({entryId:z.string().uuid()}));
   const result=await access.db.rpc('pro_invoice_extras_read',{p_user:access.user.id,p_id:id,p_after:cursor});
   if(result.error)return failure(result.error);
   if(!result.data)return Response.json({error:'Borrador no encontrado'},{status:404,headers});
   return Response.json({draft:{...result.data,nextCursor:encodeCursor(result.data.nextCursor)}},{headers});
  }
  if(!query.has('kind')){
   const search=z.string().trim().max(160).parse(query.get('q')??'');
   const cursor=decodeCursor(query.get('after'),z.object({at:z.string().datetime({offset:true}),id:z.string().uuid(),q:z.string().max(160)}));
   if(cursor&&cursor.q!==search)throw Error('Cursor mismatch');
   const result=await access.db.rpc('pro_invoice_draft_page',{p_user:access.user.id,p_search:search,p_after:cursor});
   if(result.error)return failure(result.error);
   return Response.json({...result.data,nextCursor:encodeCursor(result.data.nextCursor?{...result.data.nextCursor,q:search}:null)},{headers});
  }
  const kind=invoiceSourceKind.parse(query.get('kind')),sourceId=z.string().trim().min(1).max(160).parse(query.get('sourceId'));
  const result=await access.db.rpc('pro_invoice_fiscal_source',{p_user:access.user.id,p_kind:kind,p_id:sourceId});
  if(result.error)return failure(result.error);
  if(!result.data)return Response.json({error:'Origen no disponible para preparar un borrador.'},{status:404,headers});
  const defaults=await access.db.rpc('pro_invoice_issuer_read',{p_user:access.user.id});if(defaults.error)return failure(defaults.error);
  const documents=await access.db.rpc('pro_invoice_document_settings_read',{p_user:access.user.id});if(documents.error)return failure(documents.error);
  // Round 11: every empty issuer field starts from the company identity (business name, cédula and its
  // type, contact e-mail, phone «+506 XXXX-XXXX», address); saved issuer settings win field by field
  // (pro_company_fiscal_identity). It stays editable and nothing is saved until the owner saves the draft.
  const identity=await access.db.rpc('pro_company_fiscal_identity',{p_owner:access.user.id});if(identity.error)return failure(identity.error);
  const issuer=invoiceIssuerSchema.parse({...defaults.data.issuer,...(identity.data?.issuer??{})});
  const preparation=preparationFromDefaults(documentDefaultsSchema.parse(documents.data.defaults),issuer,crTodayISO());
  return Response.json({source:result.data,existingId:result.data.existingId??null,issuerDefaults:issuer,preparationDefaults:preparation,defaultNotes:documents.data.defaults.notes},{headers});
 }catch{return Response.json({error:'Consulta inválida'},{status:400,headers});}
}
export async function POST(req:Request){
 const access=await proApiAccess(req);if(access.error)return access.error;
 try{
  const input=invoiceMutationSchema.parse(await req.json());
  const result=await access.db.rpc('pro_invoice_extras_save',{p_user:access.user.id,p_input:input});
  if(result.error)return failure(result.error);
  return Response.json({id:result.data},{headers});
 }catch{return Response.json({error:'Datos de borrador inválidos'},{status:400,headers});}
}
