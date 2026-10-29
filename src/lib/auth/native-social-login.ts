import { ANDROID_OAUTH_RETURN_ORIGIN, ANDROID_OAUTH_RETURN_PATH, readAndroidOAuthReturn } from "@/lib/auth/android-oauth-return";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { withPromiseTimeout } from "@/lib/promise-timeout";
import { reportClientError } from "@/lib/report-client-error";

// Google and iOS Apple exchange native ID tokens directly with Supabase.
// Android Apple uses the existing web provider in a secure browser sheet;
// its PKCE code returns through the app link in newer Android builds.
// Provider failures never silently fall back to a separate browser session.
// Google uses the web client trusted by Supabase plus its platform clients.

export type NativeSocialProvider = "apple" | "google";
export type NativeSocialOutcome = "signed-in" | "cancelled" | "unavailable";

const GOOGLE_WEB_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;
const GOOGLE_IOS_CLIENT_ID = process.env.NEXT_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const APPLE_SERVICES_ID = process.env.NEXT_PUBLIC_APPLE_SERVICES_ID;
const APPLE_REDIRECT_URL = process.env.NEXT_PUBLIC_APPLE_REDIRECT_URL;

let initialization: Promise<boolean> | null = null;
let initializationFailure = "unknown";

// Only fixed diagnostic categories leave the device, never provider tokens or
// arbitrary error text. This explains a fallback that otherwise exists only in
// the phone's console.
function failureCategory(error: unknown) {
  const message = String((error as { message?: string })?.message ?? error).toLowerCase();
  if (/native-initialize-timeout/.test(message)) return "native-timeout";
  if (/url scheme|urlscheme/.test(message)) return "url-scheme";
  if (/no credential|no credentials/.test(message)) return "no-credentials";
  if (/developer console|sha.?1|oauth.*config/.test(message)) return "provider-configuration";
  if (/disabled|not available|not implemented|unimplemented/.test(message)) return "plugin-unavailable";
  if (/client.?id|configuration|not initialized/.test(message)) return "provider-configuration";
  if (/network|fetch|chunk|load.*module/.test(message)) return "network-or-bundle";
  return "unknown";
}

function reportFallback(provider: NativeSocialProvider, operation: string, stage: string, reason = "unknown") {
  reportClientError("window", { message: `native-social-fallback:${operation}:${provider}:${stage}:${reason}` });
}

function failNative(provider: NativeSocialProvider, operation: string, stage: string, reason: string): never {
  initialization = null; // A recreated Android activity may have lost its provider registry.
  reportFallback(provider, operation, stage, reason);
  throw new Error("native-social-unavailable");
}

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
      await withPromiseTimeout(SocialLogin.initialize({
        ...(GOOGLE_WEB_CLIENT_ID
          ? { google: { webClientId: GOOGLE_WEB_CLIENT_ID, iOSClientId: GOOGLE_IOS_CLIENT_ID || undefined, mode: "online" as const } }
          : {}),
        ...(appleConfigured
          ? { apple: { clientId: APPLE_SERVICES_ID || undefined, redirectUrl: APPLE_REDIRECT_URL || undefined } }
          : {}),
      }), 10_000, "native-initialize-timeout");
      return true;
    })().catch((error) => {
      initializationFailure = failureCategory(error);
      console.warn("[native-auth] plugin initialization failed:", initializationFailure);
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

// Apple on Android uses the Apple provider already configured in Supabase.
// Its browser sheet hands a PKCE code back through an OS-verified app link;
// the original WebView alone has the verifier needed to establish its session.
async function androidAppleOperation(supabase: SupabaseClient, operation: "sign-in" | "link") {
  // Play build 14 has no VIEW/BROWSABLE filter (verified in the signed APK).
  // Its native manifest cannot be repaired by deploying JavaScript.
  const { App } = await import("@capacitor/app");
  const { build } = await App.getInfo();
  if (!/^\d+$/.test(build) || Number(build) <= 14) throw new Error("native-apple-update-required");
  if (window.location.origin !== ANDROID_OAUTH_RETURN_ORIGIN) throw new Error("Android OAuth requires the production app origin");
  const account = operation === "link" ? await supabase.auth.getUser() : null;
  if (account && (account.error || !account.data.user)) throw new Error("Sign in before linking an identity.");
  const state = randomNonce();
  const redirectTo = `${ANDROID_OAUTH_RETURN_ORIGIN}/auth/callback?flow=android-apple&native_state=${state}&locale=${window.location.pathname.startsWith("/en") ? "en" : "es"}`;
  const options = { redirectTo, skipBrowserRedirect: true };
  const started = operation === "link"
    ? await supabase.auth.linkIdentity({ provider: "apple", options })
    : await supabase.auth.signInWithOAuth({ provider: "apple", options });
  if (started.error || !started.data?.url) throw started.error ?? new Error("Missing OAuth URL");
  const { SocialLogin } = await loadPlugin();
  let response;
  try {
    response = await SocialLogin.openSecureWindow({ authEndpoint: started.data.url, redirectUri: `${ANDROID_OAUTH_RETURN_ORIGIN}${ANDROID_OAUTH_RETURN_PATH}` });
  } catch (error) {
    if (isCancellation(error)) return "cancelled" as const;
    throw error;
  }
  const code = readAndroidOAuthReturn(response.redirectedUri, state);
  if (account) {
    const current = await supabase.auth.getUser();
    if (current.error || current.data.user?.id !== account.data.user?.id) throw new Error("The account changed while connecting Apple.");
  }
  const exchanged = await supabase.auth.exchangeCodeForSession(code);
  if (exchanged.error || !exchanged.data.session) throw exchanged.error ?? new Error("Missing native session");
  if (account && exchanged.data.user?.id !== account.data.user?.id) {
    await supabase.auth.signOut();
    throw new Error("The linked account did not match.");
  }
  return "completed" as const;
}

async function nativeSocialOperation(
  provider: NativeSocialProvider,
  supabase: SupabaseClient,
  operation: "sign-in" | "link",
): Promise<"completed" | "cancelled" | "unavailable"> {
  if (!isNativeAppRuntime()) return "unavailable";

  let platform: string;
  try {
    ({ platform } = await loadPlugin());
  } catch (error) {
    return failNative(provider, operation, "load-plugin", failureCategory(error));
  }
  if (platform === "android" && provider === "apple") {
    try { return await androidAppleOperation(supabase, operation); }
    catch (error) {
      if ((error as Error)?.message === "native-apple-update-required") {
        reportFallback(provider, operation, "android-capability", "native-update-required");
        throw error;
      }
      if (isCancellation(error)) return "cancelled";
      return failNative(provider, operation, "android-pkce", failureCategory(error));
    }
  }
  if (platform === "web" || !isConfigured(provider, platform)) {
    return failNative(provider, operation, "configuration", platform === "web" ? "native-bridge-missing" : `${platform}-client-missing`);
  }
  if (!(await ensureInitialized())) {
    return failNative(provider, operation, "initialize", initializationFailure);
  }

  // Linking must always preserve the authenticated account. Never substitute a
  // regular sign-in, which could switch accounts or create another profile.
  let accountId: string | undefined;
  if (operation === "link") {
    const { data, error } = await supabase.auth.getUser();
    if (error || !data.user) throw error ?? new Error("Sign in before linking an identity.");
    accountId = data.user.id;
  }

  const { SocialLogin } = await loadPlugin();
  // The provider receives the hashed nonce and signs it into the id token;
  // Supabase gets the raw one and checks that the hashes match. Google gets no
  // extra scopes: the default OIDC id token already carries email and profile,
  // and the Android plugin refuses scopes without a patched MainActivity.
  const nonce = randomNonce();
  const hashedNonce = await sha256Hex(nonce);

  // GOOGLE REUSA EL TOKEN ANTERIOR. Si en este teléfono ya se entró con Google,
  // el plugin de iOS «restaura» esa sesión y devuelve el token VIEJO, firmado
  // con el nonce de aquella vez: Supabase lo rechaza con «Nonces mismatch»
  // (Isaac, 9-oct-2026, al entrar, salir y volver a entrar). Cerrando antes la
  // sesión del plugin, Google firma un token nuevo con este nonce. Apple pide
  // siempre uno nuevo y no lo necesita.
  if (provider === "google" && platform === "ios") {
    try {
      await SocialLogin.logout({ provider: "google" });
    } catch {
      // Sin sesión previa no hay nada que cerrar.
    }
  }

  const openProvider = () => provider === "apple"
    ? SocialLogin.login({ provider: "apple", options: { scopes: ["email", "name"], nonce: hashedNonce } })
    : SocialLogin.login({ provider: "google", options: { nonce: hashedNonce, ...(platform === "android" ? { style: "standard" as const } : {}) } });
  let idToken: string | null | undefined;
  try {
    let response;
    try {
      response = await openProvider();
    } catch (error) {
      // Older Android binaries can return this when the chooser adds or
      // reauthenticates an account. Recover once inside Credential Manager;
      // never retry a cancellation or a Google Cloud configuration failure.
      const message = String((error as { message?: string })?.message ?? error);
      if (provider !== "google" || platform !== "android" || !/account.?reauth.?failed/i.test(message)) throw error;
      await SocialLogin.logout({ provider: "google" });
      response = await openProvider();
    }
    idToken = (response.result as { idToken?: string | null }).idToken;
  } catch (error) {
    if (isCancellation(error)) return "cancelled";
    // Never escape into browser OAuth: its cookies belong to another session.
    return failNative(provider, operation, "provider-sheet", failureCategory(error));
  }
  if (!idToken) {
    return failNative(provider, operation, "provider-sheet", "missing-id-token");
  }

  if (operation === "link") {
    // The provider sheet may remain open while the app session changes.
    const current = await supabase.auth.getUser();
    if (current.error || current.data.user?.id !== accountId) {
      throw current.error ?? new Error("The account changed while connecting the provider.");
    }
    const { error } = await supabase.auth.linkIdentity({ provider, token: idToken, nonce });
    if (error) throw error;
  } else {
    const { error } = await supabase.auth.signInWithIdToken({ provider, token: idToken, nonce });
    if (error) throw error;
  }
  return "completed";
}

export async function nativeSocialSignIn(
  provider: NativeSocialProvider,
  supabase: SupabaseClient,
): Promise<NativeSocialOutcome> {
  const outcome = await nativeSocialOperation(provider, supabase, "sign-in");
  return outcome === "completed" ? "signed-in" : outcome;
}

export async function nativeSocialLink(
  provider: NativeSocialProvider,
  supabase: SupabaseClient,
): Promise<"linked" | "cancelled" | "unavailable"> {
  const outcome = await nativeSocialOperation(provider, supabase, "link");
  return outcome === "completed" ? "linked" : outcome;
}
