"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { useNativeApp } from "@/hooks/use-native-app";

const COMPLETED_KEY = "ccr:native-first-run-onboarding:v6";
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
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,31,0.03)_0%,rgba(5,18,31,0.08)_38%,rgba(8,28,52,0.7)_59%,#081c34_76%,#081c34_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,13,23,0.12),transparent_48%,rgba(2,13,23,0.06))]" />

      <main className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
        <section className="mt-auto pb-1 text-center" data-testid="native-onboarding-role-step">
          <div className="mb-5 inline-flex items-center" aria-label="ContrataCR">
            <img src="/logo-mark-dark.png" alt="" className="h-9 w-9 object-contain drop-shadow-lg" />
            <span className="-ml-0.5 text-[24px] font-black tracking-[-0.055em] drop-shadow-sm">
              Contrata<span className="text-[#38bdf8]">CR</span>
            </span>
          </div>
          <h1
            id="native-onboarding-title"
            className="mx-auto max-w-[22rem] text-[clamp(1.55rem,6.5vw,2rem)] font-extrabold leading-tight tracking-[-0.035em] text-balance"
          >
            {english ? "Choose how you want to start" : "Elige cómo quieres comenzar"}
          </h1>

          <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-full border border-white/85 bg-[#081c34]/45 shadow-[0_16px_42px_rgba(0,0,0,0.24)] backdrop-blur-[2px]" aria-label={english ? "Choose how to start" : "Elige cómo empezar"}>
            <RoleButton
              label={english ? "Find a service" : "Buscar servicios"}
              onClick={() => chooseRole("client")}
            />
            <RoleButton
              label={english ? "Offer services" : "Ofrecer servicios"}
              onClick={() => chooseRole("professional")}
              divided
            />
          </div>

          <button
            type="button"
            onClick={goToLogin}
            className="mt-4 min-h-11 w-full text-center text-sm font-semibold text-white/72"
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
  label,
  onClick,
  divided = false,
}: {
  label: string;
  onClick: () => void;
  divided?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`min-h-14 px-3 text-[14px] font-extrabold text-white transition active:bg-white active:text-[#071523] ${divided ? "border-l border-white/80" : ""}`}
    >
      {label}
    </button>
  );
}
