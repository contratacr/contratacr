import { Users, UserCheck, Briefcase, FolderOpen, Headset, Truck, CalendarClock, MousePointerClick } from "lucide-react";
import type { AdminReports, Count } from "@/lib/admin/reports";

const PALETTE = ["#008ce0", "#16a34a", "#7c3aed", "#f59e0b", "#ef4444", "#0ea5e9", "#64748b", "#ec4899"];

function Section({ icon: Icon, title, sub, children }: { icon: typeof Users; title: string; sub?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#0f172a]"><Icon className="h-4 w-4" /></span>
        <div>
          <h2 className="text-sm font-bold text-[#0f172a]">{title}</h2>
          {sub && <p className="text-xs text-[#94a3b8]">{sub}</p>}
        </div>
      </div>
      {children}
    </section>
  );
}

function Tile({ label, value, accent }: { label: string; value: string | number; accent?: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <p className="text-3xl font-bold tabular-nums leading-none" style={{ color: accent ?? "#0f172a" }}>{typeof value === "number" ? value.toLocaleString("es-CR") : value}</p>
      <p className="mt-1.5 text-xs text-[#64748b]">{label}</p>
    </div>
  );
}

function Empty({ className = "" }: { className?: string }) {
  return <div className={`flex items-center justify-center rounded-xl bg-[#f8fafc] text-sm text-[#94a3b8] ${className}`}>Sin datos aún</div>;
}

function BarsH({ items, color }: { items: Count[]; color?: string }) {
  if (items.length === 0) return <Empty className="py-8" />;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it, idx) => (
        <div key={it.label}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-[#334155]">{it.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#0f172a]">{it.value.toLocaleString("es-CR")}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color ?? PALETTE[idx % PALETTE.length] }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// Single segmented bar + legend (status breakdowns).
function Segmented({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total === 0) return <Empty className="py-6" />;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.label} <span className="font-semibold text-[#0f172a]">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

// Daily two-series stacked bars (30 days).
function DailyBars({ data, aKey, bKey, aColor, bColor }: { data: Record<string, number>[]; aKey: string; bKey?: string; aColor: string; bColor?: string }) {
  const max = Math.max(1, ...data.map((d) => (d[aKey] ?? 0) + (bKey ? d[bKey] ?? 0 : 0)));
  const hasData = data.some((d) => (d[aKey] ?? 0) + (bKey ? d[bKey] ?? 0 : 0) > 0);
  if (!hasData) return <Empty className="h-28" />;
  return (
    <div className="flex h-28 items-end gap-[3px]">
      {data.map((d, i) => {
        const a = d[aKey] ?? 0, b = bKey ? d[bKey] ?? 0 : 0; const total = a + b;
        return (
          <div key={i} className="flex h-full flex-1 flex-col justify-end" title={`${String(d.date)}: ${total}`}>
            <div className="w-full overflow-hidden rounded-sm" style={{ height: `${(total / max) * 100}%`, minHeight: total > 0 ? 4 : 0 }}>
              {bKey && <div className="w-full" style={{ height: `${total ? (b / total) * 100 : 0}%`, backgroundColor: bColor }} />}
              <div className="w-full" style={{ height: `${total ? (a / total) * 100 : 100}%`, backgroundColor: aColor }} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Legend({ items }: { items: { label: string; color: string }[] }) {
  return (
    <div className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] font-medium text-[#64748b]">
      {items.map((i) => <span key={i.label} className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: i.color }} />{i.label}</span>)}
    </div>
  );
}

export function AdminAnalytics({ data }: { data: AdminReports }) {
  const { users, pros, activity, support, interactions } = data;
  const respRate = activity.solicitudesTotal > 0 ? Math.round((activity.solicitudesResponded / activity.solicitudesTotal) * 100) : 0;

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Analítica</h1>
        <p className="mt-0.5 text-sm text-[#64748b]">Métricas globales de usuarios, profesionales, actividad, interacciones y soporte.</p>
      </div>

      {/* USUARIOS */}
      <Section icon={Users} title="Usuarios" sub="Totales y registros (últimos 30 días)">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          <Tile label="Usuarios totales" value={users.total} />
          <Tile label="Solo clientes" value={users.clients} accent="#16a34a" />
          <Tile label="Profesionales" value={users.pros} accent="#008ce0" />
          <Tile label="Prof. verificados" value={users.verifiedPros} accent="#f59e0b" />
          <Tile label="Con solicitudes" value={users.activeClients} accent="#7c3aed" />
        </div>
        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-xs font-semibold text-[#334155]">Registros diarios</p>
            <Legend items={[{ label: "Profesionales", color: "#008ce0" }, { label: "Clientes", color: "#9ed8f2" }]} />
          </div>
          <DailyBars data={users.reg30 as unknown as Record<string, number>[]} aKey="pros" bKey="clients" aColor="#008ce0" bColor="#9ed8f2" />
        </div>
      </Section>

      {/* PROFESIONALES */}
      <Section icon={UserCheck} title="Profesionales" sub={`${pros.total.toLocaleString("es-CR")} registrados`}>
        <Segmented parts={[
          { label: "Verificados", value: pros.verified, color: "#16a34a" },
          { label: "Pendientes", value: pros.pending, color: "#f59e0b" },
          { label: "Sin verificar", value: pros.unverified, color: "#94a3b8" },
          { label: "Rechazados", value: pros.rejected, color: "#ef4444" },
        ]} />
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-[#334155]">Por categoría</p>
            <BarsH items={pros.byCategory} color="#008ce0" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[#334155]">Por provincia</p>
            <BarsH items={pros.byProvince} color="#16a34a" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="A domicilio (viajan)" value={pros.traveling} accent="#0ea5e9" />
          <Tile label="Lugar fijo" value={pros.fixed} />
          <Tile label="Con agenda publicada" value={pros.withSchedule} accent="#16a34a" />
          <Tile label="Con servicios" value={pros.withServices} accent="#7c3aed" />
        </div>
      </Section>

      {/* ACTIVIDAD */}
      <Section icon={Briefcase} title="Actividad del marketplace" sub="Solicitudes y proyectos (últimos 30 días)">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-[#334155]">Volumen diario</p>
              <Legend items={[{ label: "Solicitudes", color: "#008ce0" }, { label: "Proyectos", color: "#7c3aed" }]} />
            </div>
            <DailyBars data={activity.series30 as unknown as Record<string, number>[]} aKey="solicitudes" bKey="proyectos" aColor="#008ce0" bColor="#c4b5fd" />
          </div>
          <div className="grid grid-cols-2 gap-3 self-start">
            <Tile label="Solicitudes" value={activity.solicitudesTotal} accent="#008ce0" />
            <Tile label="Proyectos" value={activity.proyectosTotal} accent="#7c3aed" />
            <Tile label="Solicitudes atendidas" value={activity.solicitudesResponded} accent="#16a34a" />
            <Tile label="Tasa de respuesta" value={`${respRate}%`} accent="#f59e0b" />
          </div>
        </div>
        <div className="mt-4 grid grid-cols-1 gap-4 lg:grid-cols-3">
          <div><p className="mb-2 text-xs font-semibold text-[#334155]">Solicitudes por estado</p><BarsH items={activity.solicitudesByStatus} /></div>
          <div><p className="mb-2 text-xs font-semibold text-[#334155]">Proyectos por estado</p><BarsH items={activity.proyectosByStatus} /></div>
          <div><p className="mb-2 text-xs font-semibold text-[#334155]">Categorías más solicitadas</p><BarsH items={activity.topCategories} color="#008ce0" /></div>
        </div>
      </Section>

      {/* INTERACCIONES */}
      <Section icon={MousePointerClick} title="Interacciones" sub="Intención comercial registrada por ContrataCR · totales históricos">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Tile label="Interacciones" value={interactions.total} accent="#008ce0" />
          <Tile label="Visitantes únicos" value={interactions.uniqueVisitors} accent="#7c3aed" />
          <Tile label="WhatsApp" value={interactions.byType.find((item) => item.label === "WhatsApp")?.value ?? 0} accent="#16a34a" />
          <Tile label="Llamadas" value={interactions.byType.find((item) => item.label === "Llamadas")?.value ?? 0} accent="#f59e0b" />
        </div>
        <div className="mt-4 grid grid-cols-1 gap-5 lg:grid-cols-2">
          <div>
            <p className="mb-2 text-xs font-semibold text-[#334155]">Interacciones diarias · últimos 30 días</p>
            <DailyBars data={interactions.series30 as unknown as Record<string, number>[]} aKey="total" aColor="#008ce0" />
          </div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[#334155]">Por acción</p>
            <BarsH items={interactions.byType} color="#008ce0" />
          </div>
        </div>
      </Section>

      {/* SOPORTE */}
      <Section icon={Headset} title="Soporte" sub="Tickets por estado y volumen (últimos 30 días)">
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <div><BarsH items={support.byStatus} /></div>
          <div>
            <p className="mb-2 text-xs font-semibold text-[#334155]">Tickets diarios</p>
            <DailyBars data={support.series30 as unknown as Record<string, number>[]} aKey="tickets" aColor="#008ce0" />
          </div>
        </div>
      </Section>

      <p className="flex flex-wrap items-center gap-3 text-xs text-[#94a3b8]">
        <span className="inline-flex items-center gap-1"><Truck className="h-3.5 w-3.5" /> A domicilio: {pros.traveling}</span>
        <span className="inline-flex items-center gap-1"><CalendarClock className="h-3.5 w-3.5" /> Con agenda: {pros.withSchedule}</span>
        <span className="inline-flex items-center gap-1"><FolderOpen className="h-3.5 w-3.5" /> Proyectos: {activity.proyectosTotal}</span>
      </p>
    </div>
  );
}
