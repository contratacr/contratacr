"use client";

import { useCallback, useEffect, useState } from "react";
import { CalendarCheck, CheckCircle2, ClipboardList, ExternalLink, Search, Users, Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { PanelEmptyState, PanelListSkeleton } from "@/components/ui/content-loading";
import { getInitials, formatRelativeOrDate } from "@/lib/utils";
import { openInNewTabOnDesktop } from "@/lib/desktop-new-tab";

type Connection = {
  professionalId: string;
  slug: string | null;
  name: string;
  avatarUrl: string | null;
  isVerified: boolean;
  categoryLabel: string | null;
  lastInteractionAt: string | null;
  source: "booking" | "project" | "both";
  status: string;
  title: string | null;
  count: number;
};

function sourceLabel(source: Connection["source"]) {
  if (source === "booking") return "Solicitud";
  if (source === "project") return "Proyecto";
  return "Solicitud y proyecto";
}

function SourceIcon({ source }: { source: Connection["source"] }) {
  if (source === "project") return <ClipboardList className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />;
  return <CalendarCheck className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />;
}

function statusLabel(status: string) {
  if (status === "completed") return "Completado";
  if (status === "awaiting_confirmation") return "Por confirmar";
  if (status === "in_progress") return "En progreso";
  if (status === "confirmed") return "Confirmado";
  return "Conectado";
}

export function ClientConnections() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch("/api/client/connections", { cache: "no-store" });
      const data = await response.json();
      setConnections(Array.isArray(data.connections) ? data.connections : []);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    queueMicrotask(() => void load());
  }, [load]);

  const needle = query.trim().toLocaleLowerCase("es-CR");
  const filtered = connections.filter((item) => !needle || [
    item.name,
    item.categoryLabel,
    item.title,
  ].some((value) => value?.toLocaleLowerCase("es-CR").includes(needle)));

  if (loading) return <PanelListSkeleton rows={3} withSearch hasData={connections.length > 0} />;

  if (connections.length === 0) {
    return (
      <PanelEmptyState
        icon={Users}
        title="Aún no tienes conexiones"
        description="Aquí aparecerán los profesionales con los que hayas tenido una solicitud confirmada o un proyecto aceptado."
        action={<Button asChild><Link href="/buscar">Buscar profesionales</Link></Button>}
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
          placeholder="Buscar profesional o servicio"
          className="h-11 w-full rounded-2xl border border-[#dfe8f0] bg-white pl-11 pr-4 text-sm font-semibold text-[#162543] outline-none focus:border-[#009FD9]"
        />
      </div>
      <p className="mb-3 text-sm font-semibold text-[#6b7280]">
        {filtered.length} {filtered.length === 1 ? "conexión" : "conexiones"}
      </p>
      <div className="overflow-hidden rounded-2xl border border-[#e5e7eb] bg-white divide-y divide-[#f3f4f6]">
        {filtered.map((item) => (
          <article key={item.professionalId} className="grid grid-cols-[56px_minmax(0,1fr)] gap-x-3 gap-y-3 p-4 sm:flex sm:items-center sm:gap-4">
            <Avatar className="h-14 w-14 rounded-2xl">
              <AvatarImage src={item.avatarUrl ?? undefined} />
              <AvatarFallback className="rounded-2xl bg-[#EBF5FB] text-sm font-bold text-[#009FD9]">{getInitials(item.name)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="flex min-w-0 items-center text-sm font-extrabold text-[#162543]">
                  <span className="truncate">{item.name}</span>
                  {item.isVerified && (
                    <CheckCircle2 aria-label="Verificado" className="ml-1 h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                  )}
                </h3>
                <span className="shrink-0 rounded-full bg-[#eef8fd] px-2 py-0.5 text-[10px] font-bold text-[#0089bb]">{statusLabel(item.status)}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs font-semibold text-[#6b7280]">
                {item.categoryLabel && (
                  <span className="inline-flex items-center gap-1">
                    <Wrench className="h-3.5 w-3.5 shrink-0 text-[#009FD9]" />
                    {item.categoryLabel}
                  </span>
                )}
                <span className="inline-flex items-center gap-1">
                  <SourceIcon source={item.source} />
                  {sourceLabel(item.source)}
                </span>
              </div>
              {item.title && <p className="mt-1 truncate text-xs text-[#6b7280]">{item.title}</p>}
              {item.lastInteractionAt && <p className="mt-1 text-[11px] font-medium text-[#9ca3af]">{formatRelativeOrDate(item.lastInteractionAt, "es")}</p>}
            </div>
            <div className="col-span-2 flex gap-2 sm:col-span-1 sm:shrink-0">
              {item.slug ? (
                <Button variant="outline" size="sm" className="min-w-0 flex-1 rounded-xl sm:flex-none" asChild>
                  <Link href={`/profesionales/${item.slug}?from=${encodeURIComponent("/dashboard/cliente?tab=connections")}`} onClick={openInNewTabOnDesktop}>
                    <ExternalLink className="h-3.5 w-3.5" />
                    Ver perfil
                  </Link>
                </Button>
              ) : null}
            </div>
          </article>
        ))}
      </div>
      {filtered.length === 0 && <p className="py-8 text-center text-sm font-semibold text-[#6b7280]">No encontramos conexiones con ese texto.</p>}
    </div>
  );
}
