import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { z } from "zod";
const headers={"Cache-Control":"private, no-store"};
export async function GET(){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Inicia sesión."},{status:401,headers});
 const {data,error}=await db.rpc("my_moderation_decisions");
 return error?NextResponse.json({error:"No se pudieron cargar las decisiones."},{status:503,headers}):NextResponse.json({rows:data},{headers});
}
const schema=z.object({report:z.string().uuid(),reason:z.string().trim().min(15).max(1000)}).strict();
export async function POST(req:Request){
 const db=await createClient();const {data:{user}}=await db.auth.getUser();if(!user)return NextResponse.json({error:"Inicia sesión."},{status:401,headers});
 if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403,headers});
 const p=schema.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Explica el motivo (15–1000 caracteres)."},{status:400,headers});
 const {error}=await db.rpc("request_moderation_appeal",{p_report:p.data.report,p_reason:p.data.reason});
 return error?NextResponse.json({error:"No se pudo solicitar la revisión; comprueba que sea una decisión tuya y que no esté pendiente."},{status:409,headers}):NextResponse.json({ok:true},{headers});
}
