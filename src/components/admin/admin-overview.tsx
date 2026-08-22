"use client";

import { useEffect, useState } from "react";
import { UserPlus, Users, Briefcase, ShieldCheck, ArrowUpRight, ArrowDownRight, FolderOpen, Headset } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatRelativeTime } from "@/lib/utils";
import type { AdminOverview as Data, Kpi } from "@/lib/admin/overview";
import type { ActivityEvent, ActivityKind } from "@/lib/admin/activity";
import { AdminUserSearch } from "@/components/admin/admin-user-search";

function Delta({ pct, invert = false }: { pct: number | null; invert?: boolean }) {
  if (pct == null) return <span className="text-[11px] font-medium text-[#94a3b8]">sin comparación</span>;
  const positive = invert ? pct < 0 : pct >= 0;
  const color = pct === 0 ? "text-[#94a3b8]" : positive ? "text-emerald-600" : "text-red-500";
  const Icon = pct >= 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className={`inline-flex items-center gap-0.5 text-[11px] font-semibold ${color}`}>
      <Icon className="h-3 w-3" />{pct > 0 ? "+" : ""}{pct}%
    </span>
  );
}

// "2 esta semana · 22 la anterior" says more to the owner than "-91%".
function PlainDelta({ now, prior, suffix }: { now: number; prior: number; suffix: string }) {
  const diff = now - prior;
  const color = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-[#94a3b8]";
  const Icon = diff > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 text-[11px]">
      <span className={`inline-flex items-center gap-0.5 font-semibold ${color}`}>
        {diff !== 0 && <Icon className="h-3 w-3" />}{diff > 0 ? "+" : ""}{diff.toLocaleString("es-CR")}
      </span>
      <span className="text-[#94a3b8]">{suffix} · anterior: {prior.toLocaleString("es-CR")}</span>
    </span>
  );
}

function KpiCard({ icon: Icon, label, value, suffix, kpi, color, deltaSuffix, invertDelta }: {
  icon: typeof UserPlus; label: string; value: number; suffix?: string; kpi: Kpi; color: string; deltaSuffix: string; invertDelta?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center gap-2 text-[#64748b]">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 min-w-0">
        <p className="text-3xl font-bold leading-none text-[#0f172a] tabular-nums">{value.toLocaleString("es-CR")}{suffix}</p>
        <p className="mt-1.5 flex flex-wrap items-center gap-1">
          {kpi.prior != null ? (
            <PlainDelta now={value} prior={kpi.prior} suffix={deltaSuffix} />
          ) : (
            <>
              <Delta pct={kpi.deltaPct} invert={invertDelta} />
              <span className="text-[11px] text-[#94a3b8]">{deltaSuffix}</span>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

function EmptyMini({ label, className = "" }: { label: string; className?: string }) {
  return <div className={`flex items-center justify-center rounded-xl bg-[#f8fafc] text-sm text-[#94a3b8] ${className}`}>{label}</div>;
}

function Initials({ name, role }: { name: string; role: "professional" | "client" }) {
  const txt = name.split(" ").map((w) => w[0]).slice(0, 2).join("").toUpperCase() || "?";
  return (
    <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${role === "professional" ? "bg-[#e0f2fe] text-[#0369a1]" : "bg-[#dcfce7] text-[#15803d]"}`}>{txt}</span>
  );
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center justify-between gap-2">
        <h2 className="text-sm font-bold text-[#0f172a]">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

const ATTENTION: { key: string; label: string; href: string; hint: string }[] = [
  { key: "verificacion", label: "Verificaciones por revisar", href: "/admin/verificacion", hint: "Profesionales y clientes esperando la insignia" },
  { key: "soporte", label: "Casos de soporte esperando respuesta", href: "/admin/soporte", hint: "Tickets abiertos o con la última palabra del usuario" },
  { key: "reportes", label: "Reportes abiertos", href: "/admin/reportes", hint: "Perfiles o contenido reportado" },
  { key: "categorias", label: "Servicios sugeridos por revisar", href: "/admin/servicios", hint: "Propuestas de servicios nuevos" },
  { key: "cuentas", label: "Eliminaciones de cuenta pendientes", href: "/admin/cuentas", hint: "Solicitudes de borrado en proceso o fallidas" },
];

const ACTIVITY_META: Record<ActivityKind, { icon: typeof UserPlus; bg: string; fg: string; tag: string }> = {
  pro: { icon: UserPlus, bg: "bg-[#e0f2fe]", fg: "text-[#0369a1]", tag: "Profesional" },
  client: { icon: Users, bg: "bg-[#dcfce7]", fg: "text-[#15803d]", tag: "Cliente" },
  solicitud: { icon: Briefcase, bg: "bg-[#ede9fe]", fg: "text-[#6d28d9]", tag: "Solicitud" },
  proyecto: { icon: FolderOpen, bg: "bg-[#fef3c7]", fg: "text-[#b45309]", tag: "Proyecto" },
  ticket: { icon: Headset, bg: "bg-[#fee2e2]", fg: "text-[#b91c1c]", tag: "Soporte" },
};

export function AdminOverview({ adminName, data, activity = [] }: { adminName: string; data: Data; activity?: ActivityEvent[] }) {
  const firstName = adminName.split(" ")[0] || "Admin";
  // What needs a hand today, from the same endpoint that feeds the sidebar badges.
  const [attention, setAttention] = useState<Record<string, number> | null>(null);
  useEffect(() => {
    let alive = true;
    fetch("/api/admin/pending-counts").then((r) => r.json()).then((d) => { if (alive) setAttention(d ?? {}); }).catch(() => { if (alive) setAttention({}); });
    return () => { alive = false; };
  }, []);
  const attentionItems = ATTENTION.map((item) => ({ ...item, count: attention?.[item.key] ?? 0 }));
  const attentionTotal = attentionItems.reduce((sum, item) => sum + item.count, 0);
  return (
    <div className="flex flex-col gap-5">
      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Resumen</h1>
        <p className="mt-0.5 text-sm text-[#64748b]">Buenos días, {firstName}. Esto es lo que pasó en ContrataCR.</p>
      </div>

      <AdminUserSearch size="lg" placeholder="Buscar profesional, cliente, correo o identificación" />

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={UserPlus} label="Nuevos profesionales" value={data.newPros.value} kpi={data.newPros} color="#008ce0" deltaSuffix="esta semana" />
        <KpiCard icon={Users} label="Nuevos clientes" value={data.newClients.value} kpi={data.newClients} color="#16a34a" deltaSuffix="esta semana" />
        <KpiCard icon={Briefcase} label="Servicios facilitados" value={data.servicios.value} kpi={data.servicios} color="#7c3aed" deltaSuffix="este mes" />
        <KpiCard icon={ShieldCheck} label="Tasa de verificación" value={data.verificationRate.value} suffix="%" kpi={data.verificationRate} color="#f59e0b" deltaSuffix="vs. mes pasado" />
      </div>

      {/* Cuentas nuevas */}
      <Card title="Cuentas nuevas (últimos registros)" action={<Link href="/admin/usuarios" className="text-xs font-semibold text-[#008ce0] hover:underline">Ver todas</Link>}>
        {data.recentSignups.length === 0 ? (
          <EmptyMini label="Sin datos aún" className="py-8" />
        ) : (
          <div className="flex flex-col divide-y divide-[#f1f5f9]">
            {data.recentSignups.map((s) => (
              <div key={`${s.role}-${s.id}`} className="flex items-center gap-3 py-2.5">
                <Initials name={s.name} role={s.role} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold text-[#0f172a]">{s.name}</p>
                  {s.meta && <p className="truncate text-xs text-[#64748b]">{s.meta}</p>}
                </div>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${s.role === "professional" ? "bg-[#e0f2fe] text-[#0369a1]" : "bg-[#dcfce7] text-[#15803d]"}`}>
                  {s.role === "professional" ? "Profesional" : "Cliente"}
                </span>
                <span className="hidden sm:inline shrink-0 text-xs text-[#94a3b8] w-20 text-right">{formatRelativeTime(s.createdAt, "es")}</span>
              </div>
            ))}
          </div>
        )}
      </Card>

      {/* What needs attention + the verification queue + recent activity */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Card title={attention == null ? "Qué necesita tu atención" : attentionTotal === 0 ? "Nada pendiente hoy" : `Qué necesita tu atención · ${attentionTotal}`}>
          <ul className="flex flex-col divide-y divide-[#f1f5f9]">
            {attentionItems.map((item) => (
              <li key={item.key}>
                <Link href={item.href} className="flex items-center gap-3 py-2.5 hover:text-[#008ce0]">
                  <span className={`grid h-8 min-w-8 place-items-center rounded-lg px-1.5 text-sm font-bold tabular-nums ${item.count > 0 ? "bg-[#fff7ed] text-[#c2410c]" : "bg-[#f1f5f9] text-[#94a3b8]"}`}>{item.count}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-[#0f172a]">{item.label}</span>
                    <span className="block truncate text-[11px] text-[#94a3b8]">{item.hint}</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
        <Card
          title={`Verificación pendiente${data.pendingCount ? ` · ${data.pendingCount}` : ""}`}
          action={<Link href="/admin/verificacion" className="text-xs font-semibold text-[#008ce0] hover:underline">Revisar cola</Link>}
        >
          {data.pending.length === 0 ? (
            <EmptyMini label="Sin pendientes" className="py-8" />
          ) : (
            <div className="flex flex-col gap-2">
              {data.pending.map((p) => (
                <div key={p.id} className="flex items-center gap-3">
                  <Initials name={p.name} role="professional" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-semibold text-[#0f172a]">{p.name}</p>
                    <p className="truncate text-xs text-[#64748b]">{p.category}</p>
                  </div>
                  <Link href="/admin/verificacion" className="shrink-0 rounded-lg bg-[#008ce0] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#0077c0]">Revisar</Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card title="Actividad reciente">
          {activity.length === 0 ? (
            <EmptyMini label="Sin actividad aún" className="py-8" />
          ) : (
            <div className="flex flex-col divide-y divide-[#f1f5f9]">
              {activity.map((event) => {
                const meta = ACTIVITY_META[event.kind];
                return (
                  <div key={event.id} className="flex items-center gap-3 py-2">
                    <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full ${meta.bg} ${meta.fg}`}><meta.icon className="h-4 w-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[#0f172a]">{event.title}</p>
                      <p className="truncate text-xs text-[#64748b]">{event.sub}</p>
                    </div>
                    <span className="shrink-0 text-[11px] text-[#94a3b8]">{formatRelativeTime(event.createdAt, "es")}</span>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
