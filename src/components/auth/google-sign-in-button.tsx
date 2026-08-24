"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

// "Continuar con Google" without the detour through Supabase's domain.
//
// The redirect flow sends the person to Google and back through
// <project>.supabase.co, so Google's consent screen says "to continue to
// kskue…supabase.co". Supabase would put our domain there for $10/month.
// Google Identity Services does it for free: the sign-in happens on our page,
// Google returns an ID token, and Supabase verifies that token directly
// (`signInWithIdToken`) — the same path the native app already uses. Google's
// screen then names the origin the request came from: contratacr.com.
//
// Google renders the button itself (that is how its click flow works), styled
// to sit beside the Apple button. If the library cannot load — no client id,
// blocked network, unsupported browser — the caller's fallback button shows
// and the redirect flow still works.
const GOOGLE_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
// Google only completes the page-level flow for origins registered on the web
// client ID. A page served from an origin that is not registered would still
// show Google's button and then fail at the very end, so the button is used only
// where the deployment says it is safe; everywhere else the redirect flow stays.
const IDENTITY_ORIGINS = (process.env.NEXT_PUBLIC_GOOGLE_IDENTITY_ORIGINS ?? "")
  .split(",")
  .map((origin) => origin.trim().replace(/\/+$/, ""))
  .filter(Boolean);
const GIS_SRC = "https://accounts.google.com/gsi/client";

type GoogleId = {
  initialize: (config: Record<string, unknown>) => void;
  renderButton: (parent: HTMLElement, options: Record<string, unknown>) => void;
  cancel: () => void;
};
declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleId } };
  }
}

let gisLoading: Promise<GoogleId> | null = null;
function loadGoogleIdentity(): Promise<GoogleId> {
  if (typeof window === "undefined") return Promise.reject(new Error("no window"));
  if (window.google?.accounts?.id) return Promise.resolve(window.google.accounts.id);
  if (!gisLoading) {
    gisLoading = new Promise<GoogleId>((resolve, reject) => {
      const existing = document.querySelector<HTMLScriptElement>(`script[src="${GIS_SRC}"]`);
      const script = existing ?? document.createElement("script");
      const done = () => {
        const id = window.google?.accounts?.id;
        if (id) resolve(id);
        else reject(new Error("Google Identity Services unavailable"));
      };
      script.addEventListener("load", done, { once: true });
      script.addEventListener("error", () => reject(new Error("Google Identity Services failed to load")), { once: true });
      if (!existing) {
        script.src = GIS_SRC;
        script.async = true;
        script.defer = true;
        document.head.appendChild(script);
      } else if (window.google?.accounts?.id) done();
    }).catch((error) => {
      gisLoading = null;
      throw error;
    });
  }
  return gisLoading;
}

function randomNonce() {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function isGoogleIdentityConfigured() {
  return Boolean(GOOGLE_CLIENT_ID) && typeof window !== "undefined" && IDENTITY_ORIGINS.includes(window.location.origin);
}

export function GoogleSignInButton({
  locale,
  disabled,
  fallback,
  onCredential,
  onError,
  onReturn,
}: {
  locale: string;
  disabled?: boolean;
  /** Shown until Google's button is ready, and for good if it never is. */
  fallback: ReactNode;
  /** Google's ID token plus the raw nonce Supabase must be handed alongside it. */
  onCredential: (idToken: string, nonce: string) => void | Promise<void>;
  onError?: (error: unknown) => void;
  /** The person is back from Google's window (it closed or lost focus) — a
   *  credential may follow within a moment, or they cancelled. */
  onReturn?: () => void;
}) {
  const host = useRef<HTMLDivElement | null>(null);
  const [ready, setReady] = useState(false);
  // The nonce lives for the life of the button: Google signs its hash into the
  // token, Supabase checks the hash against the raw value we send with it.
  const nonce = useRef<string | null>(null);

  useEffect(() => {
    if (!isGoogleIdentityConfigured()) return;
    let cancelled = false;
    (async () => {
      try {
        const id = await loadGoogleIdentity();
        if (cancelled || !host.current) return;
        if (!nonce.current) nonce.current = randomNonce();
        const hashedNonce = await sha256Hex(nonce.current);
        id.initialize({
          client_id: GOOGLE_CLIENT_ID,
          callback: (response: { credential?: string }) => {
            if (response.credential && nonce.current) void onCredential(response.credential, nonce.current);
          },
          nonce: hashedNonce,
          ux_mode: "popup",
          auto_select: false,
          itp_support: true,
          // The classic popup, always: FedCM for the button flow quietly does
          // nothing where the browser holds no Google session, and it is still
          // rolling out — the popup works for everyone, on every origin.
          use_fedcm_for_button: false,
        });
        host.current.innerHTML = "";
        id.renderButton(host.current, {
          type: "standard",
          theme: "outline",
          size: "large",
          shape: "pill",
          text: "continue_with",
          logo_alignment: "center",
          locale,
          // Google caps the button at 400px; the login card is narrower than that.
          width: Math.min(400, Math.max(200, Math.floor(host.current.clientWidth || 360))),
        });
        setReady(true);
      } catch (error) {
        onError?.(error);
      }
    })();
    return () => {
      cancelled = true;
    };
    // The callback identity is not what drives re-initialisation; a new locale is.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [locale]);

  // Our own button is the only thing anyone ever sees. Google's rendered button
  // sits on top of it, invisible, exactly the same size, and takes the click —
  // that is how Google's flow has to be started. Nothing swaps, nothing fades,
  // nothing moves: the page looks the same before, during and after Google's
  // library loads. If the library never renders, the visible button is still
  // ours and its own click runs the redirect flow.
  // Arm "back from Google" detection on the click that opens Google's window: the
  // page loses focus/visibility while the window is up and regains it when it
  // closes, on desktop (popup) and on iOS Safari (new tab) alike.
  const armed = useRef(false);
  useEffect(() => {
    const back = () => {
      if (!armed.current || document.visibilityState !== "visible") return;
      armed.current = false;
      onReturn?.();
    };
    window.addEventListener("focus", back);
    document.addEventListener("visibilitychange", back);
    return () => {
      window.removeEventListener("focus", back);
      document.removeEventListener("visibilitychange", back);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative h-11 w-full">
      <div className="absolute inset-0">{fallback}</div>
      <div
        ref={host}
        data-testid="google-identity-button"
        aria-hidden
        className="absolute inset-x-0 top-1/2 flex -translate-y-1/2 justify-center overflow-hidden"
        style={{ opacity: 0.001, pointerEvents: ready && !disabled ? "auto" : "none" }}
        onPointerDownCapture={() => { armed.current = true; }}
      />
    </div>
  );
}
