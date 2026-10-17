"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { registrationComplete } from "@/lib/auth/registration-state";
import { createClient } from "@/lib/supabase/client";

// Remember the form reached through Google/Apple even if the user leaves before
// submitting it. Completed clients upgrading to a professional keep their account.
export function useRegistrationIntent(role: "client" | "professional") {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user || user.user_metadata?.onboarding_completed === true) return;
    const intended = role === "professional" ? "professional" : null;
    if (user.user_metadata?.role === "client" && user.user_metadata?.intended_role === intended && user.user_metadata?.onboarding_completed === false) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      if (user.user_metadata?.onboarding_completed === undefined) {
        const { data, error } = await supabase.rpc("get_my_profile");
        if (error || registrationComplete(user.user_metadata, data?.onboarding_completed)) return;
      }
      if (!cancelled) await supabase.auth.updateUser({ data: { role: "client", intended_role: intended, onboarding_completed: false } });
    })().catch(() => { /* Keep the form usable when the network is unavailable. */ });
    return () => { cancelled = true; };
  }, [loading, user, role]);
}
