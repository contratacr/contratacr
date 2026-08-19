"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime, useNativeApp } from "@/hooks/use-native-app";
import {
  NATIVE_ONBOARDING_COMPLETED_EVENT,
  NATIVE_ONBOARDING_COMPLETED_KEY,
} from "@/lib/mobile-onboarding";

// Bump this key whenever the first-run journey changes materially so an
// existing native installation gets one clean chance to see the new flow.
type Role = "client" | "professional";

const ROLE_IMAGES: Record<Role, string> = {
  client: "/mobile/contratacr-welcome-client-v1.png",
  professional: "/mobile/contratacr-welcome-professional-v1.webp",
};

function shouldShowNativeFirstRun() {
  if (typeof window === "undefined") return false;
  try {
    return isNativeAppRuntime() && window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) !== "1";
  } catch {
    return false;
  }
}

export function NativeFirstRunOnboarding() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const [visible, setVisible] = useState(() => shouldShowNativeFirstRun());
  const [selectedRole, setSelectedRole] = useState<Role>("client");
  const [loadedRoles, setLoadedRoles] = useState<Partial<Record<Role, boolean>>>({});
  const english = pathname?.startsWith("/en") ?? false;
  const activeImageReady = loadedRoles[selectedRole] === true;

  useEffect(() => {
    if (!nativeApp) return;
    if (window.localStorage.getItem(NATIVE_ONBOARDING_COMPLETED_KEY) === "1") {
      document.documentElement.classList.remove("ccr-native-first-run-pending");
      setVisible(false);
      return;
    }
    document.documentElement.classList.add("ccr-native-first-run-pending");
    setVisible(true);
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
    window.localStorage.setItem(NATIVE_ONBOARDING_COMPLETED_KEY, "1");
    window.dispatchEvent(new Event(NATIVE_ONBOARDING_COMPLETED_EVENT));
    document.documentElement.classList.remove("ccr-native-first-run-pending");
    setVisible(false);
  }, []);

  const destinationFor = useCallback((role: Role) => {
    if (role === "client") return user ? "/buscar" : "/registro/cliente";
    return user?.user_metadata?.is_provider === true
      ? "/dashboard/profesional"
      : "/registro/profesional";
  }, [user]);

  const continueWithRole = useCallback(() => {
    const destination = destinationFor(selectedRole);
    complete();
    router.push(destination);
  }, [complete, destinationFor, router, selectedRole]);

  const goToLogin = useCallback(() => {
    complete();
    router.push("/login");
  }, [complete, router]);

  if (!visible || !nativeApp) return null;

  return createPortal(
    <div
      className="fixed inset-0 z-[220] overflow-hidden bg-[#071523] text-white"
      data-testid="native-first-run-onboarding"
      data-native-onboarding-ready={activeImageReady ? "true" : "false"}
      role="dialog"
      aria-modal="true"
      aria-labelledby="native-onboarding-title"
    >
      {(Object.entries(ROLE_IMAGES) as Array<[Role, string]>).map(([role, src]) => (
        <img
          key={role}
          src={src}
          alt=""
          aria-hidden="true"
          onLoad={() => setLoadedRoles((prev) => (prev[role] ? prev : { ...prev, [role]: true }))}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 motion-reduce:transition-none ${
            selectedRole === role ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,31,0.03)_0%,rgba(5,18,31,0.08)_34%,rgba(8,28,52,0.68)_58%,#081c34_75%,#081c34_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,13,23,0.12),transparent_48%,rgba(2,13,23,0.06))]" />

      <main className="relative mx-auto flex h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
        <section className="mt-auto pb-1 text-center" data-testid="native-onboarding-role-step">
          <div className="mb-4 inline-flex items-center" aria-label="ContrataCR">
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

          <div
            className="mt-5 grid grid-cols-2 overflow-hidden rounded-full border border-white/85 bg-[#081c34]/50 shadow-[0_16px_42px_rgba(0,0,0,0.24)] backdrop-blur-[3px]"
            aria-label={english ? "Choose how to start" : "Elige cómo empezar"}
          >
            <RoleButton
              label={english ? "Find services" : "Buscar servicios"}
              selected={selectedRole === "client"}
              onClick={() => setSelectedRole("client")}
            />
            <RoleButton
              label={english ? "Offer services" : "Ofrecer servicios"}
              selected={selectedRole === "professional"}
              onClick={() => setSelectedRole("professional")}
              divided
            />
          </div>

          <button
            type="button"
            onClick={continueWithRole}
            className="mt-4 min-h-14 w-full rounded-full bg-[#08a7df] px-5 text-[15px] font-extrabold text-white shadow-[0_14px_32px_rgba(0,159,217,0.3)] transition hover:bg-[#0796ca] active:scale-[0.99] motion-reduce:transform-none"
          >
            {user
              ? (english ? "Continue" : "Continuar")
              : (english ? "Create an account" : "Crear una cuenta")}
          </button>

          <button
            type="button"
            onClick={goToLogin}
            className="mt-2 min-h-11 w-full text-center text-sm font-semibold text-white/76"
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
  selected,
  onClick,
  divided = false,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
  divided?: boolean;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-14 px-3 text-[14px] font-extrabold transition ${
        divided ? "border-l border-white/80" : ""
      } ${
        selected
          ? "bg-white text-[#071523] shadow-[0_2px_10px_rgba(255,255,255,0.12)]"
          : "text-white hover:bg-white/10 active:bg-white/15"
      }`}
    >
      {label}
    </button>
  );
}
