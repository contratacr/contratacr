"use client";

import { useState } from "react";
import { CalendarCheck, ClipboardList, ExternalLink, MessageSquareText, Repeat2, Search, Users, Wrench } from "lucide-react";
import { ResponsiveVerifiedName } from "@/components/professionals/responsive-verified-name";
import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PanelEmptyState, PanelFilterEmpty, PanelListSkeleton } from "@/components/ui/content-loading";
import { getInitials, formatRelativeOrDate } from "@/lib/utils";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";
import { getCategoryLabel } from "@/lib/data/categories";
import { useAuth } from "@/hooks/use-auth";
import { useCachedResource } from "@/hooks/use-cached-resource";

type Connection = {
  professionalId: string;
  slug: string | null;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  categoryId: string | null;
  categoryLabel: string | null;
  lastInteractionAt: string | null;
  source: "booking" | "project" | "contact" | "both";
  status: string;
  title: string | null;
  count: number;
};

function SourceIcon({ source }: { source: Connection["source"] }) {
  if (source === "contact") return <MessageSquareText className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />;
  if (source === "project") return <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />;
  return <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />;
}

const NO_CONNECTIONS: Connection[] = [];

export function ClientConnections() {
  const locale = useLocale();
  const t = useTranslations("clientConnections");
  const { user } = useAuth();
  const { data: connections, loading } = useCachedResource<Connection[]>(
    user ? `dashboard:client-connections:${user.id}` : null,
    async () => {
      const response = await fetch("/api/client/connections", { cache: "no-store" });
      const data = await response.json();
      return Array.isArray(data.connections) ? data.connections : [];
    },
    NO_CONNECTIONS,
    { refreshOn: true },
  );
  const [query, setQuery] = useState("");

  const localeCode = locale === "en" ? "en-US" : "es-CR";
  const needle = query.trim().toLocaleLowerCase(localeCode);
  const localizedConnections = connections.map((item) => ({
    ...item,
    categoryLabel: item.categoryId ? getCategoryLabel(item.categoryId, locale) : item.categoryLabel,
  }));
  const filtered = localizedConnections.filter((item) => !needle || [
    item.name,
    item.categoryLabel,
    item.title,
  ].some((value) => value?.toLocaleLowerCase(localeCode).includes(needle)));

  if (loading) return <PanelListSkeleton rows={3} withSearch hasData={connections.length > 0} />;

  if (connections.length === 0) {
    return (
      <PanelEmptyState
        icon={Users}
        title={t("emptyTitle")}
        description={t("emptyDescription")}
        action={<Button asChild><Link href="/buscar">{t("searchProfessionals")}</Link></Button>}
      />
    );
  }

  return (
    <div className="ccr-native-safe-list-end">
      <div className="relative mb-4">
        <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[#8a97a9]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("searchPlaceholder")}
          className="h-11 w-full rounded-2xl border border-[#dfe8f0] bg-white pl-11 pr-4 text-sm font-semibold text-[#162543] outline-none focus:border-[#009FD9]"
        />
      </div>
      <p className="mb-3 text-sm font-semibold text-[#6b7280]">
        {t("count", { count: filtered.length })}
      </p>
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white divide-y divide-[#f3f4f6]">
        {filtered.map((item) => (
          <article key={item.professionalId} className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 sm:flex sm:items-center sm:gap-4">
            <Avatar className="h-14 w-14 rounded-2xl">
              <AvatarImage src={item.avatarUrl ?? undefined} />
              <AvatarFallback className="rounded-2xl bg-[#EBF5FB] text-sm font-bold text-[#009FD9]">{getInitials(item.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              {/* El estado va SIEMPRE en la misma línea que el nombre: el nombre se
                  recorta según el ancho disponible en vez de empujar la etiqueta abajo. */}
              <div className="flex min-w-0 items-center gap-2">
                <h3 className="flex min-w-0 flex-1 items-center text-sm font-extrabold text-[#162543]">
                  <ResponsiveVerifiedName name={item.name} verified={item.isVerified} verifiedLabel={t("verified")} />
                </h3>
                <span className="shrink-0 rounded-full bg-[#eef8fd] px-2 py-0.5 text-[10px] font-bold text-[#0089bb]">
                  {item.status === "completed"
                    ? t("status.completed")
                    : item.status === "awaiting_confirmation"
                      ? t("status.awaitingConfirmation")
                      : item.status === "in_progress"
                        ? t("status.inProgress")
                        : item.status === "confirmed"
                          ? t("status.confirmed")
                          : item.status === "contact"
                            ? t("status.contact")
                            : t("status.connected")}
                </span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#6b7280]">
                {item.categoryLabel && (
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                    {item.categoryLabel}
                  </span>
                )}
                {/* Con más de un trabajo en común, lo que importa es cuántos han
                    sido, no de qué tipo: «Cita y proyecto» era jerga del sistema y
                    además se quedaba corta cuando había cinco trabajos. Con uno
                    solo se sigue diciendo de dónde viene la relación. */}
                {item.count > 1 ? (
                  <span className="inline-flex items-center gap-1">
                    <Repeat2 className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                    {t("timesTogether", { count: item.count })}
                  </span>
                ) : !(item.source === "contact" && item.status === "contact") ? (
                  <span className="inline-flex items-center gap-1">
                    <SourceIcon source={item.source} />
                    {item.source === "booking"
                      ? t("source.booking")
                      : item.source === "project"
                        ? t("source.project")
                        : t("source.contact")}
                  </span>
                ) : null}
              </div>
              {item.title && <p className="mt-1 truncate text-xs text-[#6b7280]">{item.title}</p>}
              {item.lastInteractionAt && <p className="mt-1 text-[11px] font-medium text-[#68778d]">{formatRelativeOrDate(item.lastInteractionAt, locale)}</p>}
            </div>
            <div className="col-span-2 flex gap-2 sm:col-span-1 sm:shrink-0">
              {item.slug ? (
                <Button variant="secondary" size="sm" className="h-11 min-w-0 flex-1 text-[13px] sm:w-44 sm:flex-none" asChild>
                  <Link href={`/profesionales/${item.slug}?from=${encodeURIComponent("/dashboard/cliente?tab=connections")}`} onClick={openInNewTabOnDesktop}>
                    {t("viewProfile")}
                  </Link>
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <PanelFilterEmpty icon={Search} title={t("noResults")} description={t("noResultsSub")} />}
    </div>
  );
}
