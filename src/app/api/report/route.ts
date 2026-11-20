import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { enforceRateLimit } from "@/lib/rate-limit";
import { resolveReportTarget,type ReportKind } from "@/lib/moderation/report-target";
const schema=z.object({professionalSlug:z.string().min(1).max(200),professionalName:z.string().max(200).optional(),reason:z.string().trim().min(5).max(2000),reporterEmail:z.unknown().optional(),targetType:z.enum(["professional","project","job","offer","review"]).optional(),targetId:z.string().uuid().optional()});
export async function POST(req: Request) {
 const limited=enforceRateLimit(req,"report-public",10,600000);if(limited)return limited;
 const parsed=schema.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Indica el contenido y un motivo de 5–2000 caracteres."},{status:400});
 const p=parsed.data,db=createAdminClient();
 const {data:{user}}=await (await createClient()).auth.getUser();
 let kind:ReportKind=p.targetType??"professional",id=p.targetId;
 if(!id){
  const project=p.professionalSlug.match(/^proyecto-([0-9a-f-]{36})$/i);
  const context=p.reason.match(/^(Empleo|Promoción|Proyecto)[\s\S]*?\(([0-9a-f-]{36})\)/i);
  if(project){kind="project";id=project[1];}
  else if(context){kind=context[1].toLowerCase()==="empleo"?"job":context[1].toLowerCase()==="proyecto"?"project":"offer";id=context[2];}
  else {const {data}=await db.from("professionals").select("id").eq("slug",p.professionalSlug).maybeSingle();id=data?.id;}
 }
 if(!id)return NextResponse.json({error:"Contenido no encontrado."},{status:404});
 const target=await resolveReportTarget(db,kind,id);if(!target)return NextResponse.json({error:"Contenido no encontrado."},{status:404});
 const priority=/suplantaci[oó]n|estafa|fraude/i.test(p.reason)?"high":"normal";
 const {error}=await db.from("reports").insert({...target,reason:p.reason,reporter_id:user?.id??null,reporter_email:user?.email??null,priority,status:"open"});
 if(error)return NextResponse.json({error:"No se pudo guardar el reporte. Intenta de nuevo o contacta soporte."},{status:503});
 return NextResponse.json({ok:true});
}
