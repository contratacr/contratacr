import { moderationAccess } from "@/lib/moderation/admin";
import { NextResponse } from "next/server";
import { invalidateProfessionalCache } from "@/lib/cache/professional-revision";

// POST /api/admin/providers/[id]/moderate — moderation actions. Admin-only.
//  action: "ban" | "unban" | "remove_photo"
//   - ban/unban: revoke/restore the professional from search (is_banned).
//   - remove_photo: drop one fake/inappropriate caso de éxito (portfolio_urls).
// Every action is recorded in provider_verification_log (audit trail).
export async function POST(req:Request,{params}:{params:Promise<{id:string}>}){
 const access=await moderationAccess();if(!access)return NextResponse.json({error:"No autorizado"},{status:403});
 if(req.headers.get("origin")!==new URL(req.url).origin)return NextResponse.json({error:"Origen inválido"},{status:403});
 const {id}=await params,p=await req.json().catch(()=>({}));
 if(typeof p.reason!=="string"||p.reason.trim().length<5)return NextResponse.json({error:"Indica un motivo de al menos cinco caracteres."},{status:400});
 const result=["remove_photo","restore_photo"].includes(p.action)
 ?await access.db.rpc("admin_portfolio_action",{p_id:id,p_url:p.url,p_restore:p.action==="restore_photo",p_reason:p.reason})
 :["ban","unban"].includes(p.action)?await access.db.rpc("moderate_content",{p_kind:"professional",p_id:id,p_action:p.action==="ban"?"hide":"restore",p_reason:p.reason,p_report:null,p_days:7})
 :{error:true};
 if(result.error)return NextResponse.json({error:"No se guardó la acción y su auditoría."},{status:409});
 await invalidateProfessionalCache();
 return NextResponse.json({ok:true});
}
