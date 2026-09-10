"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { PushNotifications, type Token } from "@capacitor/push-notifications";
import { Capacitor } from "@capacitor/core";
import { Bell, BellRing, CalendarCheck, CheckCircle2, MessageCircle, Settings, Star } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { EVENTO_MOMENTO_AVISO, type MotivoDeAviso } from "@/lib/push-moment";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { cn } from "@/lib/utils";
import type { AccountSignOutDetail } from "@/lib/auth/sign-out";

function isNativeMobile() {
  if (typeof window === "undefined") return false;
  if (!Capacitor.isNativePlatform()) return false;
  return Capacitor.getPlatform() === "ios" || Capacitor.getPlatform() === "android";
}
type PushTokenPayload = {
  token: string;
  platform: "android" | "ios";
  deviceId?: string;
  appVersion?: string;
};

const TOKEN_POST_RETRY_DELAYS_MS = [0, 750, 2_500] as const;

function waitForRetry(delayMs: number, signal: AbortSignal) {
  return new Promise<boolean>((resolve) => {
    if (signal.aborted) return resolve(false);
    const cancel = () => {
      window.clearTimeout(timer);
      resolve(false);
    };
    const timer = window.setTimeout(() => {
      signal.removeEventListener("abort", cancel);
      resolve(true);
    }, delayMs);
    signal.addEventListener("abort", cancel, { once: true });
  });
}

async function safePostToken(payload: PushTokenPayload, signal: AbortSignal) {
  for (let attempt = 0; attempt < TOKEN_POST_RETRY_DELAYS_MS.length; attempt += 1) {
    if (signal.aborted) return false;
    const delay = TOKEN_POST_RETRY_DELAYS_MS[attempt] ?? 0;
    if (delay > 0 && !await waitForRetry(delay, signal)) return false;

    try {
      const response = await fetch("/api/push/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
        signal,
      });
      if (response.ok) return true;

      const retryable = response.status === 408 || response.status === 425
        || response.status === 429 || response.status >= 500;
      if (!retryable) return false;
    } catch {
      // The last failure returns false; registration is retried on the next
      // native startup because a failed token is never cached as acknowledged.
    }
  }
  return false;
}

function normalizePushUrl(rawUrl: unknown) {
  if (typeof rawUrl !== "string" || !rawUrl.startsWith("/")) return null;
  return rawUrl.replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

function permissionGrantedKey(userId: string) {
  return `ccr:push-permission-granted:${userId}`;
}

// Cuántas veces se preguntó y cuándo fue la última. Se pregunta como máximo
// tres veces por cuenta, con al menos una semana entre una y otra: pedirlo
// una sola vez y rendirse dejaba sin avisos a quien tocó "Ahora no" por
// reflejo, y pedirlo siempre es la forma más rápida de que lo apaguen.
function askStateKey(userId: string) {
  return `ccr:push-ask:v4:${userId}`;
}
function deniedExplainedKey(userId: string) {
  return `ccr:push-denied-explained:v1:${userId}`;
}
const LAUNCHES_KEY = "ccr:push-launches:v1";
const LAUNCH_SESSION_KEY = "ccr:push-launch-counted:v1";
const MAX_ASKS = 3;
const DAYS_BETWEEN_ASKS = 7;

type AskState = { veces: number; ultima: number };

function readAskState(userId: string): AskState {
  try {
    const raw = window.localStorage.getItem(askStateKey(userId));
    if (!raw) return { veces: 0, ultima: 0 };
    const parsed = JSON.parse(raw) as Partial<AskState>;
    return { veces: Number(parsed.veces) || 0, ultima: Number(parsed.ultima) || 0 };
  } catch {
    return { veces: 0, ultima: 0 };
  }
}

function canAskAgain(userId: string) {
  const { veces, ultima } = readAskState(userId);
  if (veces >= MAX_ASKS) return false;
  if (veces === 0) return true;
  return Date.now() - ultima > DAYS_BETWEEN_ASKS * 24 * 60 * 60 * 1000;
}

function markAsked(userId: string) {
  const { veces } = readAskState(userId);
  window.localStorage.setItem(askStateKey(userId), JSON.stringify({ veces: veces + 1, ultima: Date.now() }));
}

// Arranques de la app en esta instalación (uno por sesión del WebView). La
// pregunta "sin motivo" espera al segundo arranque: en el primero la persona
// acaba de entrar y todavía no tiene nada que esperar.
function countLaunch() {
  try {
    if (window.sessionStorage.getItem(LAUNCH_SESSION_KEY) === "1") return;
    window.sessionStorage.setItem(LAUNCH_SESSION_KEY, "1");
    const n = Number(window.localStorage.getItem(LAUNCHES_KEY)) || 0;
    window.localStorage.setItem(LAUNCHES_KEY, String(n + 1));
  } catch {
    // sin almacenamiento no hay conteo; se trata como primer arranque
  }
}
function launches() {
  return Number(window.localStorage.getItem(LAUNCHES_KEY)) || 0;
}

type Motivo = MotivoDeAviso | "panel";
type Pantalla = { motivo: Motivo; modo: "pedir" | "ajustes" };

async function vibrar(tipo: "abrir" | "logrado") {
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (tipo === "abrir") await Haptics.impact({ style: ImpactStyle.Light });
    else await Haptics.notification({ type: NotificationType.Success });
  } catch {
    // sin háptica no pasa nada
  }
}

function normalizePathname(pathname: string | null) {
  return (pathname ?? "/").replace(/^\/(es|en)(?=\/|$)/, "") || "/";
}

function canShowPermissionPrompt(pathname: string | null) {
  const path = normalizePathname(pathname);
  if (
    path.startsWith("/login") ||
    path.startsWith("/registro") ||
    path.startsWith("/reset-password") ||
    path.startsWith("/olvide-contrasena") ||
    path.startsWith("/onboarding") ||
    path.startsWith("/completar-perfil") ||
    path.startsWith("/auth/")
  ) {
    return false;
  }
  return true;
}

function isPanelPath(pathname: string | null) {
  return normalizePathname(pathname).startsWith("/dashboard");
}

export function PushTokenManager() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const activeRef = useRef(false);
  const signingOutRef = useRef(false);
  const registeredTokenRef = useRef<string | null>(null);
  const registrationAbortRef = useRef<AbortController | null>(null);
  const registrationTaskRef = useRef<Promise<boolean> | null>(null);
  const removersRef = useRef<Array<() => Promise<void> | void>>([]);
  const promptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [pantalla, setPantalla] = useState<Pantalla | null>(null);
  const [requesting, setRequesting] = useState(false);
  const t = useTranslations("pushPrompt");

  const cleanupListeners = useCallback(() => {
    while (removersRef.current.length) {
      const remove = removersRef.current.pop();
      void remove?.();
    }
    activeRef.current = false;
  }, []);

  useEffect(() => {
    if (!isNativeMobile()) return;
    let cancelled = false;
    let removeAction: (() => Promise<void> | void) | null = null;

    const initActionListener = async () => {
      try {
        const actionListener = await PushNotifications.addListener("pushNotificationActionPerformed", (event) => {
          const href = normalizePushUrl(event.notification.data?.url);
          if (!href) return;
          window.sessionStorage.setItem("ccr:pending-push-url", href);
          router.push(href);
        });
        if (cancelled) {
          void actionListener.remove();
          return;
        }
        removeAction = () => actionListener.remove();
      } catch (error) {
        console.error("[push] action listener failed", error);
      }
    };

    void initActionListener();

    return () => {
      cancelled = true;
      void removeAction?.();
    };
  }, [router]);

  const registerCurrentDevice = useCallback(async () => {
    if (!user || !isNativeMobile() || activeRef.current) return;
    activeRef.current = true;

    const platform = Capacitor.getPlatform() === "ios" ? "ios" : "android";

    const onToken = async (token: Token) => {
      if (signingOutRef.current) return;
      registeredTokenRef.current = token.value;

      // Capacitor exposes the APNs device token on iOS. The backend currently
      // sends through FCM, so this value must never be mislabeled as FCM.
      if (platform === "ios") return;

      registrationAbortRef.current?.abort();
      const controller = new AbortController();
      registrationAbortRef.current = controller;
      const task = safePostToken({
        token: token.value,
        platform,
        deviceId: Capacitor.getPlatform(),
        appVersion: navigator.userAgent?.slice(0, 64),
      }, controller.signal);
      registrationTaskRef.current = task;
      await task;
      if (registrationTaskRef.current === task) registrationTaskRef.current = null;
      if (registrationAbortRef.current === controller) registrationAbortRef.current = null;
    };

    const onError = (error: unknown) => {
      console.error("[push] registration error", error);
    };

    try {
      const regListener = await PushNotifications.addListener("registration", (token) => {
        void onToken(token);
      });
      const errListener = await PushNotifications.addListener("registrationError", onError);

      removersRef.current.push(() => regListener.remove());
      removersRef.current.push(() => errListener.remove());

      await PushNotifications.register();
    } catch (error) {
      activeRef.current = false;
      console.error("[push] init failed", error);
    }
  }, [user]);

  const requestNotifications = useCallback(async () => {
    if (!user || !isNativeMobile()) return;
    setRequesting(true);
    try {
      const result = await PushNotifications.requestPermissions();
      if (result.receive === "granted") {
        window.localStorage.setItem(permissionGrantedKey(user.id), "1");
        void vibrar("logrado");
        setPantalla(null);
        await registerCurrentDevice();
        return;
      }
      // El sistema ya no vuelve a preguntar: se explica el camino por Ajustes
      // una sola vez y no se insiste más.
      window.localStorage.setItem(deniedExplainedKey(user.id), "1");
      setPantalla((actual) => (actual ? { ...actual, modo: "ajustes" } : null));
    } catch (error) {
      console.error("[push] permission request failed", error);
    } finally {
      setRequesting(false);
    }
  }, [registerCurrentDevice, user]);

  const dismissPrompt = useCallback(() => {
    setPantalla(null);
  }, []);

  const abrirPantalla = useCallback((motivo: Motivo, modo: Pantalla["modo"]) => {
    if (!user) return;
    markAsked(user.id);
    void vibrar("abrir");
    setPantalla({ motivo, modo });
  }, [user]);

  // Momentos de alta intención: la pantalla que acaba de mandar el mensaje, la
  // cita, la propuesta, la postulación o la cotización avisa, y aquí se decide
  // si toca preguntar. Se espera un poco para que se vea primero el "enviado".
  useEffect(() => {
    if (loading || !user || !isNativeMobile()) return;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const onMomento = (raw: Event) => {
      const motivo = (raw as CustomEvent<{ motivo: MotivoDeAviso }>).detail?.motivo;
      if (!motivo) return;
      if (window.localStorage.getItem(permissionGrantedKey(user.id)) === "1") return;
      void PushNotifications.checkPermissions().then((permissions) => {
        if (permissions.receive === "granted") return;
        if (permissions.receive === "denied") {
          if (window.localStorage.getItem(deniedExplainedKey(user.id)) === "1") return;
          window.localStorage.setItem(deniedExplainedKey(user.id), "1");
          timer = setTimeout(() => abrirPantalla(motivo, "ajustes"), 900);
          return;
        }
        if (!canAskAgain(user.id)) return;
        timer = setTimeout(() => abrirPantalla(motivo, "pedir"), 900);
      }).catch(() => {});
    };
    window.addEventListener(EVENTO_MOMENTO_AVISO, onMomento);
    return () => {
      window.removeEventListener(EVENTO_MOMENTO_AVISO, onMomento);
      if (timer) clearTimeout(timer);
    };
  }, [abrirPantalla, loading, user]);

  useEffect(() => {
    if (promptTimerRef.current) {
      clearTimeout(promptTimerRef.current);
      promptTimerRef.current = null;
    }

    if (loading || !user) {
      cleanupListeners();
      return;
    }

    if (!isNativeMobile()) return;
    countLaunch();
    if (!canShowPermissionPrompt(pathname)) return;

    let cancelled = false;
    const grantedKey = permissionGrantedKey(user.id);

    const init = async () => {
      try {
        const permissions = await PushNotifications.checkPermissions();
        if (cancelled) return;
        if (permissions.receive === "granted") {
          window.localStorage.setItem(grantedKey, "1");
          await registerCurrentDevice();
          return;
        }
        window.localStorage.removeItem(grantedKey);
        if (permissions.receive === "denied") return;
        // Pregunta de respaldo, sin acción de por medio: en el panel, a partir
        // del segundo arranque, y respetando los mismos límites de frecuencia.
        if (!isPanelPath(pathname) || launches() < 2 || !canAskAgain(user.id)) return;
        promptTimerRef.current = setTimeout(() => {
          if (cancelled) return;
          abrirPantalla("panel", "pedir");
        }, 2500);
      } catch (error) {
        console.error("[push] permission check failed", error);
      }
    };

    void init();

    return () => {
      cancelled = true;
      if (promptTimerRef.current) {
        clearTimeout(promptTimerRef.current);
        promptTimerRef.current = null;
      }
    };
  }, [abrirPantalla, cleanupListeners, loading, pathname, registerCurrentDevice, user]);

  useEffect(() => {
    if (loading || !user || !isNativeMobile()) return;
    const pendingHref = normalizePushUrl(window.sessionStorage.getItem("ccr:pending-push-url"));
    if (!pendingHref) return;
    window.sessionStorage.removeItem("ccr:pending-push-url");
    router.push(pendingHref);
  }, [loading, router, user]);

  useEffect(() => cleanupListeners, [cleanupListeners]);

  useEffect(() => {
    if (!user) return;
    signingOutRef.current = false;
    const deactivate = (rawEvent: Event) => {
      signingOutRef.current = true;
      registrationAbortRef.current?.abort();
      const token = registeredTokenRef.current;
      const work = (async () => {
        await registrationTaskRef.current?.catch(() => false);
        let backendRevoked = !token;
        if (token) {
          try {
            const response = await fetch("/api/push/register", {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ token }),
              keepalive: true,
            });
            backendRevoked = response.ok;
          } catch {
            backendRevoked = false;
          }
        }
        await PushNotifications.unregister().catch(() => undefined);
        if (!backendRevoked) return;
        registeredTokenRef.current = null;
        // Preserve legacy token caches if backend revocation failed so a later
        // authenticated session can retry instead of forgetting an active row.
        for (const platform of ["android", "ios"] as const) {
          window.localStorage.removeItem(`ccr:push-token-registered:v2:${user.id}:${platform}`);
          window.localStorage.removeItem(`ccr:push-token:${user.id}:${platform}`);
        }
      })();
      const event = rawEvent as CustomEvent<AccountSignOutDetail>;
      event.detail?.waitUntil(work);
    };
    window.addEventListener("contratacr:signing-out", deactivate);
    return () => window.removeEventListener("contratacr:signing-out", deactivate);
  }, [user]);

  if (loading || !pantalla || !user || !isNativeMobile()) return null;

  const { motivo, modo } = pantalla;
  const ajustes = modo === "ajustes";
  // La tarjeta de adelante muestra el aviso que la persona está esperando
  // ahora mismo; las de atrás, lo demás que llega por ahí.
  const frente = { titulo: t(`card.${motivo}.title`), texto: t(`card.${motivo}.body`) };
  const detras = motivo === "mensaje" || motivo === "panel"
    ? [{ titulo: t("card.cita.title"), texto: t("card.cita.body") }, { titulo: t("card.resena.title"), texto: t("card.resena.body") }]
    : [{ titulo: t("card.mensaje.title"), texto: t("card.mensaje.body") }, { titulo: t("card.resena.title"), texto: t("card.resena.body") }];
  const tarjetas = [detras[1], detras[0], frente];

  return createPortal(
    <div
      className="ccr-aviso-fondo fixed inset-0 flex items-end justify-center"
      style={{ zIndex: 100000 }}
      role="presentation"
      onClick={dismissPrompt}
    >
      <div
        className="ccr-aviso-hoja relative w-full max-w-md overflow-hidden rounded-t-[28px] bg-white px-6 pb-[max(env(safe-area-inset-bottom),1.25rem)] pt-3 shadow-[0_-24px_60px_-30px_rgba(15,23,42,0.5)]"
        role="dialog"
        aria-modal="true"
        aria-labelledby="push-permission-title"
        onClick={(event) => event.stopPropagation()}
      >
        <span aria-hidden className="mx-auto mb-3 block h-1.5 w-10 rounded-full bg-[#dde3ea]" />

        {/* La ilustración es la pantalla bloqueada del propio teléfono: tres
            avisos apilados, el de adelante con lo que la persona espera hoy. */}
        <div aria-hidden className="ccr-aviso-escena relative mx-auto mb-6 h-[200px] w-full overflow-hidden rounded-3xl">
          <span className="ccr-aviso-brillo" />
          <div className="ccr-aviso-pila">
            {tarjetas.map((tarjeta, i) => (
              <div key={tarjeta.titulo + i} className="ccr-aviso-tarjeta" style={{ ["--i" as string]: i }}>
                <span className="ccr-aviso-icono">
                  {/* eslint-disable-next-line @next/next/no-img-element -- ícono fijo de la app */}
                  <img src="/logo-mark.png" alt="" className="h-7 w-7" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center justify-between gap-2 text-[11px] font-semibold text-[#8a94a6]">
                    <span>ContrataCR</span>
                    <span className="font-medium">{t("now")}</span>
                  </span>
                  <span className="block truncate text-[13.5px] font-bold leading-tight text-[#162543]">{tarjeta.titulo}</span>
                  <span className="block truncate text-[12.5px] leading-snug text-[#52627a]">{tarjeta.texto}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        <h2 id="push-permission-title" className="text-center text-[22px] font-extrabold leading-tight tracking-tight text-[#162543]">
          {ajustes ? t("settingsTitle") : t(`title.${motivo}`)}
        </h2>
        <p className="mx-auto mt-2 max-w-[21rem] text-center text-[14px] leading-relaxed text-[#64748b]">
          {ajustes ? t("settingsBody") : t("body")}
        </p>

        {!ajustes && (
          <ul className="mx-auto mt-4 flex max-w-[21rem] flex-col gap-2">
            {[
              { Icono: MessageCircle, texto: t("reason.messages") },
              { Icono: CalendarCheck, texto: t("reason.bookings") },
              { Icono: Star, texto: t("reason.reviews") },
            ].map(({ Icono, texto }) => (
              <li key={texto} className="flex items-center gap-2.5 text-[13.5px] font-medium text-[#334155]">
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#e8f8fe] text-[#009FD9]">
                  <Icono className="h-4 w-4" strokeWidth={2.2} />
                </span>
                {texto}
              </li>
            ))}
          </ul>
        )}

        {ajustes ? (
          <ol className="mx-auto mt-4 flex max-w-[21rem] flex-col gap-2 text-[13.5px] text-[#334155]">
            {[t("settingsStep1"), t("settingsStep2"), t("settingsStep3")].map((paso, i) => (
              <li key={paso} className="flex items-center gap-2.5">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-[#eef3f8] text-[12px] font-bold text-[#162543]">{i + 1}</span>
                {paso}
              </li>
            ))}
          </ol>
        ) : null}

        <div className="mt-6 flex flex-col gap-2">
          {ajustes ? (
            <button
              type="button"
              onClick={dismissPrompt}
              className="inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#162543] text-[16px] font-bold text-white transition active:scale-[0.98]"
            >
              <CheckCircle2 className="h-5 w-5" />
              {t("understood")}
            </button>
          ) : (
            <button
              type="button"
              onClick={requestNotifications}
              disabled={requesting}
              className={cn(
                "inline-flex h-[52px] w-full items-center justify-center gap-2 rounded-2xl bg-[#009FD9] text-[16px] font-bold text-white shadow-[0_14px_30px_-16px_rgba(0,159,217,0.9)] transition active:scale-[0.98]",
                requesting && "cursor-wait opacity-70",
              )}
            >
              {requesting ? <Bell className="h-5 w-5 animate-pulse" /> : <BellRing className="h-5 w-5" />}
              {requesting ? t("activating") : t("activate")}
            </button>
          )}
          {!ajustes && (
            <button
              type="button"
              onClick={dismissPrompt}
              className="h-11 w-full rounded-2xl text-[15px] font-semibold text-[#64748b] transition hover:bg-[#f8fafc] active:scale-[0.98]"
            >
              {t("later")}
            </button>
          )}
        </div>
        <p className="mt-3 flex items-center justify-center gap-1.5 text-center text-[12px] text-[#94a3b8]">
          <Settings className="h-3.5 w-3.5" />
          {t("footnote")}
        </p>
      </div>
    </div>,
    document.body,
  );
}
