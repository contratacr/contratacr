"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { useSwitchLang } from "@/components/landing/landing-navbar";

// La pantalla de bienvenida es la puerta de acceso en los dos lados: la app la
// muestra sobre lo que estés viendo y la web móvil la usa como /login, para que
// entrar sea la misma experiencia en ambos.
export type WelcomeRole = "client" | "professional";

export const WELCOME_ROLE_IMAGES: Record<WelcomeRole, string> = {
  client: "/mobile/contratacr-welcome-client-v1.webp",
  professional: "/mobile/contratacr-welcome-professional-v1.webp",
};

export function WelcomeAccessScreen({
  className,
  english,
  selectedRole,
  onSelectRole,
  onCreateAccount,
  onLogin,
  onClose,
  onHeroReady,
  titleId,
  testId,
}: {
  className: string;
  english: boolean;
  selectedRole: WelcomeRole;
  onSelectRole: (role: WelcomeRole) => void;
  onCreateAccount: () => void;
  onLogin: () => void;
  onClose?: () => void;
  onHeroReady?: () => void;
  titleId: string;
  testId?: string;
}) {
  const [heroReady, setHeroReady] = useState(false);
  const switchLang = useSwitchLang();

  useEffect(() => {
    if (!heroReady) return;
    onHeroReady?.();
  }, [heroReady, onHeroReady]);

  useEffect(() => {
    if (heroReady) return;
    // Una imagen lenta o rota no puede dejar la pantalla en blanco.
    const timeout = window.setTimeout(() => setHeroReady(true), 1500);
    return () => window.clearTimeout(timeout);
  }, [heroReady]);

  const elegirRol = (role: WelcomeRole) => {
    if (role === selectedRole) return;
    setHeroReady(false);
    onSelectRole(role);
  };

  return (
    <div
      className={`${className} overflow-hidden text-white ${heroReady ? "bg-[#f4f7fa]" : "bg-transparent"}`}
      data-testid={testId}
      data-native-onboarding-ready="true"
    >
      {(Object.entries(WELCOME_ROLE_IMAGES) as Array<[WelcomeRole, string]>).map(([role, src]) => (
        // eslint-disable-next-line @next/next/no-img-element -- fondo a pantalla completa; el optimizador no actúa en Cloudflare
        <img
          key={role}
          src={src}
          alt=""
          aria-hidden="true"
          fetchPriority={selectedRole === role ? "high" : "auto"}
          onLoad={role === selectedRole ? () => setHeroReady(true) : undefined}
          onError={role === selectedRole ? () => setHeroReady(true) : undefined}
          className={`absolute inset-0 h-full w-full object-cover object-center transition-opacity duration-500 motion-reduce:transition-none ${
            selectedRole === role ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(5,18,31,0.03)_0%,rgba(5,18,31,0.08)_34%,rgba(8,28,52,0.68)_58%,#081c34_75%,#081c34_100%)]" />
      <div className="absolute inset-0 bg-[linear-gradient(90deg,rgba(2,13,23,0.12),transparent_48%,rgba(2,13,23,0.06))]" />

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={english ? "Back" : "Volver"}
          data-testid="native-onboarding-close"
          className="absolute left-4 top-[max(18px,env(safe-area-inset-top))] z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/18 text-white ring-1 ring-white/25 backdrop-blur-sm transition active:scale-95 motion-reduce:transform-none"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
      )}

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col px-6 pb-[max(24px,env(safe-area-inset-bottom))] pt-[max(22px,env(safe-area-inset-top))]">
        <section className="mt-auto pb-1 text-center" data-testid="native-onboarding-role-step">
          <div className="mb-4 inline-flex items-center" aria-label="ContrataCR">
            {/* eslint-disable-next-line @next/next/no-img-element -- marca de 36px; el optimizador no actúa en Cloudflare */}
            <img src="/logo-mark-dark.png" alt="" className="h-9 w-9 object-contain drop-shadow-lg" />
            <span className="-ml-0.5 text-[24px] font-black tracking-[-0.055em] drop-shadow-sm">
              Contrata<span className="text-[#38bdf8]">CR</span>
            </span>
          </div>

          <h1
            id={titleId}
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
              onClick={() => elegirRol("client")}
            />
            <RoleButton
              label={english ? "Offer services" : "Ofrecer servicios"}
              selected={selectedRole === "professional"}
              onClick={() => elegirRol("professional")}
              divided
            />
          </div>

          <button
            type="button"
            onClick={onCreateAccount}
            className="mt-4 min-h-14 w-full rounded-full bg-[#08a7df] px-5 text-[15px] font-extrabold text-white shadow-[0_14px_32px_rgba(0,159,217,0.3)] transition hover:bg-[#0796ca] active:scale-[0.99] motion-reduce:transform-none"
          >
            {english ? "Create an account" : "Crear una cuenta"}
          </button>

          <button
            type="button"
            onClick={onLogin}
            className="mt-2 min-h-11 w-full text-center text-sm font-semibold text-white/76"
          >
            {english ? "Already have an account? " : "¿Ya tienes una cuenta? "}
            <span className="font-extrabold text-white underline decoration-white/45 underline-offset-4">
              {english ? "Log in" : "Inicia sesión"}
            </span>
          </button>

          {/* El idioma es lo único del menú que hace falta aquí. */}
          <button
            type="button"
            onClick={() => switchLang(english ? "es" : "en")}
            className="mt-1 inline-flex min-h-9 items-center justify-center px-3 text-[13px] font-semibold text-white/60"
          >
            {english ? "Español" : "English"}
          </button>
        </section>
      </div>
    </div>
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
