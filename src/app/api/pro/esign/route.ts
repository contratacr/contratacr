import {enforceRateLimit} from '@/lib/rate-limit';
import {proActor,proBoundedJson,proFail,proQuery,proRequestOrigin,proRouteHeaders as headers,proSameOrigin} from '@/lib/pro/route-common';
import {esignMutationSchema,esignQuerySchema} from '@/lib/pro/integrations/esign/api';
import {cancelRequest,createAndSend,EsignError,esignMode,esignRpc,mockSignerToken,mockSignerUrl,retrySend,type EsignRequest} from '@/lib/pro/integrations/esign/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: electronic signature requests of one document (contract version, quote publication or change
// order). GET lists them (expired ones are closed first) with the resolved mode; in mock mode a live request
// also returns the local signer link. POST: create (+send), cancel (CAS revision), retry (after a send error).
const messages:Record<string,string>={missing_keys:'Faltan las claves del proveedor de firma en el servidor.',production_refused:'Producción no está permitida en este servidor.',disabled:'La firma electrónica está desactivada.',
 pro_esign_not_signable:'Comparta primero el documento (contrato compartido, cotización publicada o cambio propuesto).',pro_esign_open:'Ya hay una solicitud de firma abierta para este documento.',pro_esign_final:'La solicitud ya terminó.'};
const fail=(error:unknown)=>error instanceof EsignError?Response.json({error:messages[error.reason]??(error.status===409?'La solicitud cambió. Actualice y vuelva a intentarlo.':error.status===404?'Documento no encontrado.':'No se pudo completar la operación.'),reason:error.reason},{status:error.status,headers}):proFail(503,'No se pudo comprobar la operación. Reintente la misma acción.');
export async function GET(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const raw=proQuery(req),parsed=raw?esignQuerySchema.safeParse(raw):null;if(!parsed?.success)return proFail(400,'Consulta inválida.');
  const data=await esignRpc<{document:unknown;blocked:string|null;requests:EsignRequest[]}>(a.db,'pro_esign_read',{p_actor:a.user.id,p_kind:parsed.data.kind,p_id:parsed.data.id});
  const origin=proRequestOrigin(req),resolved=await esignMode(a.db,a.user.id);
  const requests=data.requests.map(r=>({...r,signerUrl:r.mode==='mock'&&(r.status==='sent'||r.status==='viewed')?mockSignerUrl(origin,mockSignerToken(a.user.id,r.id)):null}));
  // Round 6C: automatic acceptance applied when a request was signed (outcome per request, immutable).
  const acceptances=await esignRpc<{requestId:string;outcome:string;reason:string|null;at:string}[]>(a.db,'pro_esign_acceptances_read',{p_actor:a.user.id,p_kind:parsed.data.kind,p_id:parsed.data.id});
  return Response.json({...data,requests:requests.map(r=>({...r,acceptance:acceptances.find(x=>x.requestId===r.id)??null})),mode:resolved.mode,modeStatus:resolved.status},{headers});
 }catch(error){return fail(error);}
}
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 if(!proSameOrigin(req))return proFail(403,'Origen no autorizado.');
 try{
  const a=await proActor(req);if(a.error)return a.error;
  const limited=await enforceRateLimit(req,'esign-'+a.user.id,30,60000);if(limited)return limited;
  let raw:unknown;try{raw=await proBoundedJson(req,8192);}catch(cause){return proFail(cause instanceof RangeError?413:400,'Revise la solicitud de firma.');}
  const input=esignMutationSchema.safeParse(raw);if(!input.success)return proFail(400,'Revise la solicitud de firma.');
  const body=input.data,origin=proRequestOrigin(req);
  const result=body.action==='create'?await createAndSend(a.db,a.user.id,body,origin):body.action==='cancel'?await cancelRequest(a.db,a.user.id,body):await retrySend(a.db,a.user.id,body.id,origin);
  const {snapshot:_snapshot,...visible}=result as EsignRequest;void _snapshot;
  return Response.json(visible,{headers});
 }catch(error){return fail(error);}
}
