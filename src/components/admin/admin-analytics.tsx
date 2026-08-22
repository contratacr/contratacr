import { ArrowDownRight, ArrowUpRight, Headset, MapPinned, Minus, Search, Smartphone, UserCheck, Users } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { AdminReports, Count, WeekCompare } from "@/lib/admin/reports";

// Analítica reads like a weekly note from an analyst, not a dashboard of
// charts: what changed this week, where people drop off on their way to a
// hire, which services are asked for more than we can serve, and where the
// traffic comes from. Every number has a plain label and a comparison.

function Section({ icon: Icon, title, sub, children, action }: { icon: typeof Users; title: string; sub?: string; children: React.ReactNode; action?: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-[#e5e7eb] bg-white p-4 sm:p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-[#f1f5f9] text-[#0f172a]"><Icon className="h-4 w-4" /></span>
          <div>
            <h2 className="text-sm font-bold text-[#0f172a]">{title}</h2>
            {sub && <p className="text-xs text-[#94a3b8]">{sub}</p>}
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function Compare({ label, data, help }: { label: string; data: WeekCompare; help?: string }) {
  const diff = data.now - data.prev;
  const Icon = diff > 0 ? ArrowUpRight : diff < 0 ? ArrowDownRight : Minus;
  const tone = diff > 0 ? "text-emerald-600" : diff < 0 ? "text-red-500" : "text-[#94a3b8]";
  return (
    <div className="rounded-xl border border-[#e5e7eb] bg-white p-3">
      <p className="text-xs font-medium text-[#64748b]">{label}</p>
      <p className="mt-1 text-3xl font-bold leading-none tabular-nums text-[#0f172a]">{data.now.toLocaleString("es-CR")}</p>
      <p className={`mt-1.5 inline-flex items-center gap-1 text-[11px] font-semibold ${tone}`}>
        <Icon className="h-3 w-3" />
        {diff === 0 ? "igual que la semana anterior" : `${diff > 0 ? "+" : ""}${diff.toLocaleString("es-CR")} · semana anterior: ${data.prev.toLocaleString("es-CR")}`}
      </p>
      {help && <p className="mt-1 text-[11px] text-[#94a3b8]">{help}</p>}
    </div>
  );
}

function pct(part: number, whole: number) {
  if (whole <= 0) return null;
  return Math.round((part / whole) * 100);
}

function Funnel({ steps }: { steps: { label: string; value: number; help: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3">
      {steps.map((step, index) => {
        const previous = index > 0 ? steps[index - 1].value : null;
        const rate = previous != null ? pct(step.value, previous) : null;
        return (
          <li key={step.label}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#0f172a]">{index + 1}. {step.label}</span>
              <span className="shrink-0 tabular-nums">
                <span className="font-bold text-[#0f172a]">{step.value.toLocaleString("es-CR")}</span>
                {rate != null && (
                  <span className="ml-2 text-xs font-semibold text-[#64748b]">{rate > 100 ? "más que el paso anterior" : `${rate}% del paso anterior`}</span>
                )}
              </span>
            </div>
            <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-[#f1f5f9]">
              <div className="h-full rounded-full bg-[#009FD9]" style={{ width: `${(step.value / max) * 100}%` }} />
            </div>
            <p className="mt-1 text-[11px] text-[#94a3b8]">{step.help}</p>
          </li>
        );
      })}
    </ol>
  );
}

function Segmented({ parts }: { parts: { label: string; value: number; color: string }[] }) {
  const total = parts.reduce((a, p) => a + p.value, 0);
  if (total === 0) return <p className="text-sm text-[#94a3b8]">Sin datos aún</p>;
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

function Ranked({ items, color }: { items: Count[]; color: string }) {
  if (items.length === 0) return <p className="text-sm text-[#94a3b8]">Sin datos aún</p>;
  const max = Math.max(1, ...items.map((i) => i.value));
  return (
    <div className="flex flex-col gap-2.5">
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

export function AdminAnalytics({ data }: { data: AdminReports }) {
  const { users, pros, activity, support, insights } = data;
  const week = insights.week;
  const platformTotal = insights.platform.web + insights.platform.native;
  const nativeShare = pct(insights.platform.native, platformTotal);
  const respRate = activity.solicitudesTotal > 0 ? Math.round((activity.solicitudesResponded / activity.solicitudesTotal) * 100) : 0;
  const trackingSince = insights.tracking.since ? new Date(insights.tracking.since).toLocaleDateString("es-CR", { day: "numeric", month: "short", year: "numeric" }) : null;
  const pendingTickets = support.byStatus.filter((s) => s.label !== "Resuelto").reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div>
        <h1 className="text-2xl font-bold text-[#0f172a]">Analítica</h1>
        <p className="mt-0.5 text-sm text-[#64748b]">Qué pasó esta semana, dónde se pierde la gente antes de contratar y qué servicios faltan. Comparado con los 7 días anteriores.</p>
      </div>

      <Section icon={Users} title="Esta semana" sub="Últimos 7 días, comparados con los 7 anteriores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Compare label="Profesionales nuevos" data={week.pros} />
          <Compare label="Clientes nuevos" data={week.clients} />
          <Compare label="Búsquedas" data={week.searches} help={trackingSince ? `Se registran desde el ${trackingSince}` : "Se registran desde hoy"} />
          <Compare label="Contactos a profesionales" data={week.contacts} help="WhatsApp, llamadas, enlaces y solicitudes iniciadas" />
          <Compare label="Solicitudes y proyectos" data={week.requests} help="Creados por clientes" />
          <Compare label="Postulaciones a empleos" data={week.applications} />
        </div>
        <p className="mt-3 text-xs text-[#64748b]">
          En total hay <strong className="text-[#0f172a]">{users.total.toLocaleString("es-CR")}</strong> cuentas: {users.pros.toLocaleString("es-CR")} profesionales ({users.verifiedPros.toLocaleString("es-CR")} verificados) y {users.clients.toLocaleString("es-CR")} clientes, de los cuales {users.activeClients.toLocaleString("es-CR")} ya enviaron al menos una solicitud.
        </p>
      </Section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={Search} title="Del interés a la contratación" sub="Últimos 7 días · cada paso muestra qué porcentaje del anterior llegó hasta ahí">
          <Funnel steps={[
            { label: "Búsquedas", value: insights.funnel.searches, help: "Personas que buscaron un servicio o profesional." },
            { label: "Vistas de perfil", value: insights.funnel.profileViews, help: "Abrieron el perfil de un profesional." },
            { label: "Contactos", value: insights.funnel.contacts, help: "Tocaron WhatsApp, llamar, un enlace o empezaron una solicitud." },
            { label: "Solicitudes y proyectos creados", value: insights.funnel.requests, help: "Pidieron un servicio o publicaron un proyecto." },
          ]} />
          <p className="mt-3 text-xs text-[#64748b]">
            De todas las solicitudes históricas, los profesionales atendieron el <strong className="text-[#0f172a]">{respRate}%</strong> ({activity.solicitudesResponded.toLocaleString("es-CR")} de {activity.solicitudesTotal.toLocaleString("es-CR")}).
          </p>
        </Section>

        <Section icon={MapPinned} title="Qué buscan vs. qué ofrecemos" sub="Últimos 30 días · servicios más pedidos y cuántos profesionales los dan" action={<Link href="/admin/cobertura" className="text-xs font-semibold text-[#008ce0] hover:underline">Ver cobertura</Link>}>
          {insights.demand.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Todavía no hay búsquedas ni proyectos con servicio registrados en este período.</p>
          ) : (
            <ul className="divide-y divide-[#f1f5f9]">
              {insights.demand.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0f172a]">{row.label}</p>
                    <p className="text-[11px] text-[#94a3b8]">{row.searches} búsquedas · {row.projects} proyectos</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-xs text-[#64748b]"><strong className="text-[#0f172a]">{row.supply}</strong> profesionales</p>
                    <p className={`text-[11px] font-semibold ${row.gap ? "text-red-600" : "text-emerald-600"}`}>{row.gap ? "Falta oferta" : "Oferta suficiente"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section icon={Smartphone} title="Desde dónde entran" sub="Acciones de los últimos 7 días">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-xl border border-[#e5e7eb] p-3">
              <p className="text-xs text-[#64748b]">Sitio web</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#0f172a]">{insights.platform.web.toLocaleString("es-CR")}</p>
            </div>
            <div className="rounded-xl border border-[#e5e7eb] p-3">
              <p className="text-xs text-[#64748b]">App móvil</p>
              <p className="mt-1 text-2xl font-bold tabular-nums text-[#0f172a]">{insights.platform.native.toLocaleString("es-CR")}</p>
            </div>
          </div>
          <p className="mt-3 text-xs text-[#64748b]">
            {platformTotal === 0 ? "Aún no hay acciones registradas esta semana." : nativeShare === 0 ? "Todo el uso de esta semana vino del sitio web." : `El ${nativeShare}% del uso de esta semana vino de la app.`}
          </p>
        </Section>

        <Section icon={UserCheck} title="Profesionales" sub={`${pros.total.toLocaleString("es-CR")} registrados · ${pros.withSchedule.toLocaleString("es-CR")} con agenda publicada`}>
          <Segmented parts={[
            { label: "Verificados", value: pros.verified, color: "#16a34a" },
            { label: "Pendientes", value: pros.pending, color: "#f59e0b" },
            { label: "Sin verificar", value: pros.unverified, color: "#94a3b8" },
            { label: "Rechazados", value: pros.rejected, color: "#ef4444" },
          ]} />
          <p className="mb-2 mt-4 text-xs font-semibold text-[#334155]">Por provincia (sede)</p>
          <Ranked items={pros.byProvince} color="#16a34a" />
        </Section>

        <Section icon={Headset} title="Soporte" sub={`${pendingTickets.toLocaleString("es-CR")} tickets sin resolver`} action={<Link href="/admin/soporte" className="text-xs font-semibold text-[#008ce0] hover:underline">Ir a soporte</Link>}>
          <Ranked items={support.byStatus} color="#7c3aed" />
        </Section>
      </div>
    </div>
  );
}
