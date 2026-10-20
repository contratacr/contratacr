"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { AdminMfa } from "@/components/admin/admin-mfa";
import { useTranslations } from "next-intl";
import { Loader2, WifiOff } from "lucide-react";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { PageRouteLoading } from "@/components/ui/route-loading";
import { useRouter } from "@/i18n/navigation";

type State = { userId: string | null; authenticated: boolean; isAdmin: boolean; enrolled: boolean; required: boolean };
export function SessionMfaGate({ children, initialState }: { children: ReactNode; initialState: State }) {
  const { user } = useAuth();
  const t = useTranslations("sessionRecovery");
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(false);
  const [offline, setOffline] = useState(false);
  const [checking, setChecking] = useState(false);
  const sequence = useRef({ value: 0 });
  async function check() {
    const request = ++sequence.current.value;
    setChecking(true);
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), 8_000);
    try {
      const response = await fetch("/api/auth/session-mfa", { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error("Security unavailable");
      const next: State = await response.json();
      if (!next.authenticated && user) throw new Error("Session unavailable");
      if (request === sequence.current.value) { setState(next); setError(false); if (error) router.refresh(); }
      return next;
    } catch (failure) {
      if (request === sequence.current.value) { setError(true); setOffline(!navigator.onLine || failure instanceof TypeError); }
      throw failure;
    } finally {
      window.clearTimeout(timeout);
      if (request === sequence.current.value) setChecking(false);
    }
  }
  useEffect(() => {
    if (!user || !error) return;
    const retry = () => { void check().catch(() => {}); };
    const visible = () => { if (document.visibilityState === "visible") retry(); };
    window.addEventListener("online", retry);
    window.addEventListener("focus", retry);
    document.addEventListener("visibilitychange", visible);
    return () => { window.removeEventListener("online", retry); window.removeEventListener("focus", retry); document.removeEventListener("visibilitychange", visible); };
  }, [error, user?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!user) return;
    let active = true;
    const lifecycle = sequence.current;
    const update = () => { if (active) { void check().catch(() => {}); } };
    const { data } = createClient().auth.onAuthStateChange(event => {
      // Defer SDK calls until its auth lock has been released.
      if (event === "SIGNED_IN" || event === "MFA_CHALLENGE_VERIFIED" || event === "USER_UPDATED") window.setTimeout(update, 0);
    });
    if (user.id !== initialState.userId) update();
    return () => { active = false; lifecycle.value++; data.subscription.unsubscribe(); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return children;
  if (error) return <main data-session-recovery className="flex min-h-dvh items-center justify-center bg-white px-6 py-[max(2rem,env(safe-area-inset-top))]">
    <div className="w-full max-w-sm text-center">
      <div className="mb-10 flex justify-center"><ContrataCRLogo /></div>
      <WifiOff className="mx-auto mb-5 h-8 w-8 text-[#68778d]" aria-hidden />
      <h1 className="text-xl font-bold text-[#162543]">{t(offline ? "connectionTitle" : "title")}</h1>
      <p role="alert" className="mt-3 text-sm leading-6 text-[#68778d]">{t("description")}</p>
      <button type="button" disabled={checking} aria-busy={checking} onClick={() => { void check().catch(() => {}); }} className="mt-6 flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#009FD9] px-5 font-semibold text-white disabled:opacity-60">
        {checking && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}{t(checking ? "checking" : "retry")}
      </button>
    </div>
  </main>;
  if (state.userId !== user.id) return <PageRouteLoading />;
  if (state.required) return <AdminMfa enrolled={state.enrolled} administrator={state.isAdmin} onVerified={async () => { const next = await check(); if (next.required) throw new Error("MFA required"); router.refresh(); }} />;
  if (checking && !state.authenticated) return <PageRouteLoading />;
  return children;
}
