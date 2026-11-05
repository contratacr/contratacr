import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { moderationAccess,privateHeaders as headers } from "@/lib/moderation/admin";
export async function GET(req: Request) {
 if(!(await moderationAccess()))return NextResponse.json({error:"No autorizado"},{status:403,headers});
 const params=new URL(req.url).searchParams,offset=Math.max(0,Math.min(100000,Number(params.get("offset"))||0));
 const db=createAdminClient();
 let q=db.from("reports").select("*",{count:"exact"}).order("created_at",{ascending:true}).order("id").range(offset,offset+49);
 const status=params.get("status")??"open",priority=params.get("priority");
 if(status==="open"||status==="resolved")q=q.eq("status",status);
 if(priority&&["normal","high","urgent"].includes(priority))q=q.eq("priority",priority);
 const {data,error,count}=await q;if(error)return NextResponse.json({error:"No se pudo cargar la cola de moderación."},{status:503,headers});
 const ids=[...new Set((data??[]).flatMap(r=>[r.subject_user_id,r.reported_client_id,r.blocked_profile_id,r.reporter_id,r.assigned_to]).filter(Boolean))];
 const {data:people,error:peopleError}=ids.length?await db.from("profiles").select("id,full_name").in("id",ids):{data:[],error:null};
 if(peopleError)return NextResponse.json({error:"No se pudieron identificar los participantes."},{status:503,headers});
 const names=new Map((people??[]).map(p=>[p.id,p.full_name]));
 return NextResponse.json({reports:(data??[]).map(r=>({...r,subject_user_id:r.subject_user_id??r.reported_client_id??r.blocked_profile_id??null,subject_name:names.get(r.subject_user_id??r.reported_client_id??r.blocked_profile_id)??r.professional_name??"Cuenta o contenido",reporter_name:names.get(r.reporter_id)??null,assigned_name:names.get(r.assigned_to)??null})),total:count},{headers});
}
const update=z.object({id:z.string().uuid(),status:z.enum(["open","resolved"]),priority:z.enum(["normal","high","urgent"]),reason:z.string().trim().min(5).max(1000),assign:z.boolean().default(false)}).strict();
export async function PATCH(req: Request) {
 const access=await moderationAccess();if(!access)return NextResponse.json({error:"No autorizado"},{status:403,headers});
 if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403,headers});
 const parsed=update.safeParse(await req.json().catch(()=>null));if(!parsed.success)return NextResponse.json({error:"Indica estado, prioridad y motivo."},{status:400,headers});
 const p=parsed.data;
 const {error}=await access.db.rpc("admin_case_update",{p_id:p.id,p_status:p.status,p_priority:p.priority,p_reason:p.reason,p_assign:p.assign});
 if(error)return NextResponse.json({error:"No se guardó la decisión y su auditoría."},{status:409,headers});
 return NextResponse.json({ok:true},{headers});
}
export async function DELETE(){if(!(await moderationAccess()))return NextResponse.json({error:"No autorizado"},{status:403,headers});return NextResponse.json({error:"Conserva el expediente: resuelve el caso con un motivo."},{status:405,headers});}
