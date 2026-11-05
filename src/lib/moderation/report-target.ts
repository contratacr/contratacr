import type { SupabaseClient } from "@supabase/supabase-js";
export type ReportKind="professional"|"project"|"job"|"offer"|"review";
export async function resolveReportTarget(db: SupabaseClient,kind: ReportKind,id: string) {
  const table={professional:"professionals",project:"projects",job:"job_posts",offer:"professional_offers",review:"reviews"} as const;
  const {data,error}=await db.from(table[kind]).select("*").eq("id",id).maybeSingle();
  if(error || !data) return null;
  const proId=kind==="professional"?data.id:kind==="job"?data.employer_id:kind==="offer"||kind==="review"?data.professional_id:null;
  const pro=proId ? (await db.from("professionals").select("id,profile_id,slug,business_name").eq("id",proId).maybeSingle()).data:null;
  return {target_type:kind,target_id:id,professional_id:pro?.id??null,professional_slug:pro?.slug??null,
    professional_name:kind==="professional"?pro?.business_name??null:data.title??null,
    subject_user_id:kind==="project"||kind==="review"?data.client_id:pro?.profile_id??null};
}
