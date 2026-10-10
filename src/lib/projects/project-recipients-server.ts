import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { eligibleProjectRecipient,matchesProjectCoverage } from "./project-recipients";
export async function projectRecipients(category: string,ownerId?: string | null,province?: string | null,canton?: string | null): Promise<string[]> {
 if (!/^[a-z0-9_-]{1,60}$/.test(category) || category==="otro") return [];
 const db=createAdminClient();const result=new Set<string>();
 for(let offset=0;;offset+=1000){
  const { data,error }=await db.from("professionals").select("profile_id,category_id,services,provincia_id,canton_id,coverage_country,coverage_provincias,coverage_areas,workplaces,videoconsulta,is_banned,oculto_del_buscador,verification_status,profiles(is_disabled)")
   .or(`category_id.eq.${category},professions.cs.{${category}}`).order("id").range(offset,offset+999);
  if(error)throw new Error("project_recipients_unavailable");
  for(const row of data)if(eligibleProjectRecipient(row,category,ownerId)&&matchesProjectCoverage(row,province,canton))result.add(row.profile_id);
  if(data.length<1000)break;
 }
 return [...result];
}
