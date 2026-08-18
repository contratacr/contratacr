"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRight, BriefcaseBusiness, Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";

const COMPLETED_KEY = "ccr:native-first-run-onboarding:v4";
type Role = "client" | "professional";

export function NativeFirstRunOnboarding() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(false);
  const english = pathname?.startsWith("/en") ?? false;

  useEffect(() => {
    if (!nativeApp || window.localStorage.getItem(COMPLETED_KEY) === "1") return;
    const timer = window.setTimeout(() => setVisible(true), 80);
    return () => window.clearTimeout(timer);
  }, [nativeApp]);

  useEffect(() => {
    if (!visible) return;
    const bodyOverflow = document.body.style.overflow;
    const htmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = bodyOverflow;
      document.documentElement.style.overflow = htmlOverflow;
    };
  }, [visible]);

  const complete = useCallback(() => {
    window.localStorage.setItem(COMPLETED_KEY, "1");
    setVisible(false);
  }, []);

  const destinationFor = useCallback((selectedRole: Role) => {
    if (selectedRole === "client") return user ? "/buscar" : "/registro/cliente";
    return user?.user_metadata?.is_provider === true
      ? "/dashboard/profesional"
      : "/registro/profesional";
  }, [user]);

  const chooseRole = useCallback((selectedRole: Role) => {
    const destination = destinationFor(selectedRole);
    complete();
    router.push(destination);
  }, [complete, destinationFor, router]);

  const goToLogin = useCallback(() => {
    complete();
    router.push("/login");
  }, [complete, router]);

  if (!visible || !nativeApp) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] overflow-hidden bg-[#071523] text-white"
      data-testid="native-first-run-onboarding"
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-onboarding-title"
    >
      <img
        src="/mobile/contratacr-welcome-professional-v1.webp"
        alt=""
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,31,0.08)_0%,rgba(5,18,31,0.08)_31%,rgba(5,18,31,0.72)_59%,rgba(5,18,31,0.98)_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,13,23,0.14),transparent_45%,rgba(2,13,23,0.08))]" />

      <main className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
        <header className="flex items-center justify-between">
          <div className="flex items-center gap-2.5" aria-label="ContrataCR">
            <img src="/logo-mark-dark.png" alt="" className="h-10 w-10 object-contain drop-shadow-lg" />
            <span className="text-[21px] font-black tracking-[-0.04em] drop-shadow-sm">
              Contrata<span className="text-[#20b8e8]">CR</span>
            </span>
          </div>
          <button
            type="button"
            onClick={complete}
            className="min-h-11 rounded-full px-3 text-sm font-bold text-white/90 transition active:bg-white/10"
          >
            {english ? "Skip" : "Omitir"}
          </button>
        </header>

        <section className="mt-auto pb-1" data-testid="native-onboarding-role-step">
          <p className="mb-2 text-sm font-bold uppercase tracking-[0.18em] text-[#55c8ed]">
            {english ? "Services across Costa Rica" : "Servicios en toda Costa Rica"}
          </p>
          <h1
            id="native-onboarding-title"
            className="max-w-[22rem] text-[clamp(2.25rem,10vw,3.15rem)] font-black leading-[0.98] tracking-[-0.055em] text-balance"
          >
            {english ? "Everything you need, closer." : "Lo que necesitas, más cerca."}
          </h1>
          <p className="mt-3 max-w-sm text-[15px] font-medium leading-6 text-white/75">
            {english
              ? "Find trusted professionals or grow your services from one place."
              : "Encuentra profesionales de confianza o haz crecer tus servicios desde un solo lugar."}
          </p>

          <div className="mt-6 grid gap-3" aria-label={english ? "Choose how to start" : "Elige cómo empezar"}>
            <RoleButton
              icon={Search}
              label={english ? "Find a service" : "Buscar servicios"}
              description={english ? "Explore trusted professionals" : "Explora profesionales de confianza"}
              onClick={() => chooseRole("client")}
              primary
            />
            <RoleButton
              icon={BriefcaseBusiness}
              label={english ? "Offer services" : "Ofrecer servicios"}
              description={english ? "Create your professional profile" : "Crea tu perfil profesional"}
              onClick={() => chooseRole("professional")}
            />
          </div>

          <button
            type="button"
            onClick={goToLogin}
            className="mt-5 min-h-11 w-full text-center text-sm font-semibold text-white/75"
          >
            {english ? "Already have an account? " : "¿Ya tienes una cuenta? "}
            <span className="font-extrabold text-white underline decoration-white/45 underline-offset-4">
              {english ? "Log in" : "Inicia sesión"}
            </span>
          </button>
        </section>
      </main>
    </div>,
    document.body,
  );
}

function RoleButton({
  icon: Icon,
  label,
  description,
  onClick,
  primary = false,
}: {
  icon: typeof Search;
  label: string;
  description: string;
  onClick: () => void;
  primary?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={primary
        ? "group flex min-h-[76px] w-full items-center gap-3 rounded-[22px] bg-[#08a8dc] px-4 py-3 text-left shadow-[0_18px_38px_-18px_rgba(8,168,220,0.9)] transition active:scale-[0.985]"
        : "group flex min-h-[76px] w-full items-center gap-3 rounded-[22px] border border-white/35 bg-[#071523]/45 px-4 py-3 text-left backdrop-blur-md transition active:scale-[0.985] active:bg-white/[0.14]"
      }
    >
      <span className={primary
        ? "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/18"
        : "grid h-11 w-11 shrink-0 place-items-center rounded-2xl bg-white/10"
      }>
        <Icon className="h-5 w-5" strokeWidth={2.3} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-[16px] font-extrabold leading-5">{label}</span>
        <span className="mt-0.5 block text-[12px] font-medium leading-4 text-white/70">{description}</span>
      </span>
      <ArrowRight className="h-5 w-5 shrink-0 text-white/85 transition-transform group-active:translate-x-0.5" />
    </button>
  );
}
