export const LAST_SIGN_IN_COOKIE = "ccr_last_sign_in";
export type SignInMethod = "email" | "google" | "apple";
export function signInMethod(value: unknown): SignInMethod | null {
  return value === "email" || value === "google" || value === "apple" ? value : null;
}
export function rememberSignIn(method: SignInMethod) {
  if (typeof document === "undefined") return;
  document.cookie = `${LAST_SIGN_IN_COOKIE}=${method}; Path=/; Max-Age=7776000; SameSite=Lax${location.protocol === "https:" ? "; Secure" : ""}`;
}
export function readLastSignIn(): SignInMethod | null {
  if (typeof document === "undefined") return null;
  return signInMethod(document.cookie.split("; ").find((part) => part.startsWith(`${LAST_SIGN_IN_COOKIE}=`))?.split("=")[1]);
}
