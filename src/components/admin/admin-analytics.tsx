import { ArrowDownRight, ArrowUpRight, Headset, MapPinned, Megaphone, Minus, Search, Smartphone, UserCheck, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AdminAcquisition, AdminReports, Count, WeekCompare } from "@/lib/admin/reports";

// Analítica is meant to be scanned, not read: one big number per fact, a short
// label, and the comparison as a compact chip. Explanations live in `title`
// tooltips so the page stays quiet.

const fmt = (n: number) => n.toLocaleString("es-CR");

function pct(part: number, whole: number) {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function Section({ icon: Icon, title, sub, children, action, className }: { icon: typeof Users; title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5 ${className ?? ""}`}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#0f172a]"><Icon className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-[#0f172a]">{title}</h2>
            {sub && <p className="text-[11px] text-[#94a3b8]">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Delta({ data }: { data: WeekCompare }) {
  const diff = data.now - data.prev;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const tone = diff > 0 ? "bg-emerald-50 text-emerald-700" : diff < 0 ? "bg-red-50 text-red-600" : "bg-[#f1f5f9] text-[#64748b]";
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums ${tone}`} title={`Semana anterior: ${fmt(data.prev)}`}>
      <Icon className="h-3 w-3" />
      {diff === 0 ? "igual" : `${diff > 0 ? "+" : ""}${fmt(diff)}`}
    </span>
  );
}

function Kpi({ label, data, help }: { label: string; data: WeekCompare; help?: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3" title={help}>
      <p className="truncate text-xs font-medium text-[#64748b]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-3xl font-bold leading-none tabular-nums text-[#0f172a]">{fmt(data.now)}</p>
        <Delta data={data} />
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: number; sub?: string }) {
  return (
    <div className="rounded-xl border border-[#e5e7eb] p-3">
      <p className="text-xs text-[#64748b]">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-[#0f172a]">{fmt(value)}</p>
      {sub && <p className="text-[11px] text-[#94a3b8]">{sub}</p>}
    </div>
  );
}

function Funnel({ steps }: { steps: { label: string; value: number; help: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1].value : null;
        const rate = previous != null ? pct(step.value, previous) : null;
        return (
          <li key={step.label} title={step.help}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#0f172a]">{step.label}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
                {rate != null && <span className="rounded-full bg-[#f1f5f9] px-2 py-0.5 text-[11px] font-semibold text-[#64748b]">{rate > 100 ? "↑" : `${rate}%`}</span>}
                <span className="font-bold text-[#0f172a]">{fmt(step.value)}</span>
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
              <div className="h-full rounded-full bg-[#009FD9]" style={{ width: `${(step.value / max) * 100}%` }} />
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function Segmented({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total === 0) return <p className="text-sm text-[#94a3b8]">Sin datos</p>;
  return (
    <div>
      <div className="flex h-3 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
        {parts.filter((p) => p.value > 0).map((p) => (
          <div key={p.label} style={{ width: `${(p.value / total) * 100}%`, backgroundColor: p.color }} title={`${p.label}: ${p.value}`} />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1.5">
        {parts.filter((p) => p.value > 0).map((p) => (
          <span key={p.label} className="inline-flex items-center gap-1.5 text-xs text-[#475569]">
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: p.color }} />
            {p.label} <span className="font-semibold text-[#0f172a]">{p.value}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

function Ranked({ items, color }: { items: Count[]; color: string }) {
  if (items.length === 0) return <p className="text-sm text-[#94a3b8]">Sin datos</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2.5">
      {items.map((it) => (
        <div key={it.label}>
          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="truncate text-[#334155]">{it.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-[#0f172a]">{fmt(it.value)}</span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
            <div className="h-full rounded-full" style={{ width: `${(it.value / max) * 100}%`, backgroundColor: color }} />
          </div>
        </div>
      ))}
    </div>
  );
}

// One row per origin: professionals and clients it brought, last 30 days and
// all time. Campaign names come straight from utm_campaign.
function Acquisition({ data }: { data: AdminAcquisition }) {
  if (data.tracked === 0) {
    return <p className="text-sm text-[#94a3b8]">Sin datos todavía. Se guarda el origen de cada cuenta nueva a partir de hoy.</p>;
  }
  const th = "pb-2 text-right text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]";
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr>
              <th className="pb-2 text-left text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Origen</th>
              <th className={th} colSpan={2}>30 días</th>
              <th className={th} colSpan={2}>Total</th>
            </tr>
            <tr className="text-right text-[11px] text-[#94a3b8]">
              <th />
              <th className="pb-1 font-medium">Prof.</th>
              <th className="pb-1 font-medium">Clientes</th>
              <th className="pb-1 font-medium">Prof.</th>
              <th className="pb-1 font-medium">Clientes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f1f5f9]">
            {data.rows.map((row) => (
              <tr key={row.key}>
                <td className="py-2 pr-3 font-semibold text-[#0f172a]">{row.label}</td>
                <td className="py-2 text-right tabular-nums text-[#0f172a]">{fmt(row.pros30)}</td>
                <td className="py-2 text-right tabular-nums text-[#0f172a]">{fmt(row.clients30)}</td>
                <td className="py-2 text-right tabular-nums text-[#64748b]">{fmt(row.pros)}</td>
                <td className="py-2 text-right tabular-nums text-[#64748b]">{fmt(row.clients)}</td>
              </tr>
            ))}
            {data.untracked > 0 && (
              <tr>
                <td className="py-2 pr-3 text-[#94a3b8]">Sin dato</td>
                <td className="py-2 text-right tabular-nums text-[#94a3b8]" colSpan={2}>{fmt(data.untracked30)}</td>
                <td className="py-2 text-right tabular-nums text-[#94a3b8]" colSpan={2}>{fmt(data.untracked)}</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {data.campaigns.length > 0 && (
        <div className="mt-4">
          <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Por campaña</p>
          <ul className="divide-y divide-[#f1f5f9]">
            {data.campaigns.map((c) => (
              <li key={`${c.source}|${c.label}`} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                <span className="min-w-0 truncate font-semibold text-[#0f172a]">{c.label} <span className="font-normal text-[#94a3b8]">· {c.source}</span></span>
                <span className="shrink-0 text-xs tabular-nums text-[#64748b]"><strong className="text-[#0f172a]">{c.pros}</strong> prof. · <strong className="text-[#0f172a]">{c.clients}</strong> clientes</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

export function AdminAnalytics({ data }: { data: AdminReports }) {
  const { users, pros, activity, support, insights } = data;
  const week = insights.week;
  const platformTotal = insights.platform.web + insights.platform.native;
  const nativeShare = pct(insights.platform.native, platformTotal);
  const respRate = pct(activity.solicitudesResponded, activity.solicitudesTotal);
  const pendingTickets = support.byStatus.filter((s) => s.label !== "Resuelto").reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#0f172a]">Analítica</h1>
        <p className="text-xs text-[#94a3b8]">
          {fmt(users.total)} cuentas · {fmt(users.pros)} profesionales ({fmt(users.verifiedPros)} verificados) · {fmt(users.clients)} clientes
        </p>
      </div>

      <Section icon={Users} title="Esta semana" sub="vs. los 7 días anteriores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Profesionales nuevos" data={week.pros} />
          <Kpi label="Clientes nuevos" data={week.clients} />
          <Kpi label="Búsquedas" data={week.searches} />
          <Kpi label="Contactos" data={week.contacts} help="WhatsApp, llamadas, enlaces y solicitudes iniciadas" />
          <Kpi label="Solicitudes" data={week.requests} help="Solicitudes y proyectos creados por clientes" />
          <Kpi label="Postulaciones" data={week.applications} help="Postulaciones a empleos" />
        </div>
      </Section>

      <Section icon={Megaphone} title="De dónde vienen los registros" sub="Por canal de origen">
        <Acquisition data={data.acquisition} />
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={Search} title="Del interés a la contratación" sub="Últimos 7 días · % del paso anterior">
          <Funnel steps={[
            { label: "Búsquedas", value: insights.funnel.searches, help: "Buscaron un servicio o profesional" },
            { label: "Vistas de perfil", value: insights.funnel.profileViews, help: "Abrieron el perfil de un profesional" },
            { label: "Contactos", value: insights.funnel.contacts, help: "WhatsApp, llamar, enlace o solicitud iniciada" },
            { label: "Solicitudes creadas", value: insights.funnel.requests, help: "Pidieron un servicio o publicaron un proyecto" },
          ]} />
          {respRate != null && (
            <p className="mt-4 text-xs text-[#64748b]">
              Solicitudes atendidas por profesionales: <strong className="text-[#0f172a]">{respRate}%</strong> <span className="text-[#94a3b8]">({fmt(activity.solicitudesResponded)} de {fmt(activity.solicitudesTotal)}, histórico)</span>
            </p>
          )}
        </Section>

        <Section icon={MapPinned} title="Qué buscan vs. qué ofrecemos" sub="Últimos 30 días" action={<Link href="/admin/cobertura" className="text-xs font-semibold text-[#008ce0] hover:underline">Cobertura</Link>}>
          {insights.demand.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Sin datos</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {insights.demand.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0f172a]">{row.label}</p>
                    <p className="text-[11px] text-[#94a3b8]">{row.searches} búsquedas · {row.projects} proyectos</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-[#0f172a]"><strong>{row.supply}</strong> <span className="text-xs text-[#64748b]">prof.</span></p>
                    <p className={`text-[11px] font-semibold ${row.gap ? "text-red-600" : "text-emerald-600"}`}>{row.gap ? "Falta oferta" : "Suficiente"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section icon={Smartphone} title="Desde dónde entran" sub="Últimos 7 días">
          <div className="grid grid-cols-2 gap-3">
            <Stat label="Sitio web" value={insights.platform.web} sub={platformTotal > 0 ? `${100 - (nativeShare ?? 0)}%` : undefined} />
            <Stat label="App móvil" value={insights.platform.native} sub={platformTotal > 0 ? `${nativeShare ?? 0}%` : undefined} />
          </div>
        </Section>

        <Section icon={UserCheck} title="Profesionales" sub={`${fmt(pros.total)} registrados · ${fmt(pros.withSchedule)} con agenda`}>
          <Segmented parts={[
            { label: "Verificados", value: pros.verified, color: "#16a34a" },
            { label: "Pendientes", value: pros.pending, color: "#f59e0b" },
            { label: "Sin verificar", value: pros.unverified, color: "#94a3b8" },
            { label: "Rechazados", value: pros.rejected, color: "#ef4444" },
          ]} />
          <p className="mb-2 mt-4 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Por provincia</p>
          <Ranked items={pros.byProvince} color="#16a34a" />
        </Section>

        <Section icon={Headset} title="Soporte" sub={`${fmt(pendingTickets)} sin resolver`} action={<Link href="/admin/soporte" className="text-xs font-semibold text-[#008ce0] hover:underline">Soporte</Link>}>
          <Ranked items={support.byStatus} color="#7c3aed" />
        </Section>
      </div>
    </div>
  );
}
