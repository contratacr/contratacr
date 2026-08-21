import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeAppRuntime } from "@/hooks/use-native-app";

// Native Sign in with Apple / Google for the Capacitor app. The web OAuth
// redirect leaves the app for the system browser, which App Review rejects
// (Guideline 4); here the platform sheet returns an id token and Supabase
// accepts it directly, so the user never leaves ContrataCR.
//
// Provider configuration lives outside the code: the Google web client id is
// the one Supabase already trusts, iOS also needs its own client id, and Apple
// on Android needs a Services ID plus redirect URL. Whatever is missing simply
// falls back to the existing web flow, so a half-configured build still signs in.

export type NativeSocialProvider = "apple" | "google";
export type NativeSocialOutcome = "signed-in" | "cancelled" | "unavailable";

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const APPLE_REDIRECT_URL = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URL;

let initialization: Promise<boolean> | null = null;

async function loadPlugin() {
  const [{ SocialLogin }, { Capacitor }] = await Promise.all([
    import("@capgo/capacitor-social-login"),
    import("@capacitor/core"),
  ]);
  return { SocialLogin, platform: Capacitor.getPlatform() };
}

function ensureInitialized() {
  if (!initialization) {
    initialization = (async () => {
      const { SocialLogin, platform } = await loadPlugin();
      // Android validates the Apple block eagerly (it needs the Services ID and
      // redirect URL), so an unconfigured Apple must not take Google down with it.
      const appleConfigured = platform === "ios" || (Boolean(APPLE_SERVICES_ID) && Boolean(APPLE_REDIRECT_URL));
      await SocialLogin.initialize({
        ...(GOOGLE_WEB_CLIENT_ID
          ? { google: { webClientId: GOOGLE_WEB_CLIENT_ID, iOSClientId: GOOGLE_IOS_CLIENT_ID || undefined, mode: "online" as const } }
          : {}),
        ...(appleConfigured
          ? { apple: { clientId: APPLE_SERVICES_ID || undefined, redirectUrl: APPLE_REDIRECT_URL || undefined } }
          : {}),
      });
      return true;
    })().catch((error) => {
      console.warn("[native-auth] plugin initialization failed:", error);
      initialization = null;
      return false;
    });
  }
  return initialization;
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

function isConfigured(provider: NativeSocialProvider, platform: string) {
  if (provider === "google") return Boolean(GOOGLE_WEB_CLIENT_ID) && (platform !== "ios" || Boolean(GOOGLE_IOS_CLIENT_ID));
  // Apple on iOS only needs the entitlement; Android goes through Apple's web
  // flow and must know the Services ID and where Apple should send the user back.
  return platform === "ios" || (Boolean(APPLE_SERVICES_ID) && Boolean(APPLE_REDIRECT_URL));
}

function isCancellation(error: unknown) {
  const text = String((error as { message?: string })?.message ?? error).toLowerCase();
  return /cancel|dismiss|user closed|12501|1001/.test(text);
}

export async function nativeSocialSignIn(
  provider: NativeSocialProvider,
  supabase: SupabaseClient,
): Promise<NativeSocialOutcome> {
  if (!isNativeAppRuntime()) return "unavailable";

  let platform: string;
  try {
    ({ platform } = await loadPlugin());
  } catch {
    return "unavailable";
  }
  if (platform === "web" || !isConfigured(provider, platform)) return "unavailable";
  if (!(await ensureInitialized())) return "unavailable";

  const { SocialLogin } = await loadPlugin();
  // The provider receives the hashed nonce and signs it into the id token;
  // Supabase gets the raw one and checks that the hashes match. Google gets no
  // extra scopes: the default OIDC id token already carries email and profile,
  // and the Android plugin refuses scopes without a patched MainActivity.
  const nonce = randomNonce();
  const hashedNonce = await sha256Hex(nonce);

  let idToken: string | null | undefined;
  try {
    const response = provider === "apple"
      ? await SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"], nonce: hashedNonce } })
      : await SocialLogin.login({ provider: "google", options: { nonce: hashedNonce } });
    idToken = (response.result as { idToken?: string | null }).idToken;
  } catch (error) {
    if (isCancellation(error)) return "cancelled";
    // A misconfigured provider (missing SHA-1, wrong client id) must not strand
    // the user: the web flow still works, it is just the worse experience.
    console.warn(`[native-auth] ${provider} sheet failed, using web flow:`, error);
    return "unavailable";
  }
  if (!idToken) return "unavailable";

  const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
  if (error) throw error;
  return "signed-in";
}
