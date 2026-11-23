import {createAdminClient} from '@/lib/supabase/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {SIGNATURE_HEADER} from '@/lib/pro/integrations/webhook';
import {receiveMockEvent} from '@/lib/pro/integrations/payments/service';
import {PRO_ENABLED} from '@/lib/pro/enabled';

// Round 6A: webhook inbox of the payment processor (development only).
// · Mock events carry X-CCR-Signature (HMAC-SHA256 over «t.body», ±5 min) and are booked exactly once
//   (inbox unique by event id; ledger id derived from it). Bad signatures are counted apart and never
//   reserve an event id.
// · Real Tilopay notifications have no public signature (orderHash is not public): the sandbox skeleton
//   must CONFIRM each one with /api/v1/consult before booking. Not active: without keys it answers 503.
const headers={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
export async function POST(req:Request){
 if(!PRO_ENABLED)return new Response(null,{status:404,headers});
 const limited=await enforceRateLimit(req,'webhook-tilopay',120,60000);if(limited)return limited;
 const length=Number(req.headers.get('content-length')||'0');if(length>65536)return Response.json({status:'rejected',reason:'size'},{status:413,headers});
 const body=await req.text();if(body.length>65536)return Response.json({status:'rejected',reason:'size'},{status:413,headers});
 const signature=req.headers.get(SIGNATURE_HEADER);
 const db=createAdminClient();
 if(!signature){
  // Real-provider path (sandbox skeleton). Never trusted without the API confirmation; not configured here.
  await db.rpc('pro_integration_webhook_reject',{p_provider:'tilopay',p_reason:'unsigned_not_configured'});
  return Response.json({status:'rejected',reason:'not_configured'},{status:503,headers});
 }
 try{const outcome=await receiveMockEvent(db,body,signature);return Response.json(outcome.body,{status:outcome.status,headers});}
 catch{return Response.json({status:'failed',reason:'retry'},{status:500,headers});}
}
