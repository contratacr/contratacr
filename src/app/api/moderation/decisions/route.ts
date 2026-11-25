import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { z } from "zod";
const headers={"Cache-Control":"private, no-store"};
type DecisionRow={id:string;decision_reason:string;status:string;appealed_at:string|null;created_at:string};
// Como en otras plataformas, a la persona reportada no se le dice que la reportaron
// ni cuándo se revisa o se descarta un reporte: solo ve los reportes que terminaron
// en una sanción (advertencia, retiro o restricción), con el motivo de esa sanción.
// Parche en la app: la función de base de datos todavía devuelve todos los casos.
const SANCTIONS=["hide","warn","restrict"];
export async function GET(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Inicia sesión."},{status:401,headers});
 const {data,error}=await db.rpc("my_moderation_decisions");
 if(error)return NextResponse.json({error:"No se pudieron cargar las decisiones."},{status:503,headers});
 const rows=((data??[]) as DecisionRow[]).filter(r=>r&&typeof r.id==="string");
 if(!rows.length)return NextResponse.json({rows:[]},{headers});
 const {data:actions,error:actionsError}=await createAdminClient().from("moderation_actions").select("report_id,reason,created_at")
  .in("report_id",rows.map(r=>r.id)).in("action",SANCTIONS).order("created_at",{ascending:false});
 if(actionsError)return NextResponse.json({error:"No se pudieron cargar las decisiones."},{status:503,headers});
 const latest=new Map<string,{reason:string;created_at:string}>();
 for(const a of actions??[])if(a.report_id&&!latest.has(a.report_id))latest.set(a.report_id,{reason:a.reason,created_at:a.created_at});
 const visible=rows.filter(r=>latest.has(r.id)).map(r=>({...r,decision_reason:latest.get(r.id)!.reason,created_at:latest.get(r.id)!.created_at}));
 return NextResponse.json({rows:visible},{headers});
}
const schema=z.object({report:z.string().uuid(),reason:z.string().trim().min(15).max(1000)}).strict();
export async function POST(req:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Inicia sesión."},{status:401,headers});
 if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403,headers});
 const p=schema.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Explica el motivo (15–1000 caracteres)."},{status:400,headers});
 const {error}=await db.rpc("request_moderation_appeal",{p_report:p.data.report,p_reason:p.data.reason});
 return error?NextResponse.json({error:"No se pudo solicitar la revisión; compruebe que sea una decisión suya y que no esté pendiente."},{status:409,headers}):NextResponse.json({ok:true},{headers});
}
