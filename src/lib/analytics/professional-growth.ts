import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { usableProfessional } from "./growth-contract";
import { recordGrowthConversion } from "./growth-server";
export async function recordProfessionalReady(req: Request, userId: string) {
  try {
    const { data } = await createAdminClient().from("professionals").select("id,services,whatsapp,provincia_id,coverage_country,coverage_provincias,coverage_areas,is_banned,oculto_del_buscador,verification_status,profiles(is_disabled)").eq("profile_id",userId).maybeSingle();
    if (data && usableProfessional(data)) return await recordGrowthConversion(req,"professional_profile_published",data.id,userId);
    return null;
  } catch { return null; /* never block a saved profile */ }
}
