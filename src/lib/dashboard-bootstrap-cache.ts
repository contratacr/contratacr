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
