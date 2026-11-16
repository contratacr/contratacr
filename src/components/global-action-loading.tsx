"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { MARCA_CERRANDO_SESION } from "@/lib/auth/sign-out";

export function GlobalActionLoading() {
  const [signingOut, setSigningOut] = useState(false);
  const t = useTranslations("loading");

  useEffect(() => {
    const showSigningOut = () => setSigningOut(true);
    window.addEventListener("contratacr:signing-out", showSigningOut);
    // Se llega desde un cierre de sesión: el mismo aviso sigue hasta que la
    // portada terminó de cargar, en vez de un círculo suelto en medio.
    let marca = false;
    try { marca = window.sessionStorage.getItem(MARCA_CERRANDO_SESION) === "1"; window.sessionStorage.removeItem(MARCA_CERRANDO_SESION); } catch { /* sin almacenamiento */ }
    let quitar: number | undefined;
    const alCargar = () => { quitar = window.setTimeout(() => setSigningOut(false), 150); };
    if (marca) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- aviso que viene de la página anterior
      setSigningOut(true);
      if (document.readyState === "complete") alCargar();
      else window.addEventListener("load", alCargar, { once: true });
    }
    return () => {
      window.removeEventListener("contratacr:signing-out", showSigningOut);
      window.removeEventListener("load", alCargar);
      if (quitar) window.clearTimeout(quitar);
    };
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
