"use client";

import { Search, Bell, ChevronDown, UserPlus, Users, Briefcase, ShieldCheck, ArrowUpRight, ArrowDownRight, ChevronRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { formatRelativeTime } from "@/lib/utils";
import type { AdminOverview as Data, Kpi, RankItem } from "@/lib/admin/overview";

// ── Sparkline (small trend line) ──
function Sparkline({ data, color }: { data: number[]; color: string }) {
  if (!data || data.length < 2) return <div className="h-8 w-20" />;
  const max = Math.max(...data), min = Math.min(...data);
  const range = max - min || 1;
  const w = 80, h = 32;
  const pts = data.map((v, i) => `${(i / (data.length - 1)) * w},${h - ((v - min) / range) * (h - 4) - 2}`).join(" ");
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-8 w-20 overflow-visible" preserveAspectRatio="none">
      <polyline points={pts} fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

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

function KpiCard({ icon: Icon, label, value, suffix, kpi, color, deltaSuffix, invertDelta }: {
  icon: typeof UserPlus; label: string; value: number; suffix?: string; kpi: Kpi; color: string; deltaSuffix: string; invertDelta?: boolean;
}) {
  return (
    <div className="rounded-2xl border border-[#e5e7eb] bg-white p-4">
      <div className="flex items-center gap-2 text-[#64748b]">
        <Icon className="h-4 w-4" style={{ color }} />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <div className="mt-2 flex items-end justify-between gap-2">
        <div className="min-w-0">
          <p className="text-3xl font-bold leading-none text-[#0f172a] tabular-nums">{value.toLocaleString("es-CR")}{suffix}</p>
          <p className="mt-1.5 flex items-center gap-1">
            <Delta pct={kpi.deltaPct} invert={invertDelta} />
            <span className="text-[11px] text-[#94a3b8]">{deltaSuffix}</span>
          </p>
        </div>
        <Sparkline data={kpi.spark} color={color} />
      </div>
    </div>
  );
}

// ── Growth stacked-bar chart (14 days) ──
function GrowthChart({ data }: { data: Data["growth"] }) {
  const max = Math.max(1, ...data.map((d) => d.pros + d.clients));
  const hasData = data.some((d) => d.pros + d.clients > 0);
  if (!hasData) return <EmptyMini label="Sin datos aún" className="h-44" />;
  return (
    <div className="flex h-44 items-end gap-1.5">
      {data.map((d, i) => {
        const total = d.pros + d.clients;
        const totalH = (total / max) * 100;
        const prosShare = total > 0 ? d.pros / total : 0;
        return (
          <div key={i} className="group relative flex flex-1 flex-col justify-end" title={`${d.date}: ${d.pros} prof. · ${d.clients} cli.`}>
            <div className="w-full overflow-hidden rounded-md" style={{ height: `${totalH}%`, minHeight: total > 0 ? 6 : 0 }}>
              <div className="w-full bg-[#9ed8f2]" style={{ height: `${(1 - prosShare) * 100}%` }} />
              <div className="w-full bg-[#008ce0]" style={{ height: `${prosShare * 100}%` }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RankBars({ items, color }: { items: RankItem[]; color: string }) {
  if (items.length === 0) return <EmptyMini label="Sin datos aún" className="py-8" />;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-3">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-[#334155]">{it.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#0f172a]">{it.value.toLocaleString("es-CR")}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
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

export function AdminOverview({ adminName, data }: { adminName: string; data: Data }) {
  const firstName = adminName.split(" ")[0] || "Admin";
  return (
    <div className="flex flex-col gap-5">
      {/* Topbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
          <input
            placeholder="Buscar profesional, cliente, reporte…"
            className="h-10 w-full rounded-xl border border-[#e5e7eb] bg-white pl-9 pr-12 text-sm text-[#0f172a] placeholder:text-[#94a3b8] focus:outline-none focus:ring-2 focus:ring-[#38bdf8] focus:border-transparent"
          />
          <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-[#e5e7eb] bg-[#f8fafc] px-1.5 py-0.5 text-[10px] font-semibold text-[#94a3b8]">⌘K</kbd>
        </div>
        <button aria-label="Notificaciones" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-[#e5e7eb] bg-white text-[#64748b] hover:bg-[#f8fafc]">
          <Bell className="h-4 w-4" />
        </button>
        <div className="relative shrink-0">
          <select className="h-10 appearance-none rounded-xl border border-[#e5e7eb] bg-white pl-3 pr-9 text-sm font-medium text-[#334155] focus:outline-none focus:ring-2 focus:ring-[#38bdf8] cursor-pointer">
            <option>Últimos 7 días</option>
            <option>Últimos 30 días</option>
            <option>Últimos 90 días</option>
          </select>
          <ChevronDown className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-[#94a3b8]" />
        </div>
      </div>

      {/* Greeting */}
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Resumen</h1>
        <p className="mt-0.5 text-sm text-[#64748b]">Buenos días, {firstName}. Esto es lo que pasó en ContrataCR.</p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <KpiCard icon={UserPlus} label="Nuevos profesionales" value={data.newPros.value} kpi={data.newPros} color="#008ce0" deltaSuffix="esta semana" />
        <KpiCard icon={Users} label="Nuevos clientes" value={data.newClients.value} kpi={data.newClients} color="#16a34a" deltaSuffix="esta semana" />
        <KpiCard icon={Briefcase} label="Servicios facilitados" value={data.servicios.value} kpi={data.servicios} color="#7c3aed" deltaSuffix="este mes" />
        <KpiCard icon={ShieldCheck} label="Tasa de verificación" value={data.verificationRate.value} suffix="%" kpi={data.verificationRate} color="#f59e0b" deltaSuffix="vs. mes pasado" />
      </div>

      {/* Growth */}
      <Card
        title="Crecimiento"
        action={
          <div className="flex items-center gap-3 text-[11px] font-medium text-[#64748b]">
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#008ce0]" /> Profesionales</span>
            <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full bg-[#9ed8f2]" /> Clientes</span>
          </div>
        }
      >
        <p className="-mt-2 mb-3 text-xs text-[#94a3b8]">Altas diarias · últimos 14 días</p>
        <GrowthChart data={data.growth} />
      </Card>

      {/* Altas recientes */}
      <Card title="Altas recientes" action={<Link href="/admin/usuarios" className="text-xs font-semibold text-[#008ce0] hover:underline">Ver todas</Link>}>
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

      {/* Bottom row: pending + two rankings */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
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

        <Card title="Categorías más comunes">
          <RankBars items={data.topCategories} color="#008ce0" />
        </Card>

        <Card title="Profesionales por provincia">
          <RankBars items={data.byProvince} color="#16a34a" />
        </Card>
      </div>
    </div>
  );
}
