import {NextResponse} from 'next/server';
import {createAdminClient} from '@/lib/supabase/admin';
import {isAuthorizedPushWorkerRequest} from '@/lib/push/worker-auth';
import {PRO_ENABLED} from '@/lib/pro/enabled';

export const runtime='nodejs';
export const dynamic='force-dynamic';
/** Row 24: hourly scheduler tick for the Pro digest (sandbox: records only, nothing is sent). Called by the Worker cron with the worker secret. */
export async function POST(request:Request){
 if(!PRO_ENABLED)return new NextResponse(null,{status:404});
 if(!process.env.PUSH_WORKER_SECRET&&!process.env.CRON_SECRET)return NextResponse.json({ok:false,error:'not_configured'},{status:503});
 if(!isAuthorizedPushWorkerRequest(request))return NextResponse.json({ok:false,error:'unauthorized'},{status:401});
 try{
  const r=await createAdminClient().rpc('pro_notification_digest_tick',{});
  if(r.error)return NextResponse.json({ok:false,error:'tick_failed'},{status:500});
  return NextResponse.json({ok:true,...(r.data as object)});
 }catch{return NextResponse.json({ok:false,error:'tick_failed'},{status:500});}
}
