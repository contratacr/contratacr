import { analyticsActor } from "@/lib/analytics/admin-activity";
import { createAdminClient } from "@/lib/supabase/admin";
import { requestAnalyticsPlatform } from "./platform";
import { esPeticionAutomatizada } from "./trafico-automatizado";
// This is the account's original registration, never adding professional mode
// to an existing account or logging in with a different provider/device.
export async function recordRegistrationPlatform(req: Request, userId: string) {
  if (req.headers.get("cookie")?.split(";").some(piece => piece.trim() === "ccr_admin_analytics_excluded=1")) return;
  if (esPeticionAutomatizada(req.headers.get("cookie")?.includes("ccr_sin_analitica=1") ? "1" : null, req.headers.get("user-agent"))) return;
  try {
    if ((await analyticsActor(userId)).excluded) return;
    await createAdminClient().rpc("record_registration_platform", { p_user_id: userId, p_runtime: requestAnalyticsPlatform(req).runtime });
  } catch { /* Optional analytics never block registration. */ }
}
