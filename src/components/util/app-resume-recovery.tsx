"use client";

import { useEffect } from "react";
import { prefijoDeIdioma } from "@/lib/prefijo-de-idioma";
import { useRouter } from "next/navigation";
import { installAppResumeRecovery } from "@/lib/app-resume-recovery";

export function AppResumeRecovery() {
  const router = useRouter();

  useEffect(() => {
    const path = window.location.pathname;
    const locale = path.startsWith("/en") ? "en" : "es";
    const localeRoot = path === `${prefijoDeIdioma(locale) || "/"}` || path === `${prefijoDeIdioma(locale)}/`;
    const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
    const searchParams = new URLSearchParams(window.location.search);
    const isRecoveryHash =
      hashParams.get("type") === "recovery";
    const hasAuthCode = localeRoot && !!searchParams.get("code");
    if (localeRoot && (searchParams.get("error") || hashParams.get("error"))) {
      const errorCode = searchParams.get("error_code") ?? hashParams.get("error_code");
      const expired = errorCode === "bad_oauth_state" || errorCode === "flow_state_expired";
      window.location.replace(`${prefijoDeIdioma(locale)}/login?autherror=${expired ? "oauth_expired" : "oauth_failed"}`);
      return;
    }

    if (localeRoot && isRecoveryHash) {
      window.location.replace(`${prefijoDeIdioma(locale)}/reset-password${window.location.hash}`);
      return;
    }

    if (hasAuthCode) {
      // A PKCE code is also used by Apple/Google. Only explicit recovery
      // links belong on the password page; otherwise exchange through OAuth.
      if (searchParams.get("type") === "recovery") {
        window.location.replace(`${prefijoDeIdioma(locale)}/reset-password${window.location.search}`);
      } else {
        searchParams.set("flow", "oauth");
        searchParams.set("locale", locale);
        window.location.replace(`/auth/callback?${searchParams.toString()}`);
      }
      return;
    }

    return installAppResumeRecovery(() => router.refresh());
  }, [router]);

  return null;
}
