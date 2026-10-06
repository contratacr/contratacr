"use client";

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { useNativeApp } from "@/hooks/use-native-app";
import { createPortal } from "react-dom";
import { useTranslations, useLocale } from "next-intl";
import { Bell, CheckCheck, Check, Trash2, AlertTriangle, MoreHorizontal } from "lucide-react";
import { useRouter } from "next/navigation";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";
import { createClient } from "@/lib/supabase/client";
import { useActorPhotos } from "@/lib/notifications/use-actor-photos";
import { useAuth } from "@/hooks/use-auth";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { notificationActionHref, notificationInMode } from "@/lib/notification-link";
import { localizedNotificationCopy } from "@/lib/localized-notification";
import { useMode } from "@/hooks/use-mode";
import { canOffer } from "@/lib/auth/capabilities";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";
import { getNotificationProjectCreatedAt, useNotificationProjectTimes } from "@/hooks/use-notification-project-times";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";
import { FilaDeslizable, iconoDeAccion } from "@/components/ui/fila-deslizable";
import { AppTooltip } from "@/components/ui/app-tooltip";
import { cacheNotifications, readCachedNotifications, uniqueNotifications } from "@/lib/notifications-cache";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: Record<string, unknown> & {
    link?: string;
    project_id?: string | null;
    project_created_at?: string | null;
    review_reason?: string | null;
  } | null;
};

// ONE consistent notification icon everywhere — the Bell, matching the panel-nav
// "Notificaciones" item + the navbar bell (sprint 500). Replaces the per-type icons:
// the kind of notification is already clear from its title/text, and a single shared
// icon reads as "this is your notifications", consistent across the app.

// LA FLECHA DE ATRÁS VUELVE A NOTIFICACIONES. Cada pantalla de destino decide
// su regreso con un parámetro propio —el panel `returnTo`, el chat `back`, las
// fichas `from`— y sin él caía en la lista general de su sección: se abría una
// promoción desde una notificación y la flecha llevaba a Promociones.
function conRegresoANotificaciones(href: string) {
  const ruta = href.replace(/^\/(?:es|en)(?=\/|$)/u, "");
  const clave = ruta.startsWith("/dashboard/") ? "returnTo"
    : ruta.startsWith("/mensajes") ? "back"
    : /^\/(?:promociones|empleos|proyectos|profesionales)\//u.test(ruta) ? "from"
    : null;
  if (!clave || new RegExp(`[?&]${clave}=`).test(href)) return href;
  const [base, ancla] = href.split("#");
  return `${base}${base.includes("?") ? "&" : "?"}${clave}=${encodeURIComponent("/notificaciones")}${ancla ? `#${ancla}` : ""}`;
}

// Shared notifications list. The standalone /notificaciones page shows the full
// account history; the legacy panel tab can still scope by the active mode.
export function NotificationsList({ scope = "mode", titulo }: { scope?: "mode" | "all"; /** Título DENTRO de la tarjeta (la página de Notificaciones). */ titulo?: string } = {}) {
  const nativeApp = useNativeApp();
  // El contador solo informaba; como filtro sirve para algo.
  const { user, loading: sesionCargando } = useAuth();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const router = useRouter();
  // Per-mode (Airbnb full switch): the panel tab shows ONLY the active mode's
  // notifications, matching the navbar bell.
  const { mode } = useMode(canOffer(user));
  // Keep the server render and the first browser render deterministic. Reading
  // the browser notification cache during render made the server show 0 unread while hydration
  // immediately showed the cached count, which triggered a full React re-render.
  // The mounted effect below restores the cache without a hydration mismatch.
  const [notificationState, setNotificationState] = useState<{
    userId: string | undefined;
    items: Notification[];
  }>({ userId: undefined, items: [] });
  const items = notificationState.userId === user?.id
    ? notificationState.items
    : [];
  const [busy, setBusy] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());
  const [globalMenuOpen, setGlobalMenuOpen] = useState(false);
  // De a 15, con «Ver notificaciones anteriores» al pie, como Facebook: con
  // las cien que se cargan de una vez la lista era una sábana sin final.
  const DE_A = 15;
  const [mostrando, setMostrando] = useState(DE_A);
  // Entrar a la pantalla es leerlas: el globo se limpia solo, como en Instagram.
  // COMO FACEBOOK: al entrar, todo queda leído EN EL SERVIDOR y la campana baja
  // a cero en el acto; pero los puntos azules se quedan en pantalla durante esta
  // visita, para que se vea qué era nuevo. En la siguiente ya salen leídas.
  // Antes se esperaba 1,5 s y el punto se borraba delante de la persona.
  const marcadoEnEstaVisita = useRef(false);
  // Se marca DESPUÉS de traer la lista: si no, el servidor ya la devolvía leída
  // y no quedaba ningún punto que mostrar.
  const [listaDelServidor, setListaDelServidor] = useState(false);
  const [nuevasDeEstaVisita, setNuevasDeEstaVisita] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (scope !== "all" || !user || !listaDelServidor || marcadoEnEstaVisita.current) return;
    marcadoEnEstaVisita.current = true;
    void markAllRead(true);
  });

  useEffect(() => {
    const abrir = () => setGlobalMenuOpen((abierto) => !abierto);
    window.addEventListener("ccr:section-menu", abrir);
    return () => window.removeEventListener("ccr:section-menu", abrir);
  }, []);
  const [itemMenuOpenId, setItemMenuOpenId] = useState<string | null>(null);
  // Deslizar hacia la izquierda, como en Mensajes: un poco muestra «Eliminar»;
  // pasado el punto, el botón cubre la fila y soltar la borra. Borrar sin
  // querer se arregla con «Deshacer» (ver borrarPorDeslizar).
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  const borradoPendiente = useRef<{ quitada: Notification; indice: number; temporizador: number } | null>(null);
  const [puedeDeshacer, setPuedeDeshacer] = useState(false);
  // Salir de la pantalla con un borrado pendiente lo confirma: quien deslizó
  // quería borrarla.
  useEffect(() => () => {
    const pendiente = borradoPendiente.current;
    if (!pendiente) return;
    window.clearTimeout(pendiente.temporizador);
    void createClient().from("notifications").delete().eq("id", pendiente.quitada.id)
      .then(() => window.dispatchEvent(new CustomEvent("notificationsChanged")));
  }, []);
  const [itemMenuPosition, setItemMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const globalMenuRef = useRef<HTMLDivElement | null>(null);
  const itemMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const itemMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const projectTimes = useNotificationProjectTimes(items);
  // Distinguir «no hay nada» de «no se pudo preguntar»: sin esto, un fallo de
  // red o una sesión vencida se leían como una bandeja vacía.
  const [errorDeCarga, setErrorDeCarga] = useState(false);

  const loadNotifications = useCallback(async () => {
    if (!user) return;
    const supabase = createClient();
    const pedir = () => supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      // Los mensajes del chat no son notificaciones, como en Facebook: tienen su
      // propio icono con su contador. La fila existe igual —es la que dispara el
      // push—, pero no se lista.
      .neq("type", "direct_message")
      .order("created_at", { ascending: false })
      .limit(100);

    let { data, error } = await pedir();
    // Una sesión vencida contesta sin datos y sin ruido: la pantalla decía «no
    // tienes notificaciones» cuando en realidad no había podido preguntar, y es
    // justo lo que se ve al abrir el app desde un aviso del teléfono. Se
    // renueva la sesión y se pregunta otra vez antes de dar nada por vacío.
    if (error) {
      const { data: sesion } = await supabase.auth.refreshSession();
      if (sesion?.session) ({ data, error } = await pedir());
    }
    if (error) {
      setErrorDeCarga(true);
      setBusy(false);
      return;
    }
    const next = uniqueNotifications(data ?? []);
    setErrorDeCarga(false);
    setNotificationState({ userId: user.id, items: next });
    cacheNotifications(user.id, next);
    setBusy(false);
    setListaDelServidor(true);
  }, [user]);

  useEffect(() => {
    const cached = readCachedNotifications(user?.id) as Notification[] | null;
    queueMicrotask(() => {
      setNotificationState({ userId: user?.id, items: cached ?? [] });
      // El caché guarda también la lista vacía, así que "no hay nada" (lista
      // vacía guardada) y "aún no se sabe" (sin entrada) sí se distinguen: solo
      // la segunda espera. Antes una cuenta sin notificaciones veía el esqueleto
      // en CADA entrada aunque acabara de salir.
      setBusy(sesionCargando || (!!user && cached === null));
    });
  }, [sesionCargando, user]);

  useEffect(() => {
    if (!user) return;
    // queueMicrotask: la carga escribe estado y hacerlo dentro del propio efecto
    // encadena renders (lo mismo que ya hace la siembra del caché de arriba).
    queueMicrotask(() => { void loadNotifications(); });
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;
    function onChanged() { loadNotifications(); }
    function onVisible() {
      if (document.visibilityState === "visible") loadNotifications();
    }
    window.addEventListener("notificationsChanged", onChanged);
    window.addEventListener("focus", onChanged);
    window.addEventListener("pageshow", onChanged);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("notificationsChanged", onChanged);
      window.removeEventListener("focus", onChanged);
      window.removeEventListener("pageshow", onChanged);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [user, loadNotifications]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-list-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        () => loadNotifications(),
      )
      .subscribe();
    return () => { void supabase.removeChannel(channel); };
  }, [instanceId, loadNotifications, user]);

  useEffect(() => {
    if (!globalMenuOpen && !itemMenuOpenId) return;
    function onPointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (globalMenuOpen && (globalMenuRef.current?.contains(target) || (target instanceof Element && target.closest("[data-menu-general-notificaciones]")))) return;
      // El disparador vive en la barra de la app, fuera de este contenedor: sin
      // esto el toque cerraba el menú y el propio botón lo reabría.
      if (target instanceof Element && target.closest("[data-ccr-section-menu]")) return;
      if (itemMenuOpenId && itemMenuRefs.current[itemMenuOpenId]?.contains(target)) return;
      if (itemMenuOpenId && itemMenuPortalRef.current?.contains(target)) return;
      setGlobalMenuOpen(false);
      setItemMenuOpenId(null);
      setItemMenuPosition(null);
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setGlobalMenuOpen(false);
        setItemMenuOpenId(null);
        setItemMenuPosition(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [globalMenuOpen, itemMenuOpenId]);

  useEffect(() => {
    if (!itemMenuOpenId) return;
    const closeDetachedMenu = () => {
      setItemMenuOpenId(null);
      setItemMenuPosition(null);
    };
    window.addEventListener("resize", closeDetachedMenu);
    return () => {
      window.removeEventListener("resize", closeDetachedMenu);
    };
  }, [itemMenuOpenId]);

  // Only the active mode's notifications are shown / acted on here.
  // Las que eran nuevas al entrar conservan su punto toda la visita, aunque ya
  // estén leídas en el servidor y la lista se recargue (ver markAllRead).
  const esNueva = (n: Notification) => !n.read || nuevasDeEstaVisita.has(n.id);
  const visible = scope === "all" ? items : items.filter((n) => notificationInMode(n.type, mode));
  // Mismo filtro que el panel de la campana: lo primero que uno quiere es ver
  // lo que no ha leído.
  const unread = visible.filter((n) => !n.read).length;
  // Como Facebook: primero todas las nuevas, luego las leídas por fecha. Si se
  // ordenara solo por fecha, los encabezados de grupo se repetirían.
  const ordenadas = [...visible].sort((a, b) => Number(!esNueva(a)) - Number(!esNueva(b)));
  const hasVisibleNotifications = visible.length > 0;
  const notificationTitle = (n: Notification) => localizedNotificationCopy(n, locale).title;
  const notificationMessage = (n: Notification) => localizedNotificationCopy(n, locale).message;
  // Agrupación por fecha: orienta cuando hay cien avisos seguidos.
  const fotoDe = useActorPhotos(items);

  const grupoDe = (n: Notification) => {
    if (esNueva(n)) return "newGroup" as const;
    const dia = 24 * 60 * 60 * 1000;
    const edad = Date.now() - new Date(n.created_at).getTime();
    if (edad < dia) return "todayGroup" as const;
    if (edad < 2 * dia) return "yesterdayGroup" as const;
    if (edad < 7 * dia) return "week7Group" as const;
    if (edad < 30 * dia) return "month30Group" as const;
    return "earlierGroup" as const;
  };

  const notificationTime = (n: Notification) => {
    const projectCreatedAt = getNotificationProjectCreatedAt(n, projectTimes);
    return projectCreatedAt
      ? t("publishedAt", { time: formatRelativeOrDate(projectCreatedAt, locale) })
      : formatRelativeOrDate(n.created_at, locale);
  };
  // Sin filtro «Todas / No leídas»: era una fila de pestañas que no decidía
  // nada. Lo no leído ya se distingue solo —la fila va resaltada, con su punto
  // azul, y las nuevas salen primero—, la lista es corta y está acotada al modo
  // activo, y para vaciarla ya está «Marcar todas como leídas». Filtrar a «no
  // leídas» dejaba además una lista que se vaciaba sola al ir leyendo.

  async function markAllRead(dejarPuntosEnPantalla = false) {
    if (!user) return;
    const supabase = createClient();
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    if (scope === "all") {
      // Toda la cuenta, no solo lo cargado: las no leídas más viejas que el
      // límite de la lista también cuentan en el globo.
      await supabase.from("notifications").update({ read: true }).eq("user_id", user.id).eq("read", false);
    } else {
      if (ids.length === 0) return;
      await supabase.from("notifications").update({ read: true }).in("id", ids);
    }
    const leidas = (lista: Notification[]) => lista.map((n) => (scope === "all" || ids.includes(n.id) ? { ...n, read: true } : n));
    if (dejarPuntosEnPantalla) {
      setNuevasDeEstaVisita(new Set(items.filter((n) => !n.read).map((n) => n.id)));
      // La memoria ya las guarda leídas (así vuelven la próxima vez); la
      // pantalla de ahora conserva sus puntos.
      cacheNotifications(user.id, leidas(items));
    } else {
      setNotificationState((prev) => {
        const next = leidas(prev.items);
        cacheNotifications(user.id, next);
        return { userId: user.id, items: next };
      });
    }
    // Con «todas» el total pasa a cero seguro: la barra de abajo lo recuerda
    // aunque no esté montada en esta pantalla.
    window.dispatchEvent(new CustomEvent("notificationsChanged", { detail: scope === "all" ? { sinLeer: 0, userId: user.id } : undefined }));
  }

  async function markOneRead(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItemMenuOpenId(null);
    setNotificationState((prev) => {
      const next = prev.items.map((n) => (n.id === id ? { ...n, read: true } : n));
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).eq("id", id);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  const role = user?.user_metadata?.role as string | undefined;

  function toggleItemMenu(event: React.MouseEvent<HTMLButtonElement>, item: Notification) {
    event.stopPropagation();
    setGlobalMenuOpen(false);
    if (itemMenuOpenId === item.id) {
      setItemMenuOpenId(null);
      setItemMenuPosition(null);
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const estimatedHeight = item.read ? 58 : 104;
    const top = window.innerHeight - rect.bottom >= estimatedHeight + 8
      ? rect.bottom + 6
      : Math.max(8, rect.top - estimatedHeight - 6);
    setItemMenuPosition({
      top,
      right: Math.max(8, window.innerWidth - rect.right),
    });
    setItemMenuOpenId(item.id);
  }

  function open(n: Notification) {
    const href = notificationActionHref(n, role, locale);
    if (!n.read) {
      setNotificationState((prev) => {
        const next = prev.items.map((item) => (item.id === n.id ? { ...item, read: true } : item));
        cacheNotifications(user?.id, next);
        return { userId: user?.id, items: next };
      });
      const supabase = createClient();
      supabase.from("notifications").update({ read: true }).eq("id", n.id).then(() => {
        window.dispatchEvent(new CustomEvent("notificationsChanged"));
      });
    }
    if (!href) return;
    router.push(conRegresoANotificaciones(href));
  }

  // BORRAR CON RED: la fila sale al instante, pero la base la borra a los
  // cinco segundos. Mientras tanto «Deshacer» la devuelve a su sitio. Un solo
  // borrado pendiente: si llega otro, el anterior se confirma ya.
  function borrarPorDeslizar(id: string) {
    const indice = items.findIndex((item) => item.id === id);
    if (indice < 0) return;
    confirmarBorradoPendiente();
    const quitada = items[indice];
    setNotificationState((prev) => {
      const next = prev.items.filter((item) => item.id !== id);
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const temporizador = window.setTimeout(() => confirmarBorradoPendiente(), 5000);
    borradoPendiente.current = { quitada, indice, temporizador };
    setPuedeDeshacer(true);
  }

  function confirmarBorradoPendiente() {
    const pendiente = borradoPendiente.current;
    if (!pendiente) return;
    borradoPendiente.current = null;
    window.clearTimeout(pendiente.temporizador);
    setPuedeDeshacer(false);
    void createClient().from("notifications").delete().eq("id", pendiente.quitada.id)
      .then(() => window.dispatchEvent(new CustomEvent("notificationsChanged")));
  }

  function deshacerBorrado() {
    const pendiente = borradoPendiente.current;
    if (!pendiente) return;
    borradoPendiente.current = null;
    window.clearTimeout(pendiente.temporizador);
    setPuedeDeshacer(false);
    setNotificationState((prev) => {
      const next = [...prev.items];
      next.splice(Math.min(pendiente.indice, next.length), 0, pendiente.quitada);
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
  }

  async function dismiss(e: React.MouseEvent, id: string) {
    e.stopPropagation();
    setItemMenuOpenId(null);
    setNotificationState((prev) => {
      const next = prev.items.filter((n) => n.id !== id);
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  async function doDeleteAll() {
    setConfirmDelete(false);
    setGlobalMenuOpen(false);
    if (!user || visible.length === 0) return;
    // Delete only the CURRENT mode's notifications (the list is per-mode).
    const ids = visible.map((n) => n.id);
    setNotificationState((prev) => {
      const next = prev.items.filter((n) => !ids.includes(n.id));
      cacheNotifications(user.id, next);
      return { userId: user.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").delete().in("id", ids);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  const headingTitle = locale === "en" ? "Notifications" : "Notificaciones";
  // Los tres estados —esqueleto, vacío y lista— miden lo mismo, que es lo que
  // mantiene el pie quieto. En la app la pantalla entera; en la web, la misma
  // tarjeta que cualquier otra sección.
  // EN COMPUTADORA TAMBIÉN LLENA LA PANTALLA. El pie de página solo existe de
  // 1024 px en adelante; con la tarjeta en 26rem fijos, durante el esqueleto el
  // pie quedaba a la vista (y=713 en una pantalla de 900) y, al llegar la
  // lista, salía disparado hacia abajo: CLS 0,118 en cada carga. Si el pie se
  // ve mientras carga, cualquier crecimiento del contenido es un salto; con la
  // tarjeta del alto de la pantalla el pie nace bajo el borde en los tres
  // estados, y la lista al crecer lo empuja fuera de la vista, no a la vista.
  // En el teléfono web no hay pie, así que ahí se queda la tarjeta normal.
  // Y EN EL TELÉFONO WEB TAMBIÉN LLEGA HASTA ABAJO. Eran 24rem fijos: con una
  // sola notificación quedaba un bloque de 384 px flotando en una pantalla de
  // 844 y debajo un vacío gris, que se lee como «esto se cortó». Con el alto
  // de la pantalla, una notificación o veinte se ven igual de terminadas.

  // En la web la tarjeta se estira para que una notificación no deje un vacío
  // gris debajo. En la APP no: ahí el área ya está fija entre el encabezado y
  // la barra, y estirar la lista pintaba de blanco todo lo que sobraba —una
  // franja que se leía como lista cortada—. La lista mide lo que mide y el
  // resto es el lienzo, como en Empleos o Buscar.
  const altoDeLaTarjeta = nativeApp
    ? "sm:min-h-[calc(100dvh-16rem)]"
    : "min-h-[calc(100dvh-9.5rem)] sm:min-h-[26rem] lg:min-h-[calc(100dvh-16rem)]";

  // El «...» general vive en la misma fila que «Nuevas», el primer rótulo de
  // la lista: suelto arriba quedaba a otra altura y parecía de otra cosa.

  const menuGeneral = hasVisibleNotifications ? (
        <div ref={globalMenuRef} data-menu-general-notificaciones="" className={cn("relative shrink-0", nativeApp && scope === "all" && "[&>button]:sr-only")}>
          <button
            type="button"
            aria-label={locale === "en" ? "Notification options" : "Opciones de notificaciones"}
            aria-haspopup="menu"
            aria-expanded={globalMenuOpen}
            onClick={() => {
              setItemMenuOpenId(null);
              setGlobalMenuOpen((open) => !open);
            }}
            className="inline-flex h-7 w-7 items-center justify-center rounded-full bg-[#f8fafc] text-[#162543] ring-1 ring-[#c9d8e4] transition-colors hover:bg-[#eef6fb]"
          >
            <MoreHorizontal className="h-4 w-4" strokeWidth={3} />
          </button>
          {globalMenuOpen && (
            <div role="menu" className={cn(
              // El mismo dibujo que el «···» de las tarjetas del panel: radio,
              // relleno y sombra. Aqui era rounded-2xl con shadow-xl y la letra
              // mas palida, asi que dos menus del mismo panel no se parecian.
              "min-w-[220px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]",
              nativeApp && scope === "all"
                ? "fixed right-3 top-[calc(var(--ccr-native-header-height,64px)+6px)] z-[240] shadow-xl"
                : "absolute right-0 top-full z-30 mt-1",
            )}>
              {unread > 0 && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setGlobalMenuOpen(false);
                    void markAllRead();
                  }}
                  className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] transition-colors hover:bg-[#f4f8fb]"
                >
                  <CheckCheck className="h-4 w-4 text-[#009FD9]" />
                  {t("markAllRead")}
                </button>
              )}
              {!nativeApp && (
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setGlobalMenuOpen(false);
                  setConfirmDelete(true);
                }}
                className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {t("deleteAll")}
              </button>
              )}
            </div>
          )}
        </div>
  ) : null;

  return (
    <div className="ccr-notifications-list flex h-full min-h-0 flex-col">
      {/* La cabecera va sobre el lienzo, sin caja propia: el título con su flecha
          de volver y, debajo, la tarjeta con la lista o el vacío. Es la misma
          forma de Mis ofertas o Soporte; antes esto era una pastilla blanca
          suelta encima de otra sábana blanca. */}
      {/* En el teléfono el nombre de la pantalla lo pone la barra de arriba
          —menú, marca y «Notificaciones», igual que en Ofertas—, así que esta
          cabecera es solo de computadora. En la app desaparece del todo. */}
      <div className={cn(
        "ccr-notifications-list-header mb-3 flex shrink-0 items-center justify-between gap-3",
        nativeApp && scope === "all" && "!m-0 !p-0 h-0 overflow-visible",
        // Con título dentro de la tarjeta, esta cabecera de afuera queda solo
        // para el lector de pantalla: dibujada eran dos «Notificaciones».
        titulo && !nativeApp && "sr-only",
      )}>
        {/* Sin «Todo al día»: el propio vacío ya dice que no hay nada, y una
            pastilla que solo aparece cuando no pasa nada no informa. */}
        <div className="min-w-0">
          {scope === "all" ? (
            // El nombre lo da la barra de arriba en el teléfono y en la app;
            // en computadora, donde la barra no lo dibuja, va aquí.
            <h1 className={cn("text-xl font-extrabold leading-tight text-[#162543] sm:text-2xl", nativeApp ? "sr-only" : "max-lg:sr-only")}>{headingTitle}</h1>
          ) : (
            <h3 className="text-lg font-extrabold leading-tight text-[#162543] sm:text-[1.15rem]">{headingTitle}</h3>
          )}
        </div>
      </div>

      {confirmDelete && (
        <div className="app-modal-screen app-centered-modal-screen fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setConfirmDelete(false)} />
          <div
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="delete-notifications-title"
            aria-describedby="delete-notifications-description"
            className="app-centered-modal relative z-10 max-h-[calc(var(--app-visual-viewport-height)-2rem)] w-full max-w-sm overflow-y-auto overscroll-contain rounded-2xl bg-white p-6 text-center shadow-2xl"
          >
            <BrandIconBadge icon={AlertTriangle} tone="danger" size={56} className="mx-auto mb-4" />
            <h3 id="delete-notifications-title" className="mb-1.5 text-lg font-bold text-[#162543]">{t("deleteAllConfirm")}</h3>
            <p id="delete-notifications-description" className="mb-5 text-sm text-[#6b7280]">{t("deleteAllBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors">{t("cancel")}</button>
              <button onClick={doDeleteAll} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors">{t("deleteAll")}</button>
            </div>
          </div>
        </div>
      )}
      <div className={cn(
        // En la app el fondo del área es el lienzo, no blanco: lo blanco llega
        // hasta donde llegan las notificaciones y lo que sobra se lee como
        // página —igual que en Empleos o Buscar—, en vez de como una franja
        // blanca vacía que parecía lista cortada.
        "ccr-notifications-scroll min-h-0 flex-1 overflow-hidden",
        nativeApp && scope === "all" ? "bg-[#f5f8fb]" : "bg-white",
        // En la app la lista va de borde a borde contra la barra de abajo; en la
        // web es una tarjeta como la de cualquier otra sección.
        // La tarjeta solo en computadora: en el teléfono (app o web) la lista va
        // de borde a borde, como en la app.
        scope === "all" && !nativeApp && "lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:shadow-sm",
      )}>
        {/* El título va DENTRO de la tarjeta, con el «···» en su renglón, como
            Facebook. Por debajo de 1024 px el título ya lo dice la barra de
            arriba, así que aquí solo aparece en computadora. */}
        {titulo && (
          <div className="hidden items-center justify-between gap-3 px-4 pb-1 pt-5 lg:flex">
            <p aria-hidden="true" className="text-[22px] font-extrabold leading-tight text-[#162543]">{titulo}</p>
            {menuGeneral}
          </div>
        )}
        {busy ? (
          <PanelListSkeleton
            rows={4}
            className={cn("p-4", scope === "all" ? altoDeLaTarjeta : "min-h-[16rem] sm:min-h-[18rem]")}
          />
        ) : errorDeCarga && visible.length === 0 ? (
          // No se pudo preguntar: decirlo, en vez de asegurar que no hay nada.
          <PanelEmptyState
            plano
            icon={AlertTriangle}
            title={t("loadErrorTitle")}
            description={t("loadErrorBody")}
            className={cn("px-5 py-12", scope === "all" ? altoDeLaTarjeta : "min-h-[16rem] sm:min-h-[18rem]")}
            action={(
              <button
                type="button"
                onClick={() => { setBusy(true); void loadNotifications(); }}
                className="inline-flex items-center justify-center rounded-full bg-[#009FD9] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]"
              >
                {t("loadErrorRetry")}
              </button>
            )}
          />
        ) : visible.length === 0 ? (
          <PanelEmptyState
            plano
            icon={Bell}
            title={t("noneList")}
            // Una cuenta que solo contrata no publica empleos ni promociones:
            // prometerle avisos de eso era listarle cosas que nunca le llegan.
            description={canOffer(user) ? t("emptySub") : t("emptySubClient")}
            className={cn("px-5 py-12", scope === "all" ? altoDeLaTarjeta : "min-h-[16rem] sm:min-h-[18rem]")}
          />
        ) : (
          // Misma altura mínima que el esqueleto y el vacío, y de una pantalla
          // entera: así el pie queda debajo del borde en los tres estados y
          // cuando la lista crece lo empuja fuera de la vista, no a la vista
          // (medido: saltos de 0,78 en teléfono y 0,49 en escritorio).
          <>
          <ul className={cn("ccr-notifications-items bg-white", scope === "all" ? altoDeLaTarjeta : "min-h-[16rem] sm:min-h-[18rem]")}>
            {ordenadas.slice(0, mostrando).map((n, indice) => {
              const grupo = grupoDe(n);
              const abreGrupo = indice === 0 || grupoDe(ordenadas[indice - 1]) !== grupo;
              const message = notificationMessage(n);
              // Cada aviso se lee COMPLETO: «Tarda menos de un…» cortaba la mitad
              // del mensaje y había que adivinar el resto.
              const canExpand = false;
              const expanded = expandedIds.has(n.id);
              return (
              <li
                key={n.id}
                data-unread={esNueva(n) ? "true" : undefined}
                // El borde de abajo se queda SIEMPRE, salvo en la última fila cuando la
                // lista llena la tarjeta (ahí el borde de la tarjeta ya cierra y
                // se verían dos líneas). Con una sola notificación la fila no toca
                // el fondo, así que sin borde quedaba abierta contra el vacío.
                // Sin línea entre filas, como Facebook: el icono y el aire de
                // cada fila ya las separan, y los rótulos (Hoy, Ayer…) agrupan.
                className="relative group"
              >
                {/* 9 px arriba y no 12: con el aire de la lista, el primer rótulo
                    (HOY, AYER) queda a 16 px del navbar, como abre toda pantalla. */}
                {abreGrupo && (
                  <div className="flex items-center justify-between gap-2 bg-white px-4 pb-1 pt-[9px]">
                    <p className="min-w-0 truncate text-[11px] font-extrabold uppercase tracking-wide text-[#8b95a5]">
                      {t(grupo)}
                    </p>
                    {indice === 0 && (titulo ? <div className="lg:hidden">{menuGeneral}</div> : menuGeneral)}
                  </div>
                )}
                {/* El botón vive con la fila, no con el encabezado del grupo. */}
                {/* Se desliza para borrar en el teléfono, app o web: el gesto es
                    solo del dedo y el mouse no lo activa. */}
                <FilaDeslizable
                  abierta={filaAbierta === n.id}
                  ancho={88}
                  onEstado={(abrir) => setFilaAbierta(abrir ? n.id : null)}
                  onCompletarDerecha={() => borrarPorDeslizar(n.id)}
                  acciones={(completando) => (
                    <button
                      type="button"
                      onClick={() => {
                        setFilaAbierta(null);
                        borrarPorDeslizar(n.id);
                      }}
                      aria-label={t("delete")}
                      className="relative flex-1 shrink-0 bg-[#dc2626] text-white"
                    >
                      <span className="absolute top-1/2 flex w-16 -translate-y-1/2 flex-col items-center gap-1" style={iconoDeAccion(completando, "left")}>
                        <Trash2 className="h-5 w-5" />
                        <span className="text-[11px] font-extrabold">{t("delete")}</span>
                      </span>
                    </button>
                  )}
                >
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => {
                    if (filaAbierta === n.id) {
                      setFilaAbierta(null);
                      return;
                    }
                    open(n);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === "Enter" || event.key === " ") {
                      event.preventDefault();
                      open(n);
                    }
                  }}
                  className={cn(
                    // Fondo propio: si fuera transparente, el botón rojo de
                    // borrar se vería por debajo sin haber deslizado.
                    // A la derecha solo el espacio del punto de «no leída»: el
                    // margen de 80 px dejaba un hueco y cortaba el texto antes.
                    "relative w-full border-b border-[#eef2f6] px-4 py-3 pr-10 text-left transition-colors lg:pr-20",
                    // Blanca siempre: lo no leído lo marca el punto azul de la
                    // derecha, como en Facebook. El fondo tintado se leía gris.
                    "bg-white",
                    notificationActionHref(n, role, locale) ? "cursor-pointer hover:bg-[#f9fafb]" : "cursor-default",
                  )}
                >
                  {/* Icono del tipo; lo no leído va con un punto azul a la derecha. */}
                  <div className="flex items-start gap-3">
                    <div className="relative shrink-0">
                      {fotoDe(n) ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura fija; el optimizador no actúa en Cloudflare
                        <img
                          src={fotoDe(n) as string}
                          alt=""
                          className="h-9 w-9 rounded-full object-cover"
                        />
                      ) : (
                        <span className="flex h-9 w-9 items-center justify-center rounded-full ccr-caja-icono-plana">
                          <NotificationSourceIcon type={n.type} className="h-4 w-4" />
                        </span>
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Una fila = un hecho: el mensaje manda y la hora va al
                          final. El título del tipo no distinguía nada y el icono
                          ya dice de qué se trata. */}
                      <p className={cn(
                        "whitespace-pre-line text-sm leading-snug [overflow-wrap:anywhere] break-words",
                        !esNueva(n) ? "font-medium text-[#374151]" : "font-semibold text-[#162543]",
                      )}>
                        {message || notificationTitle(n)}
                      </p>
                      <p className={cn("mt-0.5 text-[12px] font-semibold", !esNueva(n) ? "text-[#94a3b8]" : "text-[#0089bb]")}>
                        {notificationTime(n)}
                      </p>
                      {canExpand && (
                        <button
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            setExpandedIds((current) => {
                              const next = new Set(current);
                              if (next.has(n.id)) next.delete(n.id);
                              else next.add(n.id);
                              return next;
                            });
                          }}
                          className="mt-1 text-xs font-semibold text-[#009FD9] hover:underline"
                        >
                          {expanded
                            ? (locale === "en" ? "Show less" : "Ver menos")
                            : (locale === "en" ? "Show more" : "Ver más")}
                        </button>
                      )}
                    </div>
                  </div>
                  {esNueva(n) && (
                    <span
                      data-punto-no-leida=""
                      aria-label={locale === "en" ? "Unread" : "Sin leer"}
                      // EL «···» ES EL ÚLTIMO DE LA DERECHA y el punto va a su
                      // izquierda: el menú que desborda cierra siempre la fila,
                      // en la cabecera del sitio y aquí. Estaba al revés —el
                      // punto por fuera del «···»— y la fila terminaba en una
                      // marca de estado en vez de en un control.
                      // La posición la pone la regla del documento
                      // (data-ccr-notificaciones).
                      className="absolute top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full bg-[#009FD9]"
                    />
                  )}
                </div>
                {/* Two distinct actions, intentionally different icons so they're
                    never read as accept/reject: ✓ = mark as read, 🗑 = delete. */}
                <div
                  ref={(node) => {
                    itemMenuRefs.current[n.id] = node;
                  }}
                  data-menu-fila=""
                  data-abierto={itemMenuOpenId === n.id ? "" : undefined}
                  className={cn("absolute", nativeApp ? "hidden" : "max-lg:hidden")}
                >
                  <AppTooltip label={locale === "en" ? "Options" : "Opciones"}>
                    <button
                      type="button"
                      aria-label={locale === "en" ? "Options" : "Opciones"}
                      aria-haspopup="menu"
                      aria-expanded={itemMenuOpenId === n.id}
                      onClick={(event) => toggleItemMenu(event, n)}
                      // Círculo blanco con borde y sombra, como Facebook: sobre la
                      // fila resaltada al pasar el cursor, el «…» suelto casi no
                      // se veía.
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full border border-[#d6dde5] bg-white text-[#526277] shadow-[0_2px_6px_-2px_rgba(15,23,42,0.25)] transition-colors hover:bg-[#f3f6f9] hover:text-[#162543]"
                    >
                      <MoreHorizontal className="h-5 w-5" strokeWidth={2.5} />
                    </button>
                  </AppTooltip>
                  {itemMenuOpenId === n.id && itemMenuPosition && typeof document !== "undefined" && createPortal(
                    <div
                      ref={itemMenuPortalRef}
                      role="menu"
                      data-notification-item-menu
                      className="fixed z-[240] min-w-[190px] overflow-hidden rounded-xl border border-[#e5e7eb] bg-white p-1.5 shadow-[0_18px_45px_-22px_rgba(15,23,42,0.55)]"
                      style={{ top: itemMenuPosition.top, right: itemMenuPosition.right }}
                    >
                      {!n.read && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => void markOneRead(event, n.id)}
                          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-[#162543] transition-colors hover:bg-[#f4f8fb]"
                        >
                          <Check className="h-4 w-4 text-[#15803d]" />
                          {t("markRead")}
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(event) => void dismiss(event, n.id)}
                        className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-bold text-red-700 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("delete")}
                      </button>
                    </div>,
                    document.body,
                  )}
                </div>
                </FilaDeslizable>
              </li>
              );
            })}
          </ul>
          {ordenadas.length > mostrando && (
            // Dentro del bloque blanco de la lista, como su última fila: sobre
            // el fondo gris se leía como algo aparte, fuera del contenedor.
            // Con margen de sobra abajo: pegado al final de la lista, en el
            // iPhone la barra flotante le tapaba las esquinas de abajo.
            <div className="bg-white px-4 pb-6 pt-3 sm:px-5">
              <button
                type="button"
                data-ver-anteriores=""
                onClick={() => setMostrando((n) => n + DE_A)}
                className="h-11 w-full rounded-xl bg-[#eef2f6] text-sm font-bold text-[#162543] transition-colors hover:bg-[#e3e9ef]"
              >
                {locale === "en" ? "See earlier notifications" : "Ver notificaciones anteriores"}
              </button>
            </div>
          )}
          </>
        )}
      </div>
      {puedeDeshacer && createPortal(
        <div
          className="fixed inset-x-0 z-[1100] flex justify-center px-4"
          style={{ bottom: "calc(var(--ccr-native-live-bottom-nav-height, 0px) + 12px)" }}
          role="status"
        >
          <div className="flex w-full max-w-sm items-center justify-between gap-3 rounded-2xl bg-[#162543] py-2.5 pl-4 pr-2 text-[14px] font-semibold text-white shadow-[0_16px_36px_-18px_rgba(15,23,42,0.8)]">
            <span>{t("deletedToast")}</span>
            <button type="button" onClick={deshacerBorrado} className="rounded-xl px-3 py-1.5 text-[14px] font-extrabold text-[#7fd6f5] active:bg-white/10">
              {t("undo")}
            </button>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
