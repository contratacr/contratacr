"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";

export function GlobalActionLoading() {
  const [signingOut, setSigningOut] = useState(false);
  const t = useTranslations("loading");

  useEffect(() => {
    const showSigningOut = () => setSigningOut(true);
    window.addEventListener("contratacr:signing-out", showSigningOut);
    return () => window.removeEventListener("contratacr:signing-out", showSigningOut);
  }, []);

  if (!signingOut) return null;

  return (
    <div className="fixed inset-0 z-[250] grid place-items-center bg-white/95 px-6 backdrop-blur-sm" role="status" aria-live="assertive" aria-busy="true">
      <div className="flex flex-col items-center gap-3 text-center">
        <Loader2 className="h-7 w-7 animate-spin text-[#009FD9]" aria-hidden />
        <p className="text-sm font-extrabold text-[#162543]">{t("signingOut")}</p>
      </div>
    </div>
  );
}
