import { NextResponse } from "next/server";
import { z } from "zod";
import { moderationAccess,privateHeaders as headers } from "@/lib/moderation/admin";

const schema=z.object({report:z.string().uuid(),path:z.string().min(1).max(500).refine(s=>!s.includes("..")),
  action:z.enum(["quarantine","release"]),reason:z.string().trim().min(5).max(1000)}).strict();
export async function POST(req: Request) {
  const access=await moderationAccess();
  if(!access) return NextResponse.json({error:"No autorizado"},{status:403,headers});
  if(req.headers.get("origin")!==new URL(req.url).origin) return NextResponse.json({error:"Origen inválido"},{status:403,headers});
  const body=schema.safeParse(await req.json().catch(()=>null));
  if(!body.success) return NextResponse.json({error:"Datos de archivo inválidos"},{status:400,headers});
  const {data,error}=await access.db.rpc("moderate_reported_file",{p_report:body.data.report,p_path:body.data.path,p_action:body.data.action,p_reason:body.data.reason});
  if(error) return NextResponse.json({error:"No se pudo verificar el adjunto del reporte y registrar la decisión."},{status:409,headers});
  return NextResponse.json(data,{headers});
}
