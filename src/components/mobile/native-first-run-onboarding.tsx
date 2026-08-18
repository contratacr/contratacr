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
          <p className="mb-1.5 text-xs font-bold uppercase tracking-[0.17em] text-[#55c8ed]">
            {english ? "Services across Costa Rica" : "Servicios en toda Costa Rica"}
          </p>
          <h1
            id="native-onboarding-title"
            className="max-w-[21rem] text-[clamp(2rem,8.5vw,2.65rem)] font-black leading-[1.01] tracking-[-0.05em] text-balance"
          >
            {english ? "Everything you need, closer." : "Lo que necesitas, más cerca."}
          </h1>
          <p className="mt-2 max-w-[21rem] text-sm font-medium leading-5 text-white/75">
            {english
              ? "Find trusted professionals or grow your services from one place."
              : "Encuentra profesionales de confianza o haz crecer tus servicios desde un solo lugar."}
          </p>

          <div className="mt-4 grid grid-cols-2 gap-3" aria-label={english ? "Choose how to start" : "Elige cómo empezar"}>
            <RoleButton
              icon={Search}
              label={english ? "Find a service" : "Buscar servicios"}
              description={english ? "Find professionals" : "Encuentra profesionales"}
              onClick={() => chooseRole("client")}
              primary
            />
            <RoleButton
              icon={BriefcaseBusiness}
              label={english ? "Offer services" : "Ofrecer servicios"}
              description={english ? "Grow your business" : "Haz crecer tu negocio"}
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
        ? "group relative flex min-h-[118px] w-full flex-col items-start rounded-[22px] bg-[#08a8dc] px-4 py-4 text-left shadow-[0_18px_38px_-18px_rgba(8,168,220,0.9)] transition active:scale-[0.985]"
        : "group relative flex min-h-[118px] w-full flex-col items-start rounded-[22px] border border-white/35 bg-[#071523]/48 px-4 py-4 text-left backdrop-blur-md transition active:scale-[0.985] active:bg-white/[0.14]"
      }
    >
      <span className={primary
        ? "grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/18"
        : "grid h-10 w-10 shrink-0 place-items-center rounded-2xl bg-white/10"
      }>
        <Icon className="h-5 w-5" strokeWidth={2.3} />
      </span>
      <span className="mt-3 min-w-0 pr-4">
        <span className="block text-[15px] font-extrabold leading-[1.15]">{label}</span>
        <span className="mt-1 block text-[11px] font-medium leading-4 text-white/70">{description}</span>
      </span>
      <ArrowRight className="absolute right-3.5 top-4 h-4 w-4 text-white/80 transition-transform group-active:translate-x-0.5" />
    </button>
  );
}
