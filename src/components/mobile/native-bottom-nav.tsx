"use client";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";

import { useCallback, useEffect, useRef, useState } from "react";
import { Search, Bot, Briefcase, UserRound, ReceiptText } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
import { OfferTagPercentIcon } from "@/components/icons/offer-tag-percent-icon";
import { cn } from "@/lib/utils";

// La barra vive en el armazón, montada una sola vez, y NO dentro de cada
// página: cuando se montaba con la página se desmontaba y volvía a montarse en
// cada navegación, y eso es lo que se veía como parpadeo. Ahora el contenido
// cambia debajo y la barra sigue ahí, quieta, como en Instagram o Facebook.
export function NativeBottomNav() {
  const nativeApp = useNativeApp();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const t = useTranslations("header");
  const tNav = useTranslations("bottomNav");
  const { user, avatarUrl } = useAuth();
  const isPro = canOffer(user);
  const { mode } = useMode(isPro);

  const [hydrated, setHydrated] = useState(false);
  useEffect(() => setHydrated(true), []);

  const navRef = useRef<HTMLElement>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);

  // El estado real de la ventana del asistente, anunciado por ella misma. El
  // marcado por "pendiente" se limpiaba con cualquier navegación de fondo y la
  // marca caía a la ruta de abajo (/buscar) con el asistente aún abierto.
  useEffect(() => {
    const alCambiar = (event: Event) => setAsistenteAbierto(Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open));
    const alCerrar = () => setAsistenteAbierto(false);
    window.addEventListener("contratacr:ai-open-changed", alCambiar);
    window.addEventListener("contratacr:close-ai", alCerrar);
    return () => {
      window.removeEventListener("contratacr:ai-open-changed", alCambiar);
      window.removeEventListener("contratacr:close-ai", alCerrar);
    };
  }, []);
  const pendingTimer = useRef<number | null>(null);

  const panelHref = "/dashboard/profesional";
  const primaryPanelHref = isPro && mode === "offer" ? `${panelHref}?mode=offer` : `${panelHref}?mode=use`;
  const nativePanelHref = user ? primaryPanelHref : `/login?redirect=${encodeURIComponent(`/${locale}${panelHref}`)}`;

  // Publicar ocupa la pantalla entera: ahí la barra no va.
  const fullscreenRoute = /(^|\/)(?:publicar-proyecto|(?:empleos|ofertas)\/publicar)(?:\/|$)/.test(pathname ?? "");
  const visible = hydrated && nativeApp && !fullscreenRoute;

  // Solo una pestaña encendida a la vez: mientras hay una pendiente, manda esa.
  const isActive = useCallback(
    (href: string) => {
      if (asistenteAbierto) return href === "assistant";
      const base = href.split("?")[0] ?? href;
      if (pendingHref) return pendingHref === href;
      if (base === panelHref) {
        const enPanel = (pathname ?? "").startsWith(panelHref);
        const esCotizaciones = href.includes("tab=quotes");
        const pestanaCotizaciones = searchParams.get("tab") === "quotes";
        return enPanel && (esCotizaciones ? pestanaCotizaciones : !pestanaCotizaciones);
      }
      return pathname === base;
    },
    [asistenteAbierto, pathname, pendingHref, searchParams],
  );

  const prepare = useCallback(
    (href: string) => {
      if (pendingTimer.current) window.clearTimeout(pendingTimer.current);
      setPendingHref(href);
      router.prefetch(href);
      pendingTimer.current = window.setTimeout(() => setPendingHref(null), 2500);
    },
    [router],
  );

  // Al llegar, se suelta el pendiente y manda la ruta real.
  useEffect(() => {
    const id = window.setTimeout(() => setPendingHref(null), 0);
    return () => window.clearTimeout(id);
  }, [pathname]);

  // La precarga completa caduca a los minutos; cada navegación la renueva para
  // las cinco pestañas. Así el toque siempre encuentra el contenido ya en
  // memoria y la pantalla de carga queda solo para el arranque en frío.
  useEffect(() => {
    if (!visible) return;
    const id = window.setTimeout(() => {
      for (const destino of ["/", "/buscar", "/ofertas", ...(EMPLEOS_VISIBLE ? ["/empleos"] : []), primaryPanelHref]) router.prefetch(destino);
    }, 800);
    return () => window.clearTimeout(id);
  }, [pathname, primaryPanelHref, router, visible]);

  const irA = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!nativeApp) return;
      event.preventDefault();
      event.stopPropagation();
      // Con el asistente encima, la pestaña primero lo aparta.
      if (asistenteAbierto) window.dispatchEvent(new Event("contratacr:close-ai"));
      const [base, consulta = ""] = href.split("?");
      if (pathname === base) {
        // Misma RUTA no siempre es el mismo lugar: las secciones del panel viven
        // en ?tab=, una búsqueda con resultados en ?q=, un listado filtrado en
        // sus propios parámetros. Todo eso está MÁS ADENTRO que la portada de la
        // pestaña, así que el toque devuelve ahí —como en cualquier app— y solo
        // sube al tope cuando ya se está en la portada.
        const objetivo = new URLSearchParams(consulta);
        const propios = new Set(objetivo.keys());
        const masAdentro = [...searchParams.keys()].some((clave) => !propios.has(clave));
        // Dos pestañas pueden compartir ruta (Panel y Cotizar): si la actual no
        // trae los parámetros de la que se tocó, hay que navegar, no subir.
        const yaAhi = [...objetivo.entries()].every(([clave, valor]) => searchParams.get(clave) === valor);
        if (masAdentro || !yaAhi) {
          prepare(href);
          router.push(href);
          return;
        }
        document.querySelector("main")?.scrollTo({ top: 0, behavior: "smooth" });
        window.scrollTo({ top: 0, behavior: "smooth" });
        return;
      }
      prepare(href);
      router.push(href);
    },
    [asistenteAbierto, nativeApp, pathname, prepare, router, searchParams],
  );

  // El alto real de la barra es lo que el contenido reserva por debajo.
  useEffect(() => {
    if (!visible || !navRef.current) return;
    const nav = navRef.current;
    const root = document.documentElement;
    const medir = () => root.style.setProperty("--ccr-native-bottom-nav-height", `${Math.ceil(nav.getBoundingClientRect().height)}px`);
    medir();
    const observer = new ResizeObserver(medir);
    observer.observe(nav);
    window.addEventListener("resize", medir);
    window.visualViewport?.addEventListener("resize", medir);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", medir);
      window.visualViewport?.removeEventListener("resize", medir);
      root.style.removeProperty("--ccr-native-bottom-nav-height");
    };
  }, [visible]);

  useEffect(() => {
    const roots = [document.documentElement, document.body];
    roots.forEach((root) => root.classList.toggle("ccr-native-bottom-nav-visible", visible));
    return () => roots.forEach((root) => root.classList.remove("ccr-native-bottom-nav-visible"));
  }, [visible]);

  // La barra real ya montó: se retira la franja provisional del arranque.
  useEffect(() => {
    if (!visible) return;
    document.documentElement.classList.add("ccr-nav-montada");
    return () => document.documentElement.classList.remove("ccr-nav-montada");
  }, [visible]);

  // Al desplazar hacia abajo la pastilla se retira; hacia arriba, vuelve. Así
  // solo ocupa pantalla cuando se la busca: quien baja está leyendo, quien
  // sube está por irse a otro lado. Con histéresis (8px) para que un dedo
  // tembloroso no la haga titilar, y siempre visible cerca del tope.
  // Retirarse al desplazar donde hay una lista larga que se recorre sin fin:
  // portada, Ofertas, Empleos y los resultados de /buscar. En Panel o Mensajes
  // la lista es corta y la barra yéndose y viniendo sería ruido.
  const permiteRetirarse = /^\/(?:ofertas|empleos|buscar)?\/?$/.test(pathname ?? "/");

  const [escondida, setEscondida] = useState(false);
  useEffect(() => {
    if (!permiteRetirarse) { setEscondida(false); return; }
    const posiciones = new WeakMap<Element, number>();
    const alDesplazar = (event: Event) => {
      const objetivo = event.target;
      if (!(objetivo instanceof Element) || !objetivo.matches("main, [data-messages-page-main], .ccr-direct-chat-list, .ccr-direct-chat-thread-scroll, .ccr-search-bottom-sheet, .ccr-search-bottom-sheet *")) return;
      const actual = objetivo.scrollTop;
      const previa = posiciones.get(objetivo) ?? actual;
      posiciones.set(objetivo, actual);
      if (actual < 48) { setEscondida(false); return; }
      // Al llegar al fondo, iOS estira la lista y la devuelve sola. Ese regreso
      // se leía como "va subiendo" y sacaba la barra sin que nadie deslizara.
      // En el borde —y más allá, mientras dura el rebote— no se decide nada;
      // se vuelve a decidir en cuanto la lista se despega del final.
      const maximo = objetivo.scrollHeight - objetivo.clientHeight;
      if (maximo > 0 && actual >= maximo - 2) return;
      const delta = actual - previa;
      if (delta > 8) setEscondida(true);
      else if (delta < -8) setEscondida(false);
    };
    window.addEventListener("scroll", alDesplazar, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", alDesplazar, { capture: true });
  }, [permiteRetirarse]);

  // Cambiar de sección la trae de vuelta: la pantalla nueva empieza arriba.
  useEffect(() => { setEscondida(false); }, [pathname]);

  // Mientras está retirada, el hueco que reservaba también se cierra: si no,
  // quedaba una franja vacía abajo con la barra ya invisible.
  useEffect(() => {
    const roots = [document.documentElement, document.body];
    const retirada = visible && escondida;
    roots.forEach((root) => root.classList.toggle("ccr-native-bottom-nav-hidden", retirada));
    return () => roots.forEach((root) => root.classList.remove("ccr-native-bottom-nav-hidden"));
  }, [escondida, visible]);

  if (!visible) return null;

  const itemClass = (href: string) =>
    cn(
      // Azul oscuro en reposo, turquesa al estar en esa sección: el mismo par de
      // colores que el menú lateral, para que las dos formas de navegar hablen
      // igual. El gris azulado de antes se leía apagado a 10px sobre blanco.
      // La celda ENTERA es el botón (así fallan menos los toques, como en las
      // barras nativas); al presionar se ilumina completa para que su tamaño
      // real se vea, en vez de responder desde un área invisible.
      "relative flex min-w-0 shrink-0 flex-col items-center justify-center gap-0.5 rounded-xl px-1 py-1 text-[10px] font-semibold leading-tight text-[#1A2744] transition-colors active:bg-[#eef5f9] active:text-[#009FD9] min-[360px]:text-[11px]",
      isActive(href) && "font-bold text-[#009FD9]",
    );

  // La línea vive en el borde superior del elemento, pegada al filo de la
  // barra, como el subrayado de LinkedIn.
  const marca = (href: string) =>
    isActive(href) ? <span aria-hidden className="absolute inset-x-1 -top-1 h-[3px] rounded-b-full bg-[#009FD9]" /> : null;

  // El rótulo se encoge lo justo para que quepa el más largo («Cotizaciones»):
  // truncado se leía «Cotizacion…», que no dice nada.
  const rotulo = (texto: string) => (
    <span className="max-w-full truncate" style={{ fontSize: "clamp(9px, 2.55vw, 11px)" }}>{texto}</span>
  );

  const etiquetas = {
    buscar: tNav("search"),
    ofertas: tNav("deals"),
    asistente: tNav("assistant"),
    empleos: tNav("jobs"),
    cotizaciones: tNav("quotes"),
  };
  // Quien tiene cuenta profesional cotiza desde la barra SIEMPRE, también con el
  // panel puesto en cliente: la barra de abajo es de la cuenta, no del panel que
  // esté abierto, y ver la opción aparecer y desaparecer al cambiar de panel
  // hacía dudar de dónde estaban las cotizaciones. El Asistente queda para las
  // cuentas que solo son de cliente (al profesional le vive en el menú lateral).
  const cotizacionesHref = `${panelHref}?mode=offer&tab=quotes`;
  const conCotizaciones = isPro;

  return (
    <nav
      ref={navRef}
      aria-label={tNav("aria")}
      className={cn(
        "ccr-native-bottom-nav lg:hidden fixed inset-x-0 bottom-0 z-[90] px-1.5 transition-transform duration-200 ease-out min-[360px]:px-2",
        escondida && "pointer-events-none translate-y-full",
      )}
    >
      {/* Huecos iguales, no celdas iguales: con celdas del mismo ancho, un rótulo
          largo («Cotizaciones») deja menos aire a los lados que uno corto, y la
          fila se ve despareja aunque las celdas midan lo mismo. El sobrante se
          reparte alrededor de cada opción, así que las de los extremos también
          tienen aire por fuera y su marca de toque no queda pegada al filo. */}
      <div className="mx-auto flex w-full max-w-[520px] items-stretch justify-around px-0">
        <Link
          href="/buscar"
          prefetch={true}
          aria-label={etiquetas.buscar}
          onClick={(event) => irA(event, "/buscar")}
          className={itemClass("/buscar")}
        >
          {marca("/buscar")}
          <Search className="h-5 w-5" strokeWidth={isActive("/buscar") ? 2.4 : 2} />
          {rotulo(etiquetas.buscar)}
        </Link>

        <Link
          href="/ofertas"
          prefetch={true}
          aria-label={etiquetas.ofertas}
          onClick={(event) => irA(event, "/ofertas")}
          className={itemClass("/ofertas")}
        >
          {marca("/ofertas")}
          <OfferTagPercentIcon className="h-5 w-5" strokeWidth={isActive("/ofertas") ? 2.4 : 2} />
          {rotulo(etiquetas.ofertas)}
        </Link>

        {conCotizaciones ? (
          <Link
            href={cotizacionesHref}
            prefetch={true}
            aria-label={etiquetas.cotizaciones}
            onClick={(event) => irA(event, cotizacionesHref)}
            className={itemClass(cotizacionesHref)}
          >
            {marca(cotizacionesHref)}
            <ReceiptText className="h-5 w-5" strokeWidth={isActive(cotizacionesHref) ? 2.4 : 2} />
            {rotulo(etiquetas.cotizaciones)}
          </Link>
        ) : (
          <button
            type="button"
            aria-label={etiquetas.asistente}
            onClick={() => window.dispatchEvent(new Event("contratacr:open-ai"))}
            className={itemClass("assistant")}
          >
            {marca("assistant")}
            <Bot className="h-5 w-5" strokeWidth={isActive("assistant") ? 2.4 : 2} />
            {rotulo(etiquetas.asistente)}
          </button>
        )}

        {EMPLEOS_VISIBLE && (
          <Link
            href="/empleos"
            prefetch={true}
            aria-label={etiquetas.empleos}
            onClick={(event) => irA(event, "/empleos")}
            className={itemClass("/empleos")}
          >
            {marca("/empleos")}
            <Briefcase className="h-5 w-5" strokeWidth={isActive("/empleos") ? 2.4 : 2} />
            {rotulo(etiquetas.empleos)}
          </Link>
        )}

        {user ? (
          <Link
            href={nativePanelHref}
            prefetch={true}
            aria-label="Panel"
            onClick={(event) => irA(event, nativePanelHref)}
            className={itemClass(nativePanelHref)}
          >
            {marca(nativePanelHref)}
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- avatar pequeño de tamaño fijo; el optimizador no actúa en Cloudflare
              <img
                src={avatarUrl}
                alt=""
                className={cn(
                  "h-5 w-5 max-w-none rounded-full object-cover",
                  isActive(nativePanelHref) ? "ring-2 ring-[#009FD9]" : "ring-1 ring-[#d5dfe9]",
                )}
              />
            ) : (
              <UserRound className="h-5 w-5" strokeWidth={isActive(nativePanelHref) ? 2.4 : 2} />
            )}
            {rotulo("Panel")}
          </Link>
        ) : (
          <Link
            href="/login"
            aria-label={t("login")}
            className={itemClass("acceso")}
          >
            {marca("acceso")}
            <UserRound className="h-5 w-5" strokeWidth={2} />
            {rotulo(t("login"))}
          </Link>
        )}
      </div>
    </nav>
  );
}
