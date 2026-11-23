import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {SIGNATURE_HEADER} from '@/lib/pro/integrations/webhook';
import {providerSecrets} from '@/lib/pro/integrations/server';
import {receiveEvent,receiveMockEvent,type EsignEvent} from '@/lib/pro/integrations/esign/service';
import {connectStatus,DocusignClient,verifyConnectHmac} from '@/lib/pro/integrations/esign/docusign';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6B: webhook inbox of the electronic signature provider (development only).
// · Mock events: X-CCR-Signature (HMAC-SHA256 over «t.body», ±5 min), idempotent by event id.
// · DocuSign Connect (sandbox/production, INACTIVE without env keys): X-DocuSign-Signature-1 =
//   base64(HMAC-SHA256(Connect key, raw body)); on envelope-completed the signed PDF and the certificate are
//   downloaded from DocuSign and stored with the status change. Bad signatures are counted apart.
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'webhook-esign',120,60000);if(limited)return limited;
 if(Number(req.headers.get('content-length')||'0')>262144)return Response.json({status:'rejected',reason:'size'},{status:413,headers});
 const body=await req.text();if(body.length>262144)return Response.json({status:'rejected',reason:'size'},{status:413,headers});
 const db=createAdminClient(),mock=req.headers.get(SIGNATURE_HEADER),docusign=req.headers.get('x-docusign-signature-1');
 try{
  if(mock){const outcome=await receiveMockEvent(db,body,mock);return Response.json(outcome.body,{status:outcome.status,headers});}
  if(docusign){
   for(const mode of ['sandbox','production'] as const){
    const secrets=providerSecrets('esign',mode),key=secrets?.[`PRO_DOCUSIGN_${mode==='sandbox'?'SANDBOX':'PROD'}_CONNECT_HMAC`];
    if(!secrets||!key||!verifyConnectHmac(key,body,docusign))continue;
    const json=JSON.parse(body) as {event?:string;generatedDateTime?:string;data?:{envelopeId?:string;envelopeSummary?:{voidedReason?:string;status?:string}}};
    const status=connectStatus(json.event??'',json.data?.envelopeSummary?.voidedReason),envelopeId=json.data?.envelopeId;
    if(!status||!envelopeId||!/^[a-f0-9-]{36}$/i.test(envelopeId))return Response.json({status:'ignored'},{headers});
    const event:EsignEvent={id:`ds_${envelopeId}_${json.event}`.slice(0,120),envelopeId,status:status as EsignEvent['status'],at:json.generatedDateTime??new Date().toISOString(),reason:json.data?.envelopeSummary?.voidedReason};
    const client=new DocusignClient(mode,secrets);
    const outcome=await receiveEvent(db,mode,event,async()=>client.documents(envelopeId));
    return Response.json(outcome.body,{status:outcome.status,headers});
   }
   await db.rpc('pro_integration_webhook_reject',{p_provider:'esign',p_reason:'docusign_hmac_or_not_configured'});
   return Response.json({status:'rejected',reason:'not_configured'},{status:401,headers});
  }
  await db.rpc('pro_integration_webhook_reject',{p_provider:'esign',p_reason:'unsigned'});
  return Response.json({status:'rejected',reason:'missing'},{status:401,headers});
 }catch{return Response.json({status:'failed',reason:'retry'},{status:500,headers});}
}
