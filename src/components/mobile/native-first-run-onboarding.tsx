"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { PushNotifications } from "@capacitor/push-notifications";
import { BellRing, BriefcaseBusiness, ChevronRight, Search, ShieldCheck } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";
import { cn } from "@/lib/utils";

const COMPLETED_KEY = "ccr:native-first-run-onboarding:v2";

type Step = "notifications" | "role";

export function NativeFirstRunOnboarding() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>("notifications");
  const [requesting, setRequesting] = useState(false);
  const english = pathname?.startsWith("/en") ?? false;

  useEffect(() => {
    if (!nativeApp) return;
    if (window.localStorage.getItem(COMPLETED_KEY) === "1") return;
    const timer = window.setTimeout(() => setVisible(true), 50);
    return () => window.clearTimeout(timer);
  }, [nativeApp]);

  useEffect(() => {
    if (!visible) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [visible]);

  const complete = useCallback(() => {
    window.localStorage.setItem(COMPLETED_KEY, "1");
    setVisible(false);
  }, []);

  const requestNotifications = useCallback(async () => {
    setRequesting(true);
    try {
      await PushNotifications.requestPermissions();
    } catch (error) {
      console.error("[native-onboarding] notification permission failed", error);
    } finally {
      setRequesting(false);
      setStep("role");
    }
  }, []);

  const chooseRole = useCallback((role: "client" | "professional") => {
    complete();
    if (role === "client") {
      router.push(user ? "/buscar" : "/registro/cliente");
      return;
    }
    const isProvider = user?.user_metadata?.is_provider === true;
    router.push(isProvider ? "/dashboard/profesional" : "/registro/profesional");
  }, [complete, router, user]);

  if (!visible || !nativeApp) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[180] flex items-end justify-center bg-[#0f1d35]/55 px-4 pb-[max(18px,env(safe-area-inset-bottom))] pt-[max(18px,env(safe-area-inset-top))] backdrop-blur-sm sm:items-center"
      data-testid="native-first-run-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-onboarding-title"
    >
      <section className="w-full max-w-md overflow-hidden rounded-[30px] border border-white/70 bg-white shadow-[0_28px_90px_-25px_rgba(15,29,53,0.65)]">
        <div className="relative overflow-hidden bg-gradient-to-br from-[#eaf8fd] via-white to-[#eef4ff] px-6 pb-6 pt-8 text-center">
          <div className="absolute -right-12 -top-16 h-40 w-40 rounded-full bg-[#009FD9]/10" />
          <div className="absolute -bottom-16 -left-12 h-36 w-36 rounded-full bg-[#162543]/5" />
          <div className="relative mx-auto grid h-20 w-20 place-items-center rounded-[26px] bg-white text-[#009FD9] shadow-[0_18px_45px_-18px_rgba(0,159,217,0.65)] ring-1 ring-[#009FD9]/15">
            {step === "notifications" ? <BellRing className="h-10 w-10" /> : <Search className="h-10 w-10" />}
          </div>
          <div className="relative mt-5 flex justify-center gap-2" aria-label={english ? "Step progress" : "Progreso"}>
            <span className="h-1.5 w-8 rounded-full bg-[#009FD9]" />
            <span className={cn("h-1.5 w-8 rounded-full", step === "role" ? "bg-[#009FD9]" : "bg-[#cbd5e1]")} />
          </div>
        </div>

        <div className="px-6 pb-7 pt-5">
          {step === "notifications" ? (
            <>
              <h1 id="native-onboarding-title" className="text-center text-2xl font-black text-[#162543]">
                {english ? "Don't miss an opportunity" : "No te pierdas ninguna oportunidad"}
              </h1>
              <p className="mx-auto mt-3 max-w-sm text-center text-[15px] leading-6 text-[#52627a]">
                {english
                  ? "Receive messages, replies and important updates at the right time. You can change this anytime in your device settings."
                  : "Recibe mensajes, respuestas y novedades importantes a tiempo. Puedes cambiarlo cuando quieras en los ajustes del dispositivo."}
              </p>
              <div className="mt-5 flex items-center gap-3 rounded-2xl border border-[#d9edf7] bg-[#f5fbfe] p-3 text-left">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-white text-[#009FD9] shadow-sm"><ShieldCheck className="h-5 w-5" /></span>
                <p className="text-xs font-semibold leading-5 text-[#52627a]">
                  {english ? "Only useful ContrataCR activity. No promotional spam." : "Solo actividad útil de ContrataCR. Sin publicidad invasiva."}
                </p>
              </div>
              <button
                type="button"
                onClick={requestNotifications}
                disabled={requesting}
                className="mt-6 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#009FD9] px-5 text-base font-extrabold text-white shadow-[0_12px_30px_-12px_rgba(0,159,217,0.8)] transition hover:bg-[#0089bb] disabled:cursor-wait disabled:opacity-70"
              >
                {requesting ? (english ? "Activating..." : "Activando...") : (english ? "Enable notifications" : "Activar notificaciones")}
                {!requesting && <ChevronRight className="h-5 w-5" />}
              </button>
              <button type="button" onClick={() => setStep("role")} className="mt-2 h-11 w-full text-sm font-bold text-[#64748b]">
                {english ? "Not now" : "Ahora no"}
              </button>
            </>
          ) : (
            <>
              <h1 id="native-onboarding-title" className="text-center text-2xl font-black text-[#162543]">
                {english ? "What would you like to do?" : "¿Qué quieres hacer?"}
              </h1>
              <p className="mt-2 text-center text-sm leading-5 text-[#64748b]">
                {english ? "We'll take you directly to the right setup." : "Te llevamos directamente al registro indicado."}
              </p>
              <div className="mt-6 grid gap-3">
                <button type="button" onClick={() => chooseRole("client")} className="flex items-center gap-4 rounded-2xl border-2 border-[#dbeafe] bg-[#f7fcff] p-4 text-left transition hover:border-[#009FD9]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#009FD9] text-white"><Search className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-base text-[#162543]">{english ? "Find services" : "Buscar servicios"}</strong><span className="mt-0.5 block text-xs leading-5 text-[#64748b]">{english ? "Compare and contact professionals" : "Compara y contacta profesionales"}</span></span>
                  <ChevronRight className="h-5 w-5 text-[#009FD9]" />
                </button>
                <button type="button" onClick={() => chooseRole("professional")} className="flex items-center gap-4 rounded-2xl border-2 border-[#e2e8f0] bg-white p-4 text-left transition hover:border-[#009FD9]">
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[#162543] text-white"><BriefcaseBusiness className="h-6 w-6" /></span>
                  <span className="min-w-0 flex-1"><strong className="block text-base text-[#162543]">{english ? "Offer services" : "Ofrecer servicios"}</strong><span className="mt-0.5 block text-xs leading-5 text-[#64748b]">{english ? "Create your professional profile" : "Crea tu perfil profesional"}</span></span>
                  <ChevronRight className="h-5 w-5 text-[#009FD9]" />
                </button>
              </div>
              <button type="button" onClick={complete} className="mt-3 h-11 w-full text-sm font-bold text-[#64748b]">
                {english ? "Skip for now" : "Omitir por ahora"}
              </button>
            </>
          )}
        </div>
      </section>
    </div>,
    document.body,
  );
}
