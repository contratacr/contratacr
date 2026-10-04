"use client";
import { EMPLEOS_VISIBLE } from "@/lib/feature-flags";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { sinBarraDeAbajo } from "@/lib/rutas-sin-barra";
import { esServicioDelCatalogo } from "@/lib/data/categories";
import { esRutaDeBusqueda } from "@/lib/buscar-url";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Bell, MessageSquareText, Plus, Search, UserRound } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useNativeApp } from "@/hooks/use-native-app";
import { useAuth } from "@/hooks/use-auth";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
import { HojaDeCrear } from "@/components/mobile/hoja-de-crear";
import { useAvisosPorVer } from "@/hooks/use-avisos-por-ver";
import { useDirectMessageUnread } from "@/hooks/use-direct-message-unread";
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
  const mensajesPorLeer = useDirectMessageUnread(!!user);
  const isPro = canOffer(user);
  const { mode } = useMode(isPro);

  const navRef = useRef<HTMLElement>(null);
  const [pendingHref, setPendingHref] = useState<string | null>(null);
  const [asistenteAbierto, setAsistenteAbierto] = useState(false);
  const [hojaDeCrear, setHojaDeCrear] = useState(false);
  const [buscadorAbierto, setBuscadorAbierto] = useState(false);
  // La opción tocada se enciende EN EL ACTO; la dirección llega después.
  // Esperarla hacía parecer que el toque no había hecho nada.
  const [tocada, setTocada] = useState<{ indice: number; desde: string } | null>(null);
  useEffect(() => {
    const alCambiar = (event: Event) => setBuscadorAbierto(!!(event as CustomEvent<{ abierto?: boolean }>).detail?.abierto);
    window.addEventListener("ccr:buscador-nativo", alCambiar);
    return () => window.removeEventListener("ccr:buscador-nativo", alCambiar);
  }, []);
  // Si la pantalla nueva no llega (o era la misma), el toque anotado caduca.
  useEffect(() => {
    if (!tocada) return;
    const id = window.setTimeout(() => setTocada(null), 4000);
    return () => window.clearTimeout(id);
  }, [tocada]);
  const avisosPorVer = useAvisosPorVer(nativeApp);

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
  const nativePanelHref = user ? primaryPanelHref : `/login?redirect=${encodeURIComponent(rutaConIdioma(locale, panelHref))}`;

  // Publicar ocupa la pantalla entera: ahí la barra no va.
  // Pantalla completa o de detalle: sin barra (ver src/lib/rutas-sin-barra.ts).
  // SIN `hydrated`. `useNativeApp` se lee con `useSyncExternalStore`, así que
  // ya trae el valor bueno en el commit de hidratación; el `hydrated` extra
  // hacía que el PRIMER commit dijera «no visible» y el efecto de abajo BORRARA
  // la clase `ccr-native-bottom-nav-visible` que el servidor y el script de
  // arranque habían puesto. Esa clase gobierna el relleno inferior de `main` y
  // varias alturas: quitarla y reponerla un cuadro después es un salto de
  // maquetación en CADA arranque, además de la barra apareciendo de la nada.
  const visible = nativeApp && !sinBarraDeAbajo(pathname);

  // Solo una pestaña encendida a la vez: mientras hay una pendiente, manda esa.
  const isActive = useCallback(
    (href: string) => {
      // El asistente ya no es una pestaña: mientras cubre la pantalla no hay
      // ninguna encendida, porque ninguna es el lugar donde estás.
      if (asistenteAbierto) return false;
      const base = href.split("?")[0] ?? href;
      if (pendingHref) return pendingHref === href;
      // El panel es UN solo lugar. Esta rama distinguía la pestaña de
      // Cotizaciones de la del panel porque las dos vivían en la barra; ahora
      // Cotizaciones está en el menú, así que estar en el panel —en la pestaña
      // que sea— enciende el panel.
      if (base === panelHref) return (pathname ?? "").startsWith(panelHref);
      // /profesionales/construccion/alajuela sigue siendo Profesionales; un perfil no.
      if (base === "/profesionales") return esRutaDeBusqueda(pathname, esServicioDelCatalogo);
      return pathname === base;
    },
    [asistenteAbierto, pathname, pendingHref],
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

  // Precarga de las pestañas UNA sola vez por sesión y escalonada (antes era en
  // cada navegación, las cinco a la vez: con sesión son renders pesados y el
  // siguiente toque del usuario esperaba detrás de ellos).
  const precargadas = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!visible) return;
    const destinos = ["/", ...(EMPLEOS_VISIBLE ? ["/empleos"] : []), "/proyectos", "/promociones", primaryPanelHref].filter((d) => !precargadas.current.has(d));
    const ids = destinos.map((destino, i) => window.setTimeout(() => { precargadas.current.add(destino); router.prefetch(destino); }, 1500 + i * 400));
    return () => ids.forEach((id) => window.clearTimeout(id));
  }, [pathname, primaryPanelHref, router, visible]);

  const irA = useCallback(
    (event: React.MouseEvent<HTMLAnchorElement>, href: string) => {
      if (!nativeApp) return;
      event.preventDefault();
      event.stopPropagation();
      // Con el asistente encima, la pestaña primero lo aparta.
      if (asistenteAbierto) window.dispatchEvent(new Event("contratacr:close-ai"));
      const [base, consulta = ""] = href.split("?");
      // PROFESIONALES ABRE EL BUSCADOR, no la página: Servicio y ubicación con
      // Recientes y Los más buscados, el teclado arriba, en el acto y sin pedir
      // nada al servidor. La búsqueda se carga cuando se elige qué buscar. Si
      // en esta pantalla no hay buscador que lo atienda, se va a la página.
      if (base === "/profesionales") {
        const pedido = new CustomEvent("ccr:open-native-search", { detail: { atendido: false } });
        window.dispatchEvent(pedido);
        if (pedido.detail.atendido) return;
      }
      setTocada({ indice: base === "/profesionales" ? 0 : base === "/notificaciones" ? 3 : 4, desde: pathname ?? "" });
      if (pathname === base || (base === "/profesionales" && esRutaDeBusqueda(pathname, esServicioDelCatalogo))) {
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
  // De capa (antes de pintar): con useEffect la pantalla nueva se pintaba UN
  // cuadro con lo de la anterior (barra de abajo, cabecera) y luego cambiaba.
  useLayoutEffect(() => {
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

  // De capa (antes de pintar): con useEffect la pantalla nueva se pintaba UN
  // cuadro con lo de la anterior (barra de abajo, cabecera) y luego cambiaba.
  useLayoutEffect(() => {
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
  const permiteRetirarse = /^\/(?:promociones|empleos|proyectos)?\/?$/.test(pathname ?? "/") || esRutaDeBusqueda(pathname, esServicioDelCatalogo);

  const [escondida, setEscondida] = useState(false);
  useEffect(() => {
    if (!permiteRetirarse) { setEscondida(false); return; }
    const posiciones = new WeakMap<Element, number>();
    // Solo avisa a React cuando CAMBIA: en cada evento de desplazamiento volvía a pedir render.
    let ultima: boolean | null = null;
    const poner = (v: boolean) => { if (v !== ultima) { ultima = v; setEscondida(v); } };
    const alDesplazar = (event: Event) => {
      const objetivo = event.target;
      if (!(objetivo instanceof Element) || !objetivo.matches("main, .ccr-tablero-marco > section, .ccr-tablero-ficha, [data-messages-page-main], .ccr-direct-chat-list, .ccr-direct-chat-thread-scroll, .ccr-search-bottom-sheet, .ccr-search-bottom-sheet *")) return;
      const actual = objetivo.scrollTop;
      const previa = posiciones.get(objetivo) ?? actual;
      posiciones.set(objetivo, actual);
      if (actual < 48) { poner(false); return; }
      // Al llegar al fondo, iOS estira la lista y la devuelve sola. Ese regreso
      // se leía como "va subiendo" y sacaba la barra sin que nadie deslizara.
      // En el borde —y más allá, mientras dura el rebote— no se decide nada;
      // se vuelve a decidir en cuanto la lista se despega del final.
      const maximo = objetivo.scrollHeight - objetivo.clientHeight;
      if (maximo > 0 && actual >= maximo - 2) return;
      const delta = actual - previa;
      if (delta > 8) poner(true);
      else if (delta < -8) poner(false);
    };
    window.addEventListener("scroll", alDesplazar, { capture: true, passive: true });
    return () => window.removeEventListener("scroll", alDesplazar, { capture: true });
  }, [permiteRetirarse, pathname]); // con la pantalla nueva vuelve a empezar (la barra se muestra)

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

  // CUÁL ESTÁ ENCENDIDA, para que la pastilla de fondo viaje hasta ella. El «+»
  // no se enciende nunca: abre una hoja encima, no es un lugar.
  const enBusqueda = esRutaDeBusqueda(pathname, esServicioDelCatalogo);
  // Lo tocado manda solo mientras la dirección no ha cambiado todavía.
  const tocadaVigente = tocada && tocada.desde === (pathname ?? "") ? tocada.indice : null;
  const indice = asistenteAbierto ? -1
    : hojaDeCrear ? -1
    : tocadaVigente ?? (buscadorAbierto ? 0
    : enBusqueda ? 0
    : isActive("/mensajes") ? 1
    : isActive("/notificaciones") ? 3
    : user && isActive(nativePanelHref) ? 4
    : -1);

  const celda = (activa: boolean) => cn(
    "relative z-10 grid h-full min-w-0 flex-1 basis-0 place-items-center rounded-full text-[#1A2744] transition-colors duration-200 ccr-toque-barra",
    activa && "text-[#009FD9]",
  );
  const trazo = (activa: boolean) => (activa ? 2.4 : 2);

  return (
    <>
    <nav
      ref={navRef}
      aria-label={tNav("aria")}
      className={cn(
        // FLOTANTE, como la de Facebook: una pastilla despegada de los bordes,
        // translúcida y con desenfoque, así lo que se desplaza debajo se ve
        // pasar a través de ella.
        "ccr-native-bottom-nav ccr-barra-flotante pointer-events-none fixed inset-x-0 bottom-0 z-[90] px-4 transition-transform duration-300 ease-[cubic-bezier(0.22,1,0.36,1)] lg:hidden",
        escondida && "translate-y-[calc(100%+1rem)]",
      )}
    >
      <div
        className="ccr-barra-flotante-pastilla pointer-events-auto relative mx-auto flex h-[44px] w-full max-w-[420px] items-stretch rounded-full p-1"
        // Al tocar cualquier opción la barra entera «late», como la de
        // Facebook: crece apenas y vuelve con un rebote. Con la API de
        // animaciones se reinicia en cada toque, aunque se toque seguido.
        // En la fase de CAPTURA y al apoyar el dedo: los enlaces cortan el
        // clic (stopPropagation) y con onClick el brinco nunca llegaba.
        onPointerDownCapture={(event) => {
          event.currentTarget.animate(
            [
              { transform: "translateZ(0) scale(1)" },
              { transform: "translateZ(0) scale(1.07)", offset: 0.35 },
              { transform: "translateZ(0) scale(0.99)", offset: 0.7 },
              { transform: "translateZ(0) scale(1)" },
            ],
            { duration: 420, easing: "ease-out" },
          );
        }}
      >
        {/* La pastilla de la pestaña encendida VIAJA de una a otra. */}
        <span
          aria-hidden
          // Pastilla FIJA (56×34) centrada bajo el ícono, igual en las cinco
          // opciones: estirada a lo ancho de la celda era un óvalo que en la
          // primera y la última tocaba el borde de la barra.
          className="absolute top-1/2 h-[34px] w-14 -translate-y-1/2 rounded-full bg-[#009FD9]/12 transition-[left,opacity] duration-[380ms] ease-[cubic-bezier(0.22,1,0.36,1)]"
          style={{ left: `calc(0.25rem + (100% - 0.5rem) / 5 * ${Math.max(indice, 0)} + ((100% - 0.5rem) / 5 - 3.5rem) / 2)`, opacity: indice < 0 ? 0 : 1 }}
        />

        <Link href="/profesionales" prefetch={false} aria-label={tNav("searchAria")} onClick={(event) => irA(event, "/profesionales")} className={celda(indice === 0)}>
          <Search className="h-6 w-6" strokeWidth={trazo(indice === 0)} />
        </Link>

        {/* MENSAJES en lugar del asistente (1-oct-2026): es lo que más se usa
            después de buscar. El asistente pasó al menú de la cabecera. */}
        <Link
          href={user ? "/mensajes" : "/login?redirect=%2Fmensajes"}
          prefetch={!!user}
          aria-label={tNav("messages")}
          onClick={(event) => { if (user) irA(event, "/mensajes"); }}
          className={celda(indice === 1)}
        >
          <span className="relative">
            <MessageSquareText className="h-6 w-6" strokeWidth={trazo(indice === 1)} />
            {mensajesPorLeer > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {mensajesPorLeer > 9 ? "9+" : mensajesPorLeer}
              </span>
            )}
          </span>
        </Link>

        <button type="button" aria-label={tNav("create")} aria-haspopup="dialog" onClick={() => { window.dispatchEvent(new Event("ccr:close-native-search")); setHojaDeCrear(true); }} className="relative z-10 grid h-full min-w-0 flex-1 basis-0 place-items-center ccr-toque-barra">
          {/* Del MISMO tamaño que los demás íconos (24 px), solo en celeste
              (4-oct-2026, decisión de Isaac). */}
          <span className="grid h-[30px] w-[30px] place-items-center rounded-full bg-[#009FD9] text-white">
            <Plus className="h-5 w-5" strokeWidth={2.8} />
          </span>
        </button>

        {/* Sin sesión la campana pide entrar (y luego abre Notificaciones), igual
            que el ícono de mensajes: abrirla decía «No tienes notificaciones»,
            como si ya hubiera una cuenta. */}
        <Link
          href={user ? "/notificaciones" : "/login?redirect=%2Fnotificaciones"}
          prefetch={!!user}
          aria-label={tNav("notifications")}
          onClick={(event) => { if (user) irA(event, "/notificaciones"); }}
          className={celda(indice === 3)}
        >
          <span className="relative">
            <Bell className="h-6 w-6" strokeWidth={trazo(indice === 3)} />
            {avisosPorVer > 0 && (
              <span className="absolute -right-2 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
                {avisosPorVer > 9 ? "9+" : avisosPorVer}
              </span>
            )}
          </span>
        </Link>

        {user ? (
          <Link href={nativePanelHref} prefetch={true} aria-label={tNav("panel")} onClick={(event) => irA(event, nativePanelHref)} className={celda(indice === 4)}>
            {avatarUrl ? (
              // El aro de «activa» va POR DENTRO del borde de la foto: por fuera
              // la agrandaba y el resaltado se veía distinto al de las demás.
              <span className="relative block h-7 w-7">
                {/* eslint-disable-next-line @next/next/no-img-element -- avatar pequeño de tamaño fijo; el optimizador no actúa en Cloudflare */}
                <img src={avatarUrl} alt="" className="h-7 w-7 max-w-none rounded-full object-cover" />
                <span aria-hidden className={cn("pointer-events-none absolute inset-0 rounded-full ring-inset", indice === 4 ? "ring-2 ring-[#009FD9]" : "ring-1 ring-[#d5dfe9]")} />
              </span>
            ) : (
              <UserRound className="h-6 w-6" strokeWidth={trazo(indice === 4)} />
            )}
          </Link>
        ) : (
          <Link href="/login" aria-label={t("login")} className={celda(false)}>
            <UserRound className="h-6 w-6" strokeWidth={2} />
          </Link>
        )}
      </div>
    </nav>
    <HojaDeCrear abierta={hojaDeCrear} onCerrar={() => setHojaDeCrear(false)} esProfesional={isPro} avatarUrl={avatarUrl} />
    </>
  );
}
