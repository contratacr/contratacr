"use client";

import { useEffect, useState } from "react";
import { ArrowLeft } from "lucide-react";
import { ContrataCRLogo, useSwitchLang } from "@/components/landing/landing-navbar";

// La pantalla de bienvenida es la puerta de acceso en los dos lados: la app la
// muestra sobre lo que estés viendo y la web móvil la usa como /login, para que
// entrar sea la misma experiencia en ambos.
export type WelcomeRole = "client" | "professional";

const WELCOME_ROLE_IMAGES: Record<WelcomeRole, string> = {
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

  // Cambiar de rol NO vuelve a poner el fondo transparente: las dos fotos ya
  // están montadas y cruzan opacidad. Antes se reiniciaba heroReady y, durante
  // el cruce, se veía por detrás la pantalla de espera del arranque con su
  // propio logo y título (9-oct-2026).
  const elegirRol = (role: WelcomeRole) => {
    if (role === selectedRole) return;
    onSelectRole(role);
  };

  return (
    <div
      className={`${className} overflow-x-hidden overflow-y-auto text-[#162543] ${heroReady ? "bg-[#f4f7fa]" : "bg-transparent"}`}
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
          className={`ccr-welcome-photo absolute top-0 w-full object-cover object-[center_20%] transition-opacity duration-500 motion-reduce:transition-none ${
            selectedRole === role ? "opacity-100" : "opacity-0"
          }`}
        />
      ))}
      {/* El idioma, arriba a la derecha y en dos letras: es un ajuste, no una
          decisión de bienvenida. Abajo, con su par de píldoras, competía con
          "Crear una cuenta". */}
      <button
        type="button"
        onClick={() => switchLang(english ? "es" : "en")}
        onPointerDown={switchLang.precargar}
        aria-label={english ? "Cambiar a español" : "Switch to English"}
        className="absolute right-4 top-[max(18px,env(safe-area-inset-top))] z-10 inline-flex h-10 min-w-10 items-center justify-center rounded-full px-3 text-[13px] font-bold bg-white/95 text-[#162543] shadow-sm transition hover:bg-white active:scale-95 motion-reduce:transform-none"
      >
        {english ? "ES" : "EN"}
      </button>

      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label={english ? "Back" : "Volver"}
          data-native-back="welcome-access"
          data-testid="native-onboarding-close"
          className="absolute left-4 top-[max(18px,env(safe-area-inset-top))] z-10 inline-flex h-10 w-10 items-center justify-center rounded-full bg-white/95 text-[#162543] ring-1 ring-black/5 backdrop-blur-sm transition active:scale-95 motion-reduce:transform-none"
        >
          <ArrowLeft className="h-5 w-5" strokeWidth={2.4} />
        </button>
      )}

      <div className="relative mx-auto flex min-h-[100dvh] w-full max-w-lg flex-col">
        <section className="ccr-welcome-content text-center" data-testid="native-onboarding-role-step">
          <div className="mb-4 flex justify-center"><ContrataCRLogo /></div>

          <h1
            id={titleId}
            className="mx-auto max-w-[22rem] text-[clamp(1.5rem,6.3vw,1.875rem)] font-extrabold leading-tight tracking-[-0.035em] text-balance"
          >
            {english ? "How do you want to start?" : "¿Cómo quieres empezar?"}
          </h1>

          <div
            className="mt-5 grid grid-cols-2 gap-2 rounded-2xl bg-[#f0f5f8] p-1.5"
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
            />
          </div>

          <button
            type="button"
            onClick={onCreateAccount}
            className="mt-4 min-h-14 w-full rounded-full bg-[#08a7df] px-5 text-[15px] font-extrabold text-white shadow-sm transition hover:bg-[#0796ca] active:scale-[0.99] motion-reduce:transform-none"
          >
            {english ? "Sign up" : "Registrarme"}
          </button>

          <button
            type="button"
            onClick={onLogin}
            className="mt-2 min-h-11 w-full text-center text-sm font-semibold text-[#64748b]"
          >
            {english ? "Already have an account? " : "¿Ya tienes una cuenta? "}
            <span className="font-bold text-[#162543] underline decoration-[#162543]/30 underline-offset-4">
              {english ? "Log in" : "Inicia sesión"}
            </span>
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
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={`min-h-14 rounded-xl px-2 text-[14px] font-bold transition ${
        selected
          ? "bg-white text-[#162543] shadow-sm ring-2 ring-[#009fd9]"
          : "text-[#52627a] hover:bg-white/70 active:bg-white"
      }`}
    >
      {label}
    </button>
  );
}
