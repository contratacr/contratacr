"use client";

import { useEffect, useRef, useState } from "react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

// Guard for the PUBLIC registration entry points (`/registro` chooser +
// `/registro/cliente`). A user who is ALREADY logged in with a COMPLETE account
// must never be pushed through account creation again — bounce them to their
// role-aware panel instead.
//
//  • Detection mirrors `/onboarding`: canonical signal = `user_metadata.onboarding_completed`;
//    fallback = the SECURITY DEFINER RPC `get_my_profile` (covers accounts whose
//    metadata predates the flag — those columns aren't directly selectable, see
//    migration 047). We also read `role` for the destination panel.
//  • We only act on users who ARRIVED already logged in. A visitor who is logged
//    OUT on arrival owns the page (incl. the email/password signup → OTP → success
//    flow on `/registro/cliente`): becoming logged-in mid-signup must NOT trigger a
//    redirect that would hijack that page's own success screen.
//  • An incomplete logged-in session (a real account row not finished yet) is left
//    on the page so it can complete gracefully — only COMPLETE accounts redirect.
//
// Returns `checking` so the page can render a loader (never the registration form)
// while the async check runs — avoids the "registration flash" for existing users.
export function useRedirectIfRegistered(): { checking: boolean } {
  const { user, loading: authLoading } = useAuth();
  const locale = useLocale();
  const [checking, setChecking] = useState(true);
  const arrivalChecked = useRef(false);
  const arrivedLoggedIn = useRef(false);
  const ran = useRef(false);

  useEffect(() => {
    if (authLoading) return;

    // Capture the arrival state ONCE, the first time auth resolves.
    if (!arrivalChecked.current) {
      arrivalChecked.current = true;
      arrivedLoggedIn.current = !!user;
    }

    // Logged out on arrival → the page owns the flow (new signup). Never redirect,
    // even if an in-page signup later establishes a session.
    if (!arrivedLoggedIn.current || !user) { setChecking(false); return; }
    if (ran.current) return;
    ran.current = true;

    let cancelled = false;
    (async () => {
      let complete = user.user_metadata?.onboarding_completed === true;
      let role = user.user_metadata?.role as string | undefined;
      let hasProfessionalProfile = false;
      const supabase = createClient();

      if (!complete || !role) {
        try {
          const { data: prof } = await supabase.rpc("get_my_profile");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prof as any;
          if (p) {
            if (p.onboarding_completed) complete = true;
            if (!role && (p.role === "professional" || p.role === "client")) role = p.role;
          }
        } catch { /* treat as incomplete → let them finish */ }
      }
      if (role === "professional" || user.user_metadata?.intended_role === "professional" || user.user_metadata?.is_provider === true) {
        try {
          const { data: proRow } = await supabase
            .from("professionals")
            .select("id")
            .eq("profile_id", user.id)
            .maybeSingle();
          hasProfessionalProfile = !!proRow;
        } catch { /* let the normal flow continue */ }
      }
      if (cancelled) return;

      if (complete) {
        if ((role === "professional" || user.user_metadata?.intended_role === "professional") && !hasProfessionalProfile) {
          window.location.assign(`/${locale}/registro/profesional`);
          return;
        }
        // Heal the metadata flag (best-effort) so the proxy/onboarding stop bouncing
        // this account, THEN hard-navigate so the panel reads the refreshed cookie.
        if (user.user_metadata?.onboarding_completed !== true) {
          try {
            await supabase.auth.updateUser({ data: { onboarding_completed: true, ...(role ? { role } : {}) } });
          } catch { /* best-effort */ }
        }
        // One unified panel for everyone; it opens in the right mode by itself.
        window.location.assign(`/${locale}/dashboard/profesional`);
        return;
      }

      // Logged in but no complete account yet → leave them on the page to finish.
      setChecking(false);
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, locale]);

  return { checking };
}
