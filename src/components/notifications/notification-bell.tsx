"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { Bell, ArrowRight, CheckCheck } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { notificationActionHref, notificationInMode } from "@/lib/notification-link";
import { localizedNotificationCopy } from "@/lib/localized-notification";
import { cacheNotifications, readCachedNotifications, uniqueNotifications } from "@/lib/notifications-cache";
import { NotificationSourceIcon } from "@/components/notifications/notification-source-icon";
import { useActorPhotos } from "@/lib/notifications/use-actor-photos";
import { cn, formatRelativeOrDate } from "@/lib/utils";
import { useNativeApp } from "@/hooks/use-native-app";

type Notification = {
  id: string;
  type: string;
  title: string;
  message: string;
  read: boolean;
  created_at: string;
  data?: Record<string, unknown> | null;
};

export function NotificationBell({ scope = "all" }: { scope?: "all" | "use" | "offer" }) {
  const { user, notificationUnread } = useAuth();
  const router = useRouter();
  const t = useTranslations("notifications");
  const locale = useLocale();
  const [notificationState, setNotificationState] = useState(() => ({
    userId: user?.id,
    items: [] as Notification[],
  }));
  const [hasSyncedNotifications, setHasSyncedNotifications] = useState(false);
  // Conteo real de no leídas en el servidor: la lista local solo trae las 20 más
  // recientes y dejaba fuera las viejas sin leer, así el globo nunca bajaba.
  const [unreadTotal, setUnreadTotal] = useState<number | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const portalHost = typeof document === "undefined" ? null : document.body;
  const [posicionPanel, setPosicionPanel] = useState<{ top: number; right: number } | null>(null);
  const nativeApp = useNativeApp();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const menuPanelRef = useRef<HTMLDivElement | null>(null);
  const instanceId = useId().replace(/[^a-zA-Z0-9_-]/g, "");

  const notifications = useMemo(
    () => notificationState.userId === user?.id ? notificationState.items : readCachedNotifications(user?.id) ?? [],
    [notificationState, user?.id],
  );

  const updateNotifications = useCallback((updater: (prev: Notification[]) => Notification[]) => {
    setHasSyncedNotifications(true);
    setNotificationState((prev) => {
      const base = prev.userId === user?.id ? prev.items : readCachedNotifications(user?.id) ?? [];
      return { userId: user?.id, items: updater(base) };
    });
  }, [user?.id]);

  const visible = scope === "all" ? notifications : notifications.filter((n) => notificationInMode(n.type, scope));
  const cachedUnreadCount = visible.filter((n) => !n.read).length;
  const serverUnreadCount = scope === "offer"
    ? notificationUnread.offer + notificationUnread.neutral
    : scope === "use"
      ? notificationUnread.use + notificationUnread.neutral
      : notificationUnread.offer + notificationUnread.use + notificationUnread.neutral;
  // El conteo del servidor viene fijo en el primer render; una vez que la
  // campana sincronizó su propia lista, manda ella (si no, marcar leídas
  // dejaba el globo clavado en el número viejo hasta recargar la página).
  const unreadCount = scope === "all" && unreadTotal !== null
    ? unreadTotal
    : hasSyncedNotifications ? cachedUnreadCount : Math.max(cachedUnreadCount, serverUnreadCount);
  const previewItems = visible.slice(0, 6);
  const fotoDe = useActorPhotos(previewItems);

  const fetchNotifications = useCallback(() => {
    if (!user) return;
    const supabase = createClient();
    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        const next = uniqueNotifications(data ?? []);
        setNotificationState({ userId: user.id, items: next });
        cacheNotifications(user.id, next);
        setHasSyncedNotifications(true);
      });
    void supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("read", false)
      .then(({ count, error }) => {
        if (!error && typeof count === "number") setUnreadTotal(count);
      });
  }, [user]);

  useEffect(() => {
    queueMicrotask(() => {
      const cached = readCachedNotifications(user?.id);
      setNotificationState({ userId: user?.id, items: cached ?? [] });
      setHasSyncedNotifications(cached !== null);
    });
  }, [user?.id]);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  // Solo se escribe el caché tras una sincronización real y para el usuario
  // correcto. En el montaje este efecto corría con el estado inicial (vacío)
  // ANTES de que la siembra leyera el caché bueno, y lo pisaba con []: la
  // lista entonces creía saber que no había nada y el vacío destellaba medio
  // segundo hasta que llegaba la consulta.
  useEffect(() => {
    if (!hasSyncedNotifications || !user?.id || notificationState.userId !== user.id) return;
    cacheNotifications(user.id, notifications);
  }, [hasSyncedNotifications, notificationState.userId, notifications, user?.id]);

  useEffect(() => {
    if (!user) return;
    const supabase = createClient();
    const channel = supabase
      .channel(`notifications-${user.id}-${instanceId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          updateNotifications((prev) => uniqueNotifications([payload.new as Notification, ...prev]));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const updated = payload.new as Notification;
          updateNotifications((prev) => prev.map((n) => (n.id === updated.id ? updated : n)));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .on(
        "postgres_changes",
        { event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },
        (payload) => {
          const deleted = payload.old as Pick<Notification, "id">;
          updateNotifications((prev) => prev.filter((n) => n.id !== deleted.id));
          window.dispatchEvent(new CustomEvent("notificationsChanged"));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [user, fetchNotifications, instanceId, updateNotifications]);

  useEffect(() => {
    function onChanged() { fetchNotifications(); }
    window.addEventListener("notificationsChanged", onChanged);
    return () => window.removeEventListener("notificationsChanged", onChanged);
  }, [fetchNotifications]);

  useEffect(() => {
    if (!menuOpen) return;
    function onPointerDown(event: PointerEvent) {
      const target = event.target as Node;
      if (menuRef.current?.contains(target) || menuPanelRef.current?.contains(target)) return;
      setMenuOpen(false);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [menuOpen]);

  const openNotifications = () => {
    setMenuOpen(false);
    router.push(`/${locale}/notificaciones`);
  };

  async function openNotification(item: Notification) {
    setMenuOpen(false);
    if (!item.read) {
      updateNotifications((prev) => prev.map((entry) => entry.id === item.id ? { ...entry, read: true } : entry));
      const supabase = createClient();
      await supabase.from("notifications").update({ read: true }).eq("id", item.id);
      window.dispatchEvent(new CustomEvent("notificationsChanged"));
    }
    router.push(notificationActionHref(item, undefined, locale) ?? `/${locale}/notificaciones`);
  }

  async function markAllRead() {
    if (!user) return;
    const ids = visible.filter((item) => !item.read).map((item) => item.id);
    if (ids.length === 0) return;
    const supabase = createClient();
    await supabase.from("notifications").update({ read: true }).in("id", ids);
    updateNotifications((prev) => prev.map((item) => (ids.includes(item.id) ? { ...item, read: true } : item)));
    window.dispatchEvent(new CustomEvent("notificationsChanged"));
  }

  // The panel is anchored to the bell on the website; inside the app it is
  // portalled to <body> and pinned to the viewport, above the native header.
  useEffect(() => {
    if (!menuOpen || !nativeApp) return;
    const situar = () => {
      const boton = menuRef.current?.querySelector("button");
      if (!boton) return;
      const caja = boton.getBoundingClientRect();
      setPosicionPanel({
        top: Math.round(caja.bottom + 8),
        right: Math.max(12, Math.round(window.innerWidth - caja.right)),
      });
    };
    situar();
    window.addEventListener("resize", situar);
    window.addEventListener("scroll", situar, true);
    return () => {
      window.removeEventListener("resize", situar);
      window.removeEventListener("scroll", situar, true);
    };
  }, [menuOpen, nativeApp]);

  // Filtro y grupos, como en cualquier bandeja moderna: primero lo que no se ha
  // leído, después el resto. Antes era una lista plana de cinco.
  const noLeidas = visible.filter((item) => !item.read);
  const leidas = visible.filter((item) => item.read);
  // Sin filtro «Todas / No leídas»: los dos grupos —«Nuevas» y «Antes»— ya
  // separan lo mismo sin pedir que se elija nada.
  const listaFiltrada = visible;
  const grupos = [
    { clave: "nuevas", rotulo: t("groupNew"), items: noLeidas.slice(0, 6) },
    { clave: "antes", rotulo: t("groupEarlier"), items: leidas.slice(0, Math.max(0, 6 - noLeidas.length)) },
  ].filter((g) => g.items.length > 0);

  const fila = (item: Notification) => {
    const copy = localizedNotificationCopy(item, locale);
    return (
      <button
        key={item.id}
        type="button"
        onClick={() => void openNotification(item)}
        className={cn(
          "flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-[#f1f7fb]",
          !item.read && "bg-[#f5fbff]",
        )}
      >
        {fotoDe(item) ? (
          // eslint-disable-next-line @next/next/no-img-element -- miniatura fija; el optimizador no actúa en Cloudflare
          <img src={fotoDe(item) as string} alt="" className="h-10 w-10 shrink-0 rounded-full object-cover" />
        ) : (
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full ccr-caja-icono-plana">
            <NotificationSourceIcon type={item.type} className="h-[18px] w-[18px]" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className={cn("block line-clamp-2 text-[13.5px] leading-snug", item.read ? "font-medium text-[#374151]" : "font-semibold text-[#162543]")}>
            {copy.message || copy.title}
          </span>
          <span className={cn("mt-0.5 block text-[12px] font-semibold", item.read ? "text-[#94a3b8]" : "text-[#0089bb]")}>
            {formatRelativeOrDate(item.created_at, locale)}
          </span>
        </span>
        {!item.read && <span className="mt-3 h-2.5 w-2.5 shrink-0 rounded-full bg-[#009FD9]" aria-hidden />}
      </button>
    );
  };

  const menuPanel = (
        <div ref={menuPanelRef} style={nativeApp && posicionPanel ? { top: posicionPanel.top, right: posicionPanel.right } : undefined} className={cn(nativeApp ? "ccr-notification-bell-menu fixed right-4 top-16 z-[230]" : "absolute right-0 top-11 z-[90]", "w-[min(24rem,calc(100vw-1rem))] overflow-hidden rounded-2xl border border-[#dbe4ee] bg-white shadow-[0_18px_45px_-18px_rgba(15,23,42,0.45)]")}>
          <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-3.5">
            <p className="text-[17px] font-extrabold text-[#162543]">{t("title")}</p>
            {noLeidas.length > 0 && (
              <button
                type="button"
                onClick={() => void markAllRead()}
                aria-label={t("markAllRead")}
                title={t("markAllRead")}
                className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-[#0089bb] transition hover:bg-[#eef9fd]"
              >
                <CheckCheck className="h-4 w-4" />
              </button>
            )}
          </div>


          {listaFiltrada.length > 0 ? (
            <div className="max-h-[22rem] overflow-y-auto px-1.5 pb-1.5">
              {grupos.map((grupo) => (
                <div key={grupo.clave}>
                  <p className="px-2.5 pb-1 pt-2 text-[12px] font-extrabold uppercase tracking-[0.06em] text-[#8fa1b6]">{grupo.rotulo}</p>
                  {grupo.items.map(fila)}
                </div>
              ))}
            </div>
          ) : (
            // Sin nada que mostrar el panel es pequeño: un contenedor enorme y
            // vacío se ve peor que no tener nada.
            <div className="px-4 pb-5 pt-2 text-center">
              <div className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[#eef7fb] text-[#009FD9]">
                <Bell className="h-5 w-5" />
              </div>
              <p className="mt-2.5 text-[14px] font-bold text-[#162543]">
                {locale === "en" ? "No notifications yet" : "Aún no tienes notificaciones"}
              </p>
            </div>
          )}

          <button
            type="button"
            onClick={openNotifications}
            className="flex w-full items-center justify-center gap-1.5 border-t border-[#eef2f6] px-4 py-3 text-center text-[13.5px] font-bold text-[#0089bb] transition hover:bg-[#f5fbfe]"
          >
            <span>{locale === "en" ? "View all notifications" : "Ver todas las notificaciones"}</span>
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
  );

  if (!user) return null;

  return (
    <div ref={menuRef} className="relative">
      <button
        // La campana ABRE Notificaciones, no una ventanita previa: en la app y en
        // cualquier pantalla de menos de 1024px va directo a la pantalla
        // completa. El panel flotante es cosa de escritorio, donde hay sitio al
        // lado de la campana y no reemplaza a la página. Además se decide con el
        // ancho en el momento del toque, no con la detección de Capacitor, que
        // en el primer cuadro todavía puede decir "no soy la app" y dejaba
        // asomar el panel antes de navegar.
        onClick={() => {
          const pantallaChica = typeof window !== "undefined" && window.matchMedia("(max-width: 1023px)").matches;
          if (nativeApp || pantallaChica) {
            openNotifications();
            return;
          }
          setMenuOpen((next) => !next);
        }}
        className="relative grid h-10 w-10 place-items-center rounded-xl text-[#1A2744] transition-colors hover:bg-[#f3f4f6] hover:text-[#009FD9]"
        aria-label={t("title")}
        aria-expanded={menuOpen}
      >
        <span className="relative inline-flex">
          <Bell className="h-5 w-5" />
          {unreadCount > 0 && (
            <span className="absolute -right-2 -top-2 flex h-[18px] min-w-[18px] items-center justify-center rounded-full bg-[#009FD9] px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </span>
      </button>
      {menuOpen && (nativeApp && portalHost ? createPortal(menuPanel, portalHost) : menuPanel)}
    </div>
  );
}
