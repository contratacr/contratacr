import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderationAccess, privateHeaders as headers } from "@/lib/moderation/admin";
import { revalidatePath } from "next/cache";
import { enforceRateLimit } from "@/lib/rate-limit";
import { invalidateProfessionalCache } from "@/lib/cache/professional-revision";

const action = z.object({
  kind: z.enum(["project","job","offer","review","professional","account"]),
  id: z.string().uuid(), action: z.enum(["hide","restore","warn","restrict","unrestrict"]),
  reason: z.string().trim().min(5).max(1000), report: z.string().uuid().nullable().default(null),
  days: z.number().int().min(1).max(30).default(7),
}).strict();

export async function POST(req: Request) {
  const access = await moderationAccess();
  if (!access) return NextResponse.json({error:"No autorizado para moderar."},{status:403,headers});
  const limited = enforceRateLimit(req,"admin-moderation",30,60000); if(limited) return limited;
  if(req.headers.get("origin") !== new URL(req.url).origin) return NextResponse.json({error:"Origen inválido"},{status:403,headers});
  const parsed = action.safeParse(await req.json().catch(()=>null));
  if(!parsed.success) return NextResponse.json({error:"Indica contenido, acción y motivo (5–1000 caracteres)."},{status:400,headers});
  const p=parsed.data;
  const {data,error}=await access.db.rpc("moderate_content",{p_kind:p.kind,p_id:p.id,p_action:p.action,p_reason:p.reason,p_report:p.report,p_days:p.days});
  if(error) return NextResponse.json({error:"No se pudo guardar la decisión y su auditoría. Revisa el contenido y los permisos."},{status:409,headers});
  if(p.kind === "professional" || p.kind === "review") await invalidateProfessionalCache();
  for(const path of ["/proyectos","/empleos","/promociones","/profesionales","/buscar"]) {
    revalidatePath(path,"layout"); revalidatePath(`/en${path}`,"layout");
  }
  return NextResponse.json(data,{headers});
}

export async function GET(req: Request) {
  const access=await moderationAccess();
  if(!access) return NextResponse.json({error:"No autorizado"},{status:403,headers});
  if(new URL(req.url).searchParams.get("signals")==="1") {
    const {data,error}=await access.db.rpc("admin_moderation_signals");
    return error?NextResponse.json({error:"No se pudieron calcular las señales."},{status:503,headers}):NextResponse.json({rows:data},{headers});
  }
  const url=new URL(req.url), page=Math.max(0,Math.min(100000,Number(url.searchParams.get("offset"))||0));
  const db=createAdminClient();
  const id=url.searchParams.get("id");
  let q=db.from("moderation_actions").select("id,actor_id,report_id,target_type,target_id,action,reason,created_at").order("created_at",{ascending:false}).order("id").range(page,page+49);
  if(id && z.string().uuid().safeParse(id).success) q=q.eq("target_id",id);
  const {data,error}=await q;
  if(error) return NextResponse.json({error:"No se pudo leer el historial."},{status:503,headers});
  return NextResponse.json({rows:data},{headers});
}
