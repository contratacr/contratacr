"use client";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { AdminMfa } from "@/components/admin/admin-mfa";
import { useLocale } from "next-intl";
import { PageRouteLoading } from "@/components/ui/route-loading";
import { useRouter } from "@/i18n/navigation";

type State = { userId: string | null; authenticated: boolean; isAdmin: boolean; enrolled: boolean; required: boolean };
export function SessionMfaGate({ children, initialState }: { children: ReactNode; initialState: State }) {
  const { user } = useAuth();
  const en = useLocale() === "en";
  const router = useRouter();
  const [state, setState] = useState(initialState);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const sequence = useRef({ value: 0 });
  async function check() {
    const request = ++sequence.current.value;
    const response = await fetch("/api/auth/session-mfa", { cache: "no-store", signal: AbortSignal.timeout(8_000) });
    if (!response.ok) throw new Error("Security unavailable");
    const next: State = await response.json();
    if (!next.authenticated && user) throw new Error("Session unavailable");
    if (request === sequence.current.value) { setState(next); setError(false); setChecking(false); }
    return next;
  }
  useEffect(() => {
    if (!user) return;
    let active = true;
    const lifecycle = sequence.current;
    const update = () => { if (active) { setChecking(true); void check().catch(() => { if (active) { setError(true); setChecking(false); } }); } };
    const { data } = createClient().auth.onAuthStateChange(event => {
      // Defer SDK calls until its auth lock has been released.
      if (event === "SIGNED_IN" || event === "MFA_CHALLENGE_VERIFIED" || event === "USER_UPDATED") window.setTimeout(update, 0);
    });
    if (user.id !== initialState.userId) update();
    return () => { active = false; lifecycle.value++; data.subscription.unsubscribe(); };
  }, [user?.id]); // eslint-disable-line react-hooks/exhaustive-deps
  if (!user) return children;
  if (error) return <main className="grid min-h-dvh place-content-center bg-white p-6"><p role="alert">{en ? "Could not check session security." : "No se pudo comprobar la seguridad de la sesión."}</p><button onClick={() => { void check().catch(() => setError(true)); }} className="mt-4 min-h-11 text-[#009fd9]">{en ? "Try again" : "Reintentar"}</button></main>;
  if (state.userId !== user.id) return <PageRouteLoading />;
  if (state.required) return <AdminMfa enrolled={state.enrolled} administrator={state.isAdmin} onVerified={async () => { const next = await check(); if (next.required) throw new Error("MFA required"); router.refresh(); }} />;
  if (checking && !state.authenticated) return <PageRouteLoading />;
  return children;
}
