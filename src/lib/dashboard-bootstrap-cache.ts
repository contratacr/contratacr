import { createClient } from "@/lib/supabase/client";
import { loadDashboardCache } from "@/lib/dashboard-prefetch-cache";

export type DashboardProfileData = {
  full_name?: string;
  avatar_url?: string;
  cedula?: string | null;
  client_identity_status?: "verified" | "pending" | "unverified" | null;
};

export type DashboardBootstrap = {
  pro: Record<string, unknown> | null;
  profile: DashboardProfileData | null;
};

export function dashboardBootstrapKey(userId: string) {
  return `dashboard:bootstrap:${userId}`;
}

export async function loadDashboardBootstrap(userId: string, force = false) {
  return loadDashboardCache<DashboardBootstrap>(
    dashboardBootstrapKey(userId),
    async () => {
      const supabase = createClient();
      const [professionalResult, profileResult] = await Promise.all([
        supabase.from("professionals").select("*").eq("profile_id", userId).maybeSingle(),
        supabase.rpc("get_my_profile"),
      ]);
      if (professionalResult.error) throw professionalResult.error;
      if (profileResult.error) throw profileResult.error;
      // Este arranque se pide apenas aparece la sesión —la barra lo dispara al
      // instante en la app nativa—, y en ese momento el permiso puede no estar
      // aplicado todavía: las consultas con RLS devuelven VACÍO sin error. Una
      // foto así decía "esta cuenta no tiene ficha profesional" y se guardaba
      // cinco minutos, que es lo que abría el panel de cliente a un profesional.
      // Toda cuenta tiene fila de perfil: si no vino, la sesión aún no sirve y
      // no hay nada que guardar.
      if (!profileResult.data) throw new Error("dashboard-bootstrap-sin-sesion");
      return {
        pro: professionalResult.data,
        profile: profileResult.data as DashboardProfileData | null,
      };
    },
    { force },
  );
}

export function prefetchDashboardBootstrap(userId: string) {
  void loadDashboardBootstrap(userId).catch((error) => {
    console.warn("[dashboard-bootstrap-prefetch] failed", error);
  });
}
