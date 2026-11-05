import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { privateHeaders as headers } from "@/lib/moderation/admin";
export async function GET(){
 if(!(await getApiAdmin()))return NextResponse.json({error:"No autorizado"},{status:403,headers});
 const {data,error}=await (await createClient()).rpc("admin_staff_directory");
 return error?NextResponse.json({error:"Requiere administración completa."},{status:403,headers}):NextResponse.json({rows:data},{headers});
}
const schema=z.object({user:z.string().uuid(),moderation:z.boolean(),support:z.boolean(),identity:z.boolean(),chat:z.boolean(),reason:z.string().trim().min(5).max(1000)}).strict();
export async function POST(req:Request){
 if(!(await getApiAdmin()))return NextResponse.json({error:"No autorizado"},{status:403,headers});
 if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403,headers});
 const p=schema.safeParse(await req.json().catch(()=>null));if(!p.success)return NextResponse.json({error:"Datos inválidos"},{status:400,headers});
 const {error}=await (await createClient()).rpc("admin_set_staff",{p_user:p.data.user,p_moderation:p.data.moderation,p_support:p.data.support,p_identity:p.data.identity,p_chat:p.data.chat,p_reason:p.data.reason});
 return error?NextResponse.json({error:"No se pudo guardar el permiso y su auditoría."},{status:403,headers}):NextResponse.json({ok:true},{headers});
}
