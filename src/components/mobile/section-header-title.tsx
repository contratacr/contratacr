"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";
import { useNativeApp } from "@/hooks/use-native-app";

// Destinos personales de la app (Mensajes, Notificaciones, Soporte, Ayuda…):
// la barra dice dónde estás y ofrece volver, en vez de repetir la marca. En la
// web esas mismas páginas conservan el navbar del sitio.
export function SectionHeaderTitle({
  title,
  fallbackHref = "/",
  raiz = false,
  menu = false,
}: {
  title: string;
  fallbackHref?: string;
  // Acción general de la pantalla, a la derecha de la barra.
  menu?: boolean;
  // Índice propio (Mensajes): ☰ + marca + nombre, como Ofertas y Empleos.
  raiz?: boolean;
}) {
  const nativeApp = useNativeApp();
  const router = useRouter();

  useEffect(() => {
    if (!nativeApp) return;
    const global = window as unknown as {
      __ccrSectionHeader?: string | null;
      __ccrSectionActive?: boolean;
      __ccrSectionRoot?: boolean;
      __ccrSectionShare?: boolean;
      __ccrSectionMenu?: boolean;
    };
    global.__ccrSectionHeader = title;
    global.__ccrSectionActive = true;
    global.__ccrSectionRoot = raiz;
    global.__ccrSectionShare = false;
    global.__ccrSectionMenu = menu;
    window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: { title, root: raiz, menu } }));
    return () => {
      global.__ccrSectionHeader = null;
      global.__ccrSectionActive = false;
      global.__ccrSectionRoot = false;
      global.__ccrSectionMenu = false;
      window.dispatchEvent(new CustomEvent("ccr:section-header", { detail: null }));
    };
  }, [menu, nativeApp, raiz, title]);

  useEffect(() => {
    if (!nativeApp) return;
    const volver = () => {
      if (window.history.length > 1) router.back();
      else router.push(fallbackHref);
    };
    window.addEventListener("ccr:section-back", volver);
    return () => window.removeEventListener("ccr:section-back", volver);
  }, [fallbackHref, nativeApp, router]);

  return null;
}
