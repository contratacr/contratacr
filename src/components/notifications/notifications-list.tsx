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

// Shared notifications list. The standalone /notificaciones page shows the full
// account history; the legacy panel tab can still scope by the active mode.
export function NotificationsList({ scope = "mode" }: { scope?: "mode" | "all" } = {}) {
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
  // Entrar a la pantalla es leerlas: el globo se limpia solo, como en Instagram.
  // El punto azul dura lo que dura la visita, que es cuando sirve.
  useEffect(() => {
    if (!nativeApp || scope !== "all" || unread === 0) return;
    const marcar = window.setTimeout(() => { void markAllRead(); }, 1500);
    return () => window.clearTimeout(marcar);
  });

  useEffect(() => {
    const abrir = () => setGlobalMenuOpen((abierto) => !abierto);
    window.addEventListener("ccr:section-menu", abrir);
    return () => window.removeEventListener("ccr:section-menu", abrir);
  }, []);
  const [itemMenuOpenId, setItemMenuOpenId] = useState<string | null>(null);
  // Deslizar revela el botón de borrar (como Mail): nunca borra por el gesto,
  // que sería irreversible sin querer.
  const ANCHO_BORRAR = 88;
  const arrastreRef = useRef<{ id: string; x: number; y: number; base: number; horizontal: boolean } | null>(null);
  const [arrastre, setArrastre] = useState<{ id: string; dx: number } | null>(null);
  const [filaAbierta, setFilaAbierta] = useState<string | null>(null);
  const desplazamientoDe = (id: string) =>
    arrastre?.id === id ? arrastre.dx : filaAbierta === id ? -ANCHO_BORRAR : 0;
  const [itemMenuPosition, setItemMenuPosition] = useState<{ top: number; right: number } | null>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");
  const globalMenuRef = useRef<HTMLDivElement | null>(null);
  const itemMenuRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const itemMenuPortalRef = useRef<HTMLDivElement | null>(null);
  const projectTimes = useNotificationProjectTimes(items);

  const loadNotifications = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100)
      .then(({ data }) => {
        const next = uniqueNotifications(data ?? []);
        setNotificationState({ userId: user.id, items: next });
        cacheNotifications(user.id, next);
        setBusy(false);
      }, () => {
        // Keep any cached result visible if the refresh fails.
        setBusy(false);
      });
  }, [user]);

  useEffect(() => {
    const cached = readCachedNotifications(user?.id) as Notification[] | null;
    queueMicrotask(() => {
      setNotificationState({ userId: user?.id, items: cached ?? [] });
      setBusy(sesionCargando || (!!user && cached === null));
    });
  }, [sesionCargando, user]);

  useEffect(() => {
    if (!user) return;
    loadNotifications();
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
      if (globalMenuOpen && globalMenuRef.current?.contains(target)) return;
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
  const visible = scope === "all" ? items : items.filter((n) => notificationInMode(n.type, mode));
  const unread = visible.filter((n) => !n.read).length;
  // Como Facebook: primero todas las nuevas, luego las leídas por fecha. Si se
  // ordenara solo por fecha, los encabezados de grupo se repetirían.
  const ordenadas = [...visible].sort((a, b) => Number(a.read) - Number(b.read));
  const hasVisibleNotifications = visible.length > 0;
  const notificationTitle = (n: Notification) => localizedNotificationCopy(n, locale).title;
  const notificationMessage = (n: Notification) => localizedNotificationCopy(n, locale).message;
  // Agrupación por fecha: orienta cuando hay cien avisos seguidos.
  const fotoDe = useActorPhotos(items);

  const grupoDe = (n: Notification) => {
    if (!n.read) return "newGroup" as const;
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
  // NO "todas / no leídas" filter (sprint 516): it added a tab row of clutter without
  // real value — unread is already conveyed by the row highlight + dot + "Marcar todas
  // como leídas", the list is mode-scoped + short, and each title makes its type obvious.

  async function markAllRead() {
    if (!user) return;
    const ids = visible.filter((n) => !n.read).map((n) => n.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    setNotificationState((prev) => {
      const next = prev.items.map((n) => (ids.includes(n.id) ? { ...n, read: true } : n));
      cacheNotifications(user.id, next);
      return { userId: user.id, items: next };
    });
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
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
    const destino =
      href.includes("/dashboard/") && !href.includes("returnTo=")
        ? `${href}${href.includes("?") ? "&" : "?"}returnTo=${encodeURIComponent("/notificaciones")}`
        : href;
    router.push(destino);
  }

  async function borrarPorDeslizar(id: string) {
    setNotificationState((prev) => {
      const next = prev.items.filter((item) => item.id !== id);
      cacheNotifications(user?.id, next);
      return { userId: user?.id, items: next };
    });
    const supabase = createClient();
    await supabase.from("notifications").delete().eq("id", id);
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
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

  return (
    <div className="ccr-notifications-list flex h-full min-h-0 flex-col">
      <div className={cn("ccr-notifications-list-header mb-3 flex shrink-0 items-center justify-between gap-3 rounded-2xl bg-white px-1 py-1 sm:px-0 sm:py-0", nativeApp && scope === "all" && "!m-0 !p-0 h-0 overflow-visible")}>
        <div className="min-w-0">
          {scope === "all" ? (
            // En la app el nombre lo da la barra: repetirlo aquí sobra.
            <h1 className={cn("text-xl font-extrabold leading-tight text-[#162543] sm:text-2xl", nativeApp && "sr-only")}>{headingTitle}</h1>
          ) : (
            <h3 className="text-lg font-extrabold leading-tight text-[#162543] sm:text-[1.15rem]">{headingTitle}</h3>
          )}
          {unread === 0 && (
            <p className={cn(
              "mt-1 inline-flex w-fit items-center rounded-full bg-[#eef6fb] px-2.5 py-1 text-xs font-extrabold text-[#526277]",
              nativeApp && scope === "all" && "sr-only",
            )}>
              {locale === "en" ? "All caught up" : "Todo al día"}
            </p>
          )}
        </div>
        {hasVisibleNotifications && (
        <div ref={globalMenuRef} className={cn("relative shrink-0", nativeApp && scope === "all" && "[&>button]:sr-only")}>
          <button
            type="button"
            aria-label={locale === "en" ? "Notification options" : "Opciones de notificaciones"}
            aria-haspopup="menu"
            aria-expanded={globalMenuOpen}
            onClick={() => {
              setItemMenuOpenId(null);
              setGlobalMenuOpen((open) => !open);
            }}
            className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[#f8fafc] text-[#162543] ring-1 ring-[#c9d8e4] transition-colors hover:bg-[#eef6fb]"
          >
            <MoreHorizontal className="h-5 w-5" strokeWidth={3} />
          </button>
          {globalMenuOpen && (
            <div role="menu" className={cn(
              "min-w-[220px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white py-1.5 shadow-xl",
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
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f9fafb]"
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
                className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" />
                {t("deleteAll")}
              </button>
              )}
            </div>
          )}
        </div>
        )}
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
            <h3 id="delete-notifications-title" className="mb-1.5 text-lg font-bold text-[#111827]">{t("deleteAllConfirm")}</h3>
            <p id="delete-notifications-description" className="mb-5 text-sm text-[#6b7280]">{t("deleteAllBody")}</p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmDelete(false)} className="flex-1 rounded-xl border border-[#e5e7eb] px-4 py-2.5 text-sm font-semibold text-[#374151] hover:bg-[#f9fafb] transition-colors">{t("cancel")}</button>
              <button onClick={doDeleteAll} className="flex-1 rounded-xl bg-red-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-red-600 transition-colors">{t("deleteAll")}</button>
            </div>
          </div>
        </div>
      )}
      <div className="ccr-notifications-scroll min-h-0 flex-1 bg-white overflow-hidden">
        {busy ? (
          <PanelListSkeleton
            rows={4}
            hasData={visible.length > 0}
            className={scope === "all" ? "min-h-[calc(100dvh-13rem)] p-4 sm:min-h-[18rem]" : "min-h-[16rem] p-4 sm:min-h-[18rem]"}
          />
        ) : visible.length === 0 ? (
          <PanelEmptyState
            icon={Bell}
            title={t("noneList")}
            description={t("emptySub")}
            className={cn(
              "px-5 py-12",
              scope === "all"
                ? "min-h-[calc(100dvh-13rem)] sm:min-h-[18rem]"
                : "min-h-[16rem] sm:min-h-[18rem]",
            )}
          />
        ) : (
          <ul className="ccr-notifications-items">
            {ordenadas.map((n, indice) => {
              const grupo = grupoDe(n);
              const abreGrupo = indice === 0 || grupoDe(ordenadas[indice - 1]) !== grupo;
              const message = notificationMessage(n);
              const canExpand = message.length > 180;
              const expanded = expandedIds.has(n.id);
              return (
              <li
                key={n.id}
                className={cn("relative group border-b border-[#f3f4f6] last:border-0", !n.read && "bg-[#f3f9fd]")}
                onTouchStart={(event) => {
                  if (!nativeApp) return;
                  arrastreRef.current = {
                    id: n.id,
                    x: event.touches[0].clientX,
                    y: event.touches[0].clientY,
                    base: filaAbierta === n.id ? -ANCHO_BORRAR : 0,
                    horizontal: false,
                  };
                }}
                onTouchMove={(event) => {
                  const inicio = arrastreRef.current;
                  if (!inicio || inicio.id !== n.id) return;
                  const recorridoX = event.touches[0].clientX - inicio.x;
                  const recorridoY = event.touches[0].clientY - inicio.y;
                  if (!inicio.horizontal) {
                    if (Math.abs(recorridoY) > 10 && Math.abs(recorridoY) > Math.abs(recorridoX)) {
                      arrastreRef.current = null;
                      return;
                    }
                    if (Math.abs(recorridoX) < 12) return;
                    inicio.horizontal = true;
                  }
                  const dx = Math.max(-ANCHO_BORRAR - 24, Math.min(0, inicio.base + recorridoX));
                  setArrastre({ id: n.id, dx });
                }}
                onTouchEnd={() => {
                  const movido = arrastre?.id === n.id ? arrastre.dx : desplazamientoDe(n.id);
                  arrastreRef.current = null;
                  setArrastre(null);
                  // Pasada la mitad se queda abierta; si no, vuelve a su sitio.
                  setFilaAbierta(movido < -ANCHO_BORRAR / 2 ? n.id : null);
                }}
              >
                {abreGrupo && (
                  <p className="bg-white px-4 pb-1 pt-3 text-[11px] font-extrabold uppercase tracking-wide text-[#8b95a5]">
                    {t(grupo)}
                  </p>
                )}
                {/* El botón vive con la fila, no con el encabezado del grupo. */}
                <div className="relative overflow-hidden">
                {nativeApp && (
                  <button
                    type="button"
                    onClick={() => {
                      setFilaAbierta(null);
                      void borrarPorDeslizar(n.id);
                    }}
                    aria-label={t("delete")}
                    className="absolute inset-y-0 right-0 grid w-[88px] place-items-center bg-[#dc2626] text-white"
                  >
                    <Trash2 className="h-5 w-5" />
                  </button>
                )}
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
                    "relative w-full px-4 py-3 pr-16 text-left transition-colors",
                    n.read ? "bg-white" : "bg-[#f3f9fd]",
                    notificationActionHref(n, role, locale) ? "cursor-pointer hover:bg-[#f9fafb]" : "cursor-default",
                    arrastre?.id === n.id ? "transition-none" : "transition-transform duration-200",
                  )}
                  style={{ transform: `translateX(${desplazamientoDe(n.id)}px)` }}
                >
                  {/* Per-type leading icon (grey circle) + a brand-blue unread dot at its corner. */}
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
                        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[#EBF5FB] text-[#0089bb]">
                          <NotificationSourceIcon type={n.type} className="h-4 w-4" />
                        </span>
                      )}
                      {!n.read && <span className="absolute -top-0.5 -right-0.5 h-2.5 w-2.5 rounded-full bg-[#009FD9] ring-2 ring-white" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      {/* Una fila = un hecho: el mensaje manda y la hora va al
                          final. El título del tipo no distinguía nada y el icono
                          ya dice de qué se trata. */}
                      <p className={cn(
                        "whitespace-pre-line text-sm leading-snug [overflow-wrap:anywhere] break-words",
                        !expanded && "line-clamp-3",
                        n.read ? "font-medium text-[#374151]" : "font-semibold text-[#162543]",
                      )}>
                        {message || notificationTitle(n)}
                        <span className="ml-1.5 whitespace-nowrap text-xs font-medium text-[#9ca3af]">· {notificationTime(n)}</span>
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
                </div>
                {/* Two distinct actions, intentionally different icons so they're
                    never read as accept/reject: ✓ = mark as read, 🗑 = delete. */}
                <div
                  ref={(node) => {
                    itemMenuRefs.current[n.id] = node;
                  }}
                  className={cn("absolute top-2.5 right-2.5", nativeApp && "hidden")}
                >
                  <AppTooltip label={locale === "en" ? "Notification options" : "Opciones"}>
                    <button
                      type="button"
                      aria-label={locale === "en" ? "Notification options" : "Opciones"}
                      aria-haspopup="menu"
                      aria-expanded={itemMenuOpenId === n.id}
                      onClick={(event) => toggleItemMenu(event, n)}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-[#526277] transition-colors hover:bg-black/5 hover:text-[#162543]"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                  </AppTooltip>
                  {itemMenuOpenId === n.id && itemMenuPosition && typeof document !== "undefined" && createPortal(
                    <div
                      ref={itemMenuPortalRef}
                      role="menu"
                      data-notification-item-menu
                      className="fixed z-[240] min-w-[190px] overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white py-1.5 shadow-xl"
                      style={{ top: itemMenuPosition.top, right: itemMenuPosition.right }}
                    >
                      {!n.read && (
                        <button
                          type="button"
                          role="menuitem"
                          onClick={(event) => void markOneRead(event, n.id)}
                          className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-[#374151] transition-colors hover:bg-[#f9fafb]"
                        >
                          <Check className="h-4 w-4 text-[#15803d]" />
                          {t("markRead")}
                        </button>
                      )}
                      <button
                        type="button"
                        role="menuitem"
                        onClick={(event) => void dismiss(event, n.id)}
                        className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-semibold text-red-600 transition-colors hover:bg-red-50"
                      >
                        <Trash2 className="h-4 w-4" />
                        {t("delete")}
                      </button>
                    </div>,
                    document.body,
                  )}
                </div>
                </div>
              </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
