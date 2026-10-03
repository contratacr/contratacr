"use client";

import { useEffect, useRef } from "react";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { useRouter } from "next/navigation";
import { APP_RESUME_EVENT } from "@/lib/app-events";
import { createClient } from "@/lib/supabase/client";

const RECOVERY_THROTTLE_MS = 2_000;
// VIGILANTE DE LA APP DORMIDA. Isaac dejó la app abierta unos minutos y al
// retomarla no reaccionaba: la WebView vuelve con conexiones muertas y algo se
// queda esperando una respuesta que no llega. Tras un rato en segundo plano,
// al volver se le pregunta al servidor; si dos veces no contesta en 8 s, la
// pantalla se recarga sola. Solo en la app (en la web Safari ya recarga por su
// cuenta) y los borradores de chat quedan guardados en el navegador, así que no
// se pierden con la recarga.
//
// 3-oct-2026: con 5 min y 8 s × 2 el lag al retomar la app tras ~15 min podía
// durar hasta 16 s. Ahora se DESPIERTA tras 1 minuto —en segundo plano o
// simplemente sin tocarla— y con 3 s de espera: se renueva la sesión (si venció,
// cada consulta esperaba a renovarla) y se abre una conexión nueva antes de que
// la persona necesite la red.
const DESPERTAR_TRAS_MS = 60_000;
const VIGILIA_RESPUESTA_MS = 3_000;

let despertando = false;
async function despertar(recargarSiNoResponde: boolean) {
  if (despertando) return;
  despertando = true;
  try {
    void createClient().auth.getSession().catch(() => undefined);
    for (let intento = 0; intento < 2; intento += 1) {
      try {
        const r = await fetch("/api/health", { cache: "no-store", signal: AbortSignal.timeout(VIGILIA_RESPUESTA_MS) });
        if (r.ok) return;
      } catch {
        // Sin respuesta: se intenta una vez más.
      }
    }
    if (recargarSiNoResponde) window.location.reload();
  } finally {
    despertando = false;
  }
}

export function AppResumeRecovery() {
  const router = useRouter();
  const lastRecoveryRef = useRef(0);
  // Solo un corte de red REAL justifica reconciliar contra el servidor: al
  // volver de segundo plano iOS dispara `online` sin haber estado sin red.
  const wasOfflineRef = useRef(false);
  const ocultaDesdeRef = useRef(0);

  useEffect(() => {
    const path = window.location.pathname;
    const locale = path.startsWith("/en") ? "en" : "es";
    const localeRoot = path === `${prefijoDeIdioma(locale) || "/"}` || path === `${prefijoDeIdioma(locale)}/`;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const isRecoveryHash =
      hashParams.get("type") === "recovery" ||
      (!!hashParams.get("access_token") && !!hashParams.get("refresh_token"));
    const hasRecoveryCode = localeRoot && !!searchParams.get("code");

    if (localeRoot && isRecoveryHash) {
      window.location.replace(`${prefijoDeIdioma(locale)}/reset-password${window.location.hash}`);
      return;
    }

    if (hasRecoveryCode) {
      window.location.replace(`${prefijoDeIdioma(locale)}/reset-password${window.location.search}`);
      return;
    }

    const recover = (forceRefresh = false) => {
      if (document.visibilityState === "hidden") return;

      const now = Date.now();
      window.dispatchEvent(new Event(APP_RESUME_EVENT));

      if (forceRefresh) {
        if (now - lastRecoveryRef.current < RECOVERY_THROTTLE_MS) return;
        lastRecoveryRef.current = now;
        // Let Supabase resume its token refresh first, then reconcile server data.
        window.setTimeout(() => router.refresh(), 100);
      }
    };

    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") {
        ocultaDesdeRef.current = Date.now();
        return;
      }
      const dormida = ocultaDesdeRef.current ? Date.now() - ocultaDesdeRef.current : 0;
      ocultaDesdeRef.current = 0;
      recover();
      if (dormida >= DESPERTAR_TRAS_MS) void despertar(document.documentElement.classList.contains("ccr-native-app"));
    };

    const onPageShow = (event: PageTransitionEvent) => {
      recover(event.persisted);
    };

    const onFocus = () => recover();
    const onOffline = () => {
      wasOfflineRef.current = true;
    };
    const onOnline = () => {
      const force = wasOfflineRef.current;
      wasOfflineRef.current = false;
      recover(force);
    };

    // Sin pasar a segundo plano también se duerme: el teléfono sobre la mesa con
    // la app abierta. El primer toque tras un rato quieta despierta la red en
    // paralelo a lo que ese toque pida (sin recargar: la persona ya está actuando).
    let ultimoToque = Date.now();
    const alTocar = () => {
      const ahora = Date.now();
      if (ahora - ultimoToque >= DESPERTAR_TRAS_MS) void despertar(false);
      ultimoToque = ahora;
    };
    window.addEventListener("pointerdown", alTocar, { capture: true, passive: true });

    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    window.addEventListener("offline", onOffline);
    window.addEventListener("online", onOnline);

    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
      window.removeEventListener("offline", onOffline);
      window.removeEventListener("online", onOnline);
      window.removeEventListener("pointerdown", alTocar, { capture: true });
    };
  }, [router]);

  return null;
}
