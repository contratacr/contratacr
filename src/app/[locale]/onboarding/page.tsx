"use client";

import { useState, useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { UserRoundSearch, BriefcaseBusiness, ArrowRight } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { isSigningOut } from "@/lib/auth/sign-out";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";

export default function OnboardingPage() {
  const { user, avatarUrl, loading: authLoading } = useAuth();
  const t = useTranslations("onboarding");
  const tc = useTranslations("registerChoice");
  const router = useRouter();
  const [selecting, setSelecting] = useState<"client" | "professional" | null>(null);
  // While we determine whether this is an EXISTING account, render a loader — never
  // the role cards — so an existing user logging in never sees the onboarding "flash".
  const [checkingExisting, setCheckingExisting] = useState(true);
  // Prevents the "already done" check from competing with selectRole's navigation
  const completing = useRef(false);

  // Decide, BEFORE rendering the role cards, whether this user already has an account:
  //  - canonical signal = `user_metadata.onboarding_completed`;
  //  - fallback = the SECURITY DEFINER RPC `get_my_profile` (covers accounts whose
  //    metadata predates the flag — `profiles.onboarding_completed` is column-restricted
  //    by migration 047, so it can't be selected directly).
  // Existing users go STRAIGHT to their panel (after healing the metadata flag so the
  // proxy doesn't bounce them back here → avoids a redirect loop). Only genuinely new
  // users see the cards.
  useEffect(() => {
    if (authLoading) return;
    if (!user) { if (!isSigningOut()) router.push("/login"); return; }
    if (completing.current) { setCheckingExisting(false); return; }
    let cancelled = false;
    (async () => {
      let done = user.user_metadata?.onboarding_completed === true;
      let role = user.user_metadata?.role as string | undefined;
      if (!done) {
        try {
          const supabase = createClient();
          const { data: prof } = await supabase.rpc("get_my_profile");
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          const p = prof as any;
          if (p) {
            if (p.onboarding_completed) done = true;
            if (!role && (p.role === "professional" || p.role === "client")) role = p.role;
          }
        } catch { /* ignore — treat as a new user */ }
      }
      if (cancelled) return;
      if (done) {
        // Heal the metadata flag (best-effort) so the proxy stops sending this account
        // here, THEN hard-navigate to the panel so the refreshed session cookie is read.
        if (user.user_metadata?.onboarding_completed !== true) {
          try {
            const supabase = createClient();
            await supabase.auth.updateUser({ data: { onboarding_completed: true, ...(role ? { role } : {}) } });
          } catch { /* best-effort */ }
        }
        window.location.assign(`/es/dashboard/${role === "professional" ? "profesional" : "cliente"}`);
        return;
      }
      setCheckingExisting(false); // genuinely new → show the role cards
    })();
    return () => { cancelled = true; };
  }, [user, authLoading, router]);

  async function selectRole(role: "client" | "professional") {
    if (!user || selecting) return;
    completing.current = true; // freeze the useEffect redirect above
    setSelecting(role);
    const supabase = createClient();

    // Choosing "Ofrezco" is only an intent until the professional profile is
    // created. Do not mark the account as a provider here; otherwise the dashboard
    // can treat a half-created account as professional and bounce between pages.
    const nextMetadata =
      role === "professional"
        ? { role: "client", intended_role: "professional", onboarding_completed: false }
        : { role, onboarding_completed: true };
    try {
      await supabase.auth.updateUser({ data: nextMetadata });
    } catch (err) {
      console.error("[onboarding] updateUser failed:", err);
    }
    try {
      await supabase.from("profiles").upsert(
        {
          id: user.id,
          email: user.email ?? "",
          full_name:
            (user.user_metadata?.full_name as string) ??
            (user.user_metadata?.name as string) ??
            user.email?.split("@")[0] ??
            "",
          avatar_url:
            (user.user_metadata?.avatar_url as string) ??
            (user.user_metadata?.picture as string) ??
            null,
          role: role === "professional" ? "client" : role,
          onboarding_completed: role !== "professional",
        },
        { onConflict: "id" }
      );
    } catch (err) {
      console.error("[onboarding] profile upsert failed:", err);
    }

    // "Ofrezco" → complete the professional profile to unlock offering. "Busco" →
    // straight into the unified panel (it opens in "Usar servicios" mode).
    window.location.assign(role === "professional" ? "/es/registro/profesional" : "/es/dashboard/profesional");
  }

  // Loader until we KNOW this is a new user (existing users are redirected above) —
  // so the role-selection cards never flash for someone who already has an account.
  if (authLoading || !user || checkingExisting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
      </div>
    );
  }

  const displayName = (
    (user.user_metadata?.full_name as string) ??
    (user.user_metadata?.name as string) ??
    user.email?.split("@")[0] ??
    ""
  );

  const photoUrl =
    avatarUrl ??
    (user.user_metadata?.avatar_url as string | undefined) ??
    (user.user_metadata?.picture as string | undefined) ??
    null;

  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <header className="bg-white border-b border-gray-100 px-4 py-4 flex justify-center">
        <Link href="/">
          <ContrataCRLogo />
        </Link>
      </header>

      <main className="flex-1 flex flex-col items-center justify-center px-4 py-12">
        <div className="w-full max-w-xl">

          {/* OAuth user info card */}
          <div className="flex flex-col items-center mb-10">
            {photoUrl ? (
              <img
                src={photoUrl}
                alt={displayName}
                className="h-20 w-20 rounded-full object-cover border-4 border-white shadow-md mb-4"
              />
            ) : (
              <div className="h-20 w-20 rounded-full bg-[#009FD9] flex items-center justify-center text-white text-2xl font-bold shadow-md mb-4">
                {displayName.charAt(0).toUpperCase() || "?"}
              </div>
            )}

            {displayName && (
              <p className="text-sm text-[#009FD9] font-semibold mb-1 uppercase tracking-wide">
                {t("greeting", { name: displayName.split(" ")[0] })}
              </p>
            )}
            <p className="text-xs text-gray-400">{user.email}</p>

            <h1 className="text-3xl font-bold text-[#111827] mt-6 mb-2 text-center">
              {t("title")}
            </h1>
            <p className="text-[#6b7280] text-base text-center">
              {t("subtitle")}
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">

            {/* Client card */}
            <button
              onClick={() => selectRole("client")}
              disabled={!!selecting}
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 disabled:opacity-60 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] ring-1 ring-inset ring-[#009FD9]/20 shadow-[0_10px_30px_-10px_rgba(0,159,217,0.5)] flex items-center justify-center group-hover:bg-[#009FD9] group-hover:shadow-[0_12px_34px_-10px_rgba(0,159,217,0.7)] transition-all duration-200 shrink-0">
                {selecting === "client" ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
                ) : (
                  <UserRoundSearch className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#111827]">{tc("clientRole")}</h2>
                <p className="text-sm font-semibold text-[#009FD9]">{tc("clientTitle")}</p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                {tc("continue")} <ArrowRight className="h-4 w-4" />
              </span>
            </button>

            {/* Professional card */}
            <button
              onClick={() => selectRole("professional")}
              disabled={!!selecting}
              className="group flex flex-col items-center gap-5 p-8 bg-white border-2 border-[#e5e7eb] rounded-2xl hover:border-[#009FD9] hover:shadow-lg transition-all duration-200 disabled:opacity-60 text-center"
            >
              <div className="h-16 w-16 rounded-full bg-[#EBF5FB] ring-1 ring-inset ring-[#009FD9]/20 shadow-[0_10px_30px_-10px_rgba(0,159,217,0.5)] flex items-center justify-center group-hover:bg-[#009FD9] group-hover:shadow-[0_12px_34px_-10px_rgba(0,159,217,0.7)] transition-all duration-200 shrink-0">
                {selecting === "professional" ? (
                  <div className="h-6 w-6 animate-spin rounded-full border-2 border-[#009FD9] border-t-transparent" />
                ) : (
                  <BriefcaseBusiness className="h-8 w-8 text-[#009FD9] group-hover:text-white transition-colors duration-200" />
                )}
              </div>
              <div>
                <h2 className="text-2xl font-bold text-[#111827]">{tc("proRole")}</h2>
                <p className="text-sm font-semibold text-[#009FD9]">{tc("proTitle")}</p>
              </div>
              <span className="flex items-center gap-1.5 text-sm font-semibold text-[#009FD9] opacity-0 group-hover:opacity-100 transition-opacity">
                {tc("continue")} <ArrowRight className="h-4 w-4" />
              </span>
            </button>

          </div>
        </div>
      </main>

      <LandingFooter />
    </div>
  );
}
