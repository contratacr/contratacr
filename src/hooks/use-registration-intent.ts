"use client";

import { useEffect } from "react";
import { useAuth } from "@/hooks/use-auth";
import { registrationComplete, registrationIntentMatches } from "@/lib/auth/registration-state";
import { createClient } from "@/lib/supabase/client";

// Remember the form reached through Google/Apple even if the user leaves before
// submitting it. Completed clients upgrading to a professional keep their account.
export function useRegistrationIntent(role: "client" | "professional") {
  const { user, loading } = useAuth();
  useEffect(() => {
    if (loading || !user) return;
    const intended = role === "professional" ? "professional" : null;
    if (registrationIntentMatches(user.user_metadata, role)) return;
    let cancelled = false;
    void (async () => {
      const supabase = createClient();
      const { data, error } = await supabase.rpc("get_my_profile");
      if (error || registrationComplete(user.user_metadata, data?.onboarding_completed)) return;
      // Intent never changes completion: a delayed response must not undo Save.
      if (!cancelled) await supabase.auth.updateUser({ data: { role: "client", intended_role: intended, ...(role === "client" ? { professional_signup_started: false } : {}) } });
    })().catch(() => { /* Keep the form usable when the network is unavailable. */ });
    return () => { cancelled = true; };
  }, [loading, user, role]);
}
