"use client";

import { createContext, createElement, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient, hasSupabaseBrowserConfig } from "@/lib/supabase/client";
import { APP_RESUME_EVENT } from "@/lib/app-events";
import { isSigningOut } from "@/lib/auth/sign-out";
import { clearDashboardCache } from "@/lib/dashboard-prefetch-cache";

// Resolve once the image is decoded (or fails / times out — never hangs). Used to keep
// the avatar skeleton up until the photo can paint INSTANTLY, so the navbar never shows
// an initials/empty circle during the image-download window on a first login.
function preloadImage(src: string): Promise<void> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || typeof Image === "undefined") { resolve(); return; }
    const img = new Image();
    const done = () => resolve();
    img.onload = done;
    img.onerror = done;
    img.src = src;
    setTimeout(done, 2000); // safety: don't block the header on a hung request
  });
}

type AuthState = {
  user: User | null;
  avatarUrl: string | null;
  avatarReady: boolean;
  loading: boolean;
  notificationUnread: { offer: number; use: number; neutral: number };
};

const AuthContext = createContext<AuthState | null>(null);

const LAST_AUTH_USER_KEY = "ccr:last-auth-user";
const AVISO_CIERRE_KEY = "ccr:aviso-cierre-sesion:v1";
const RESUME_AUTH_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: PromiseLike<T>, timeoutMs: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error("auth-resume-timeout")), timeoutMs);
    Promise.resolve(promise).then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

function readCachedUser(): User | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(LAST_AUTH_USER_KEY);
    return raw ? (JSON.parse(raw) as User) : null;
  } catch {
    return null;
  }
}

function cacheUser(u: User | null) {
  if (typeof window === "undefined") return;
  try {
    if (u) localStorage.setItem(LAST_AUTH_USER_KEY, JSON.stringify(u));
    else localStorage.removeItem(LAST_AUTH_USER_KEY);
  } catch { /* ignore */ }
}

// Un cierre de sesión que NADIE pidió (la app se abre y ya no hay sesión) no deja
// rastro: pasa en el teléfono de otra persona y lo único que llega es "otra vez me
// sacó". Esto lo anota con el motivo que dio el servidor de sesiones, para poder
// arreglar la causa en vez de adivinarla. No guarda nada que la persona haya escrito.
function anotarCierreNoPedido(evento: string, teniaSesion: boolean) {
  if (typeof window === "undefined" || !teniaSesion || isSigningOut()) return;
  // Marca la sesión del navegador para no repetir el mismo aviso en cada
  // pantalla: lo que interesa es que pasó una vez, no cuántas veces se re-pintó.
  try {
    if (window.sessionStorage.getItem(AVISO_CIERRE_KEY) === evento) return;
    window.sessionStorage.setItem(AVISO_CIERRE_KEY, evento);
  } catch { /* sin sessionStorage se anota igual */ }
  try {
    const cookieDeSesion = /(?:^|;\s*)sb-[a-z0-9]+-auth-token=/.test(document.cookie || "");
    void fetch("/api/client-error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        message: `sesion-cerrada-sola: ${evento} (cookie ${cookieDeSesion ? "presente" : "ausente"})`,
        pathname: window.location.pathname,
        origen: "window",
        native: document.documentElement.classList.contains("ccr-native-app"),
      }),
    }).catch(() => undefined);
  } catch {
    /* dejar constancia nunca puede romper la sesión */
  }
}

function useAuthState(
  initialUser: User | null | undefined = undefined,
  initialAvatarUrl: string | null | undefined = undefined,
  initialNotificationUnread: { offer: number; use: number; neutral: number } = { offer: 0, use: 0, neutral: 0 },
): AuthState {
  // `null` from the server means the request is explicitly anonymous. Only
  // consult the browser cache when no server value was provided at all; using
  // `??` here made an old cached session replace server-rendered anonymous UI
  // during hydration.
  const initialResolvedUser = initialUser === undefined ? readCachedUser() : initialUser;
  const [user, setUser] = useState<User | null>(() => initialResolvedUser);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(() => {
    if (!initialResolvedUser) return null;
    if (typeof window === "undefined") return initialAvatarUrl ?? null;
    try {
      return localStorage.getItem(`ccr:avatar:${initialResolvedUser.id}`) ?? initialAvatarUrl ?? null;
    } catch {
      return initialAvatarUrl ?? null;
    }
  });
  // Whether the avatar has been RESOLVED yet (a known photo URL, or a confirmed
  // no-photo). Until then the header shows a NEUTRAL skeleton — never the explicit
  // initials/"no-photo" circle — so an account WITH a photo can't flash empty before
  // the photo URL is known (the ~1s `profiles` fetch on a fresh login with no cache).
  const [avatarReady, setAvatarReady] = useState(() => {
    if (initialResolvedUser && initialAvatarUrl !== undefined) return true;
    if (!initialResolvedUser || typeof window === "undefined") return false;
    try {
      return Boolean(localStorage.getItem(`ccr:avatar:${initialResolvedUser.id}`));
    } catch {
      return false;
    }
  });
  const [loading, setLoading] = useState(true);
  // El efecto de sesión corre una sola vez; este ref le da el último usuario
  // conocido sin volver a suscribirse en cada render.
  const usuarioConocidoRef = useRef(initialResolvedUser);

  async function syncAvatar(u: User) {
    // The SOCIAL photo (Google/Facebook) lives in user_metadata.avatar_url / picture.
    // It must NOT be the seed: for a quick-login account it would paint for ~1s and then
    // get replaced by the app's own profiles.avatar_url — the visible social→app FLASH.
    // So profiles.avatar_url is the SOURCE OF TRUTH; the social photo is only a fallback
    // when the account has NO app photo (better than initials).
    const social =
      (u.user_metadata?.avatar_url as string | undefined) ||
      (u.user_metadata?.picture as string | undefined) ||
      null;
    let cached: string | null = null;
    try { cached = typeof localStorage !== "undefined" ? localStorage.getItem(`ccr:avatar:${u.id}`) : null; } catch { /* ignore */ }
    // Seed instantly ONLY from the per-user cache — the app's OWN resolved avatar from the
    // last session, NEVER the social photo — so a warm reload shows the right photo with
    // no flash. With NO cache (first login), the skeleton holds until the fetch resolves
    // below; we never paint the social photo first (that was the bug).
    if (cached) { setAvatarUrl((prev) => prev ?? cached); setAvatarReady(true); }

    if (!hasSupabaseBrowserConfig()) {
      const finalUrl = cached || social || null;
      if (finalUrl && !cached) { await preloadImage(finalUrl); }
      setAvatarUrl(finalUrl);
      setAvatarReady(true);
      return;
    }

    // Reconcile with the canonical profile record (Cloudinary uploads) — authoritative —
    // and refresh the cache so the next load is instant. The social photo is used ONLY if
    // there is no app photo. After this we know the true state, so ready flips true.
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", u.id)
      .single();
    const finalUrl = (data?.avatar_url as string | undefined) || social || null;
    // On a FIRST login (no cache seed yet), hold the skeleton until the image is decoded,
    // so the navbar paints the photo directly — never an initials/empty circle during the
    // image download. Warm reloads (cache already shown + image in HTTP cache) skip this.
    if (finalUrl && !cached) { await preloadImage(finalUrl); }
    setAvatarUrl(finalUrl);
    setAvatarReady(true);
    try {
      if (finalUrl) localStorage.setItem(`ccr:avatar:${u.id}`, finalUrl);
      else localStorage.removeItem(`ccr:avatar:${u.id}`);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    const lastAppliedRef = { current: null as User | null };
    if (!hasSupabaseBrowserConfig()) {
      setUser(null);
      cacheUser(null);
      setAvatarUrl(null);
      setAvatarReady(true);
      setLoading(false);
      return;
    }

    const supabase = createClient();
    let mounted = true;
    let sessionSettled = false;
    let resumeSyncRunning = false;
    const sessionTimeout = window.setTimeout(() => {
      if (!mounted || sessionSettled) return;
      // Con una sesión ya conocida (servidor o caché de este navegador), agotar
      // el plazo significa "la red va lenta", no "cerró sesión": vaciar el
      // usuario aquí expulsaba al login desde Mensajes con la sesión intacta.
      // El cierre real llega igual por onAuthStateChange.
      if (usuarioConocidoRef.current) {
        setAvatarReady(true);
        setLoading(false);
        return;
      }
      setUser(null);
      cacheUser(null);
      setAvatarUrl(null);
      setAvatarReady(true);
      setLoading(false);
    }, 4000);

    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (!mounted) return;
        sessionSettled = true;
        window.clearTimeout(sessionTimeout);
        const u = data.session?.user ?? null;
        // El caso que NO deja evento: la app abre y ya no hay sesión. Sin esto no
        // queda rastro de nada, porque nunca hubo un "cierre" que anotar. Se mira
        // si el navegador todavía guarda a quién tenía y si la cookie sobrevivió:
        // con cookie es problema del token, sin cookie se perdió el almacenamiento.
        if (!u && readCachedUser()) anotarCierreNoPedido("arranque-sin-sesion", true);
        lastAppliedRef.current = u;
        // Sin esto, el ref se quedaba con lo que había al montar: quien entraba
        // en esta misma visita no contaba como "sesión conocida" y ni los
        // reintentos ni el registro de cierres lo tomaban en cuenta.
        usuarioConocidoRef.current = u;
        setUser(u);
        cacheUser(u);
        if (u) syncAvatar(u);
        else setAvatarReady(true); // logged out → nothing to load, render immediately
      })
      .catch(() => {
        if (!mounted) return;
        sessionSettled = true;
        window.clearTimeout(sessionTimeout);
        // Que la comprobación falle NO significa que la sesión sea inválida:
        // casi siempre es la red, o el servidor reiniciándose durante una
        // publicación. Cerrar sesión aquí expulsaba de la app cada vez que se
        // publicaba un cambio, y como el cierre era local, ya no volvía.
        // Ahora se conserva lo que se sabía y se reintenta; un cierre real
        // llega igual por onAuthStateChange.
        if (usuarioConocidoRef.current) {
          setAvatarReady(true);
          window.setTimeout(() => {
            if (!mounted) return;
            void supabase.auth.getSession().then(({ data }) => {
              if (!mounted) return;
              const u = data.session?.user ?? null;
              lastAppliedRef.current = u;
              setUser(u);
              cacheUser(u);
              if (u) syncAvatar(u);
            }).catch(() => undefined);
          }, 1500);
          return;
        }
        setUser(null);
        cacheUser(null);
        setAvatarReady(true);
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((evento, session) => {
      const u = session?.user ?? null;
      if (!u && usuarioConocidoRef.current) anotarCierreNoPedido(evento, true);
      usuarioConocidoRef.current = u;
      // La renovación del token al volver de segundo plano trae un objeto
      // nuevo con el mismo usuario: aplicarlo re-renderizaba media app justo
      // cuando la persona está navegando. Mismo contenido → mismo estado.
      if (u && lastAppliedRef.current &&
          u.id === lastAppliedRef.current.id &&
          u.updated_at === lastAppliedRef.current.updated_at) {
        lastAppliedRef.current = u;
        return;
      }
      lastAppliedRef.current = u;
      setUser(u);
      cacheUser(u);
      if (u) {
        syncAvatar(u);
      } else {
        setAvatarUrl(null);
        setAvatarReady(true);
        clearDashboardCache();
      }
    });

    // After a profile change (e.g. cédula verification renames the account, or a
    // new photo), code dispatches `ccr:profile-updated` — re-pull the user so the
    // header name/avatar update IMMEDIATELY even if the metadata change came from a
    // different Supabase client instance that didn't fire our onAuthStateChange.
    const applyUser = (u: User | null) => {
      lastAppliedRef.current = u;
      setUser(u);
      cacheUser(u);
      if (u) {
        void syncAvatar(u);
      } else {
        setAvatarUrl(null);
        setAvatarReady(true);
      }
    };

    const reconcileSession = async () => {
      if (resumeSyncRunning || !mounted) return;
      resumeSyncRunning = true;
      try {
        const { data } = await withTimeout(supabase.auth.getSession(), RESUME_AUTH_TIMEOUT_MS);
        if (!mounted) return;
        const siguiente = data.session?.user ?? null;
        // Mismo usuario y sin cambios → no se toca el estado: un objeto nuevo
        // con el mismo contenido re-renderizaba media app en cada vuelta de foco.
        if (siguiente && lastAppliedRef.current &&
            siguiente.id === lastAppliedRef.current.id &&
            siguiente.updated_at === lastAppliedRef.current.updated_at) {
          return;
        }
        applyUser(siguiente);
      } catch {
        // Keep the last known state. A temporary resume/network timeout must not
        // sign the user out or leave the interface blocked.
      } finally {
        resumeSyncRunning = false;
      }
    };

    const refreshUser = async () => {
      try {
        const { data } = await withTimeout(supabase.auth.getUser(), RESUME_AUTH_TIMEOUT_MS);
        if (mounted) applyUser(data.user ?? null);
      } catch { /* keep the last known profile while the network recovers */ }
    };

    const onProfileUpdated = () => void refreshUser();
    window.addEventListener("ccr:profile-updated", onProfileUpdated);
    window.addEventListener(APP_RESUME_EVENT, reconcileSession);

    return () => {
      mounted = false;
      window.clearTimeout(sessionTimeout);
      subscription.unsubscribe();
      window.removeEventListener("ccr:profile-updated", onProfileUpdated);
      window.removeEventListener(APP_RESUME_EVENT, reconcileSession);
    };
  }, []);

  return { user, avatarUrl, avatarReady, loading, notificationUnread: initialNotificationUnread };
}

export function AuthProvider({ children, initialUser, initialAvatarUrl, initialNotificationUnread }: { children: ReactNode; initialUser?: User | null; initialAvatarUrl?: string | null; initialNotificationUnread?: { offer: number; use: number; neutral: number } }) {
  const value = useAuthState(initialUser, initialAvatarUrl, initialNotificationUnread);
  return createElement(AuthContext.Provider, { value }, children);
}

export function useAuth(): AuthState {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth must be used within AuthProvider");
  return value;
}
