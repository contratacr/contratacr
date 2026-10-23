import { AdminContactBreakdown } from "./admin-contact-breakdown";
import { formatFullPersonName } from "@/lib/display-name";
import { AdminActivityJourney } from "./admin-activity-journey";
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

function Funnel({ steps }: { steps: { label: string; value: number; help: string }[] }) {
  const max = Math.max(1, ...steps.map((s) => s.value));
  return (
    <ol className="space-y-3">
      {steps.map((step) => {
        return (
          <li key={step.label} title={step.help}>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="font-semibold text-[#0f172a]">{step.label}</span>
              <span className="flex shrink-0 items-center gap-2 tabular-nums">
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
          <tbody className="divide-y divide-[#eef2f6]">
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
          <ul className="divide-y divide-[#eef2f6]">
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

function runtimeActionLabel(action: string) {
  const labels: Record<string, string> = {
    profile_view: "Vistas de perfiles", search_performed: "Búsquedas", whatsapp_click: "Clics a WhatsApp · todas las secciones",
    phone_click: "Clics en llamar · todas las secciones", email_click: "Correos · todas las secciones", internal_message_sent: "Mensajes enviados",
    quote_created: "Cotizaciones enviadas", project_published: "Proyectos publicados",
    project_lead_whatsapp: "Contactos a proyectos por WhatsApp", project_lead_phone: "Clics en llamar de proyectos",
    project_view: "Visitas a proyectos", review_created: "Reseñas",
    favorite_add: "Favoritos guardados", favorite_remove: "Favoritos retirados", profile_share: "Perfiles compartidos",
    job_view: "Vistas de empleos", job_application_sent: "Postulaciones", offer_view: "Vistas de promociones",
    assistant_question: "Preguntas al asistente", identity_verified: "Identidades verificadas",
    campaign_click: "Llegadas desde campañas", contact_gate_shown: "Intentos de contacto",
    external_link_click: "Enlaces externos", service_contact: "Contactos únicos a servicios",
    professional_profile_published: "Perfiles profesionales publicados", professional_project_contact: "Contactos únicos a proyectos",
    service_offer_published: "Promociones publicadas", employer_job_published: "Empleos publicados",
    page_freeze: "Bloqueos de pantalla", availability_view: "Disponibilidad consultada",
  };
  if (action.startsWith("conversion_")) return `${labels[action.slice(11)] ?? action.slice(11).replaceAll("_", " ")} · conversiones registradas`;
  return labels[action] ?? action.replaceAll("_", " ");
}

export function AdminAnalytics({ data }: { data: AdminReports }) {
  const { users, pros, support, insights } = data;
  const week = insights.week;
  const gateSince = insights.gateSince ? new Date(insights.gateSince).toLocaleDateString("es-CR", { day: "numeric", month: "short" }) : null;
  const pendingTickets = support.byStatus.filter((s) => s.label !== "Resuelto").reduce((sum, s) => sum + s.value, 0);

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <h1 className="text-2xl font-bold text-[#0f172a]">Analítica</h1>
        <p className="text-xs text-[#94a3b8]">
          {fmt(users.total)} cuentas · {fmt(users.pros)} profesionales ({fmt(users.verifiedPros)} verificados) · {fmt(users.clients)} clientes
        </p>
      </div>

      <AdminActivityJourney />
      <Section icon={Users} title="Servicios y empleos por separado" sub="Clics de contacto · WhatsApp, llamadas y correo">
        <AdminContactBreakdown data={data.contactBreakdown} />
      </Section>

      <Section icon={Users} title="Esta semana" sub="vs. los 7 días anteriores">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
          <Kpi label="Profesionales nuevos" data={week.pros} />
          <Kpi label="Clientes nuevos" data={week.clients} />
          <Kpi label="Búsquedas" data={week.searches} />
          <Kpi label="Contactos de servicios" data={week.contacts} help="Clics a WhatsApp, llamadas y correos desde servicios; excluye empleos y contextos sin identificar" />
          <Kpi label="Proyectos publicados" data={week.requests} help="Proyectos que publicaron los clientes en el tablero" />
          <Kpi label="Respuestas al tablero" data={week.projectLeads} help="Profesionales que le escribieron a un proyecto publicado" />
          <Kpi label="Cotizaciones" data={week.quotes} help="Cotizaciones que enviaron los profesionales" />
        </div>
      </Section>

      <Section icon={Megaphone} title="De dónde vienen los registros" sub="Por canal de origen">
        <Acquisition data={data.acquisition} />
      </Section>

      {/* El canal dice «google» o «meta», pero no dice POR DÓNDE entraron. Eso
          es lo que contesta si las páginas por oficio —hay 784, una por oficio
          y provincia— están trayendo gente o si todo llega por la portada. El
          dato ya se guardaba; no se estaba mirando. */}
      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={Search} title="Por dónde entraron" sub="Primera página de cada cuenta registrada">
          {data.acquisition.landings.length
            ? <Ranked items={data.acquisition.landings} color="#009FD9" />
            : <p className="text-sm text-[#94a3b8]">Todavía sin datos.</p>}
        </Section>
        <Section icon={Megaphone} title="De qué sitio venían" sub="El sitio que los mandó">
          {data.acquisition.referrers.length
            ? <Ranked items={data.acquisition.referrers} color="#16a34a" />
            : <p className="text-sm text-[#94a3b8]">Llegaron directo, sin sitio que los refiriera.</p>}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
        <Section icon={Search} title="Actividad de servicios" sub="Últimos 7 días · conteos independientes">
          <Funnel steps={[
            { label: "Búsquedas", value: insights.funnel.searches, help: "Buscaron un servicio o profesional" },
            { label: "Vistas de perfil", value: insights.funnel.profileViews, help: "Abrieron el perfil de un profesional" },
            { label: "Intentaron contactar", value: insights.funnel.contactAttempts, help: "Tocaron WhatsApp, llamar o correo — con cuenta o sin ella" },
            { label: "Abrieron un contacto", value: insights.funnel.contacts, help: "Se abrió WhatsApp, llamada o correo. No demuestra envío de mensaje, respuesta ni contratación" },
            { label: "Proyectos publicados", value: insights.funnel.requests, help: "Publicaron un proyecto en el tablero" },
            { label: "Respuestas al tablero", value: insights.funnel.projectLeads, help: "Profesionales que le escribieron a alguno de esos proyectos" },
          ]} />
          {insights.searchQuality.total > 0 && (
            <p className="mt-3 text-xs text-[#64748b]">
              <strong className={insights.searchQuality.empty > 0 ? "text-red-600" : "text-[#0f172a]"}>{pct(insights.searchQuality.empty, insights.searchQuality.total)}%</strong> de las búsquedas no encontraron a nadie
              <span className="text-[#94a3b8]"> ({fmt(insights.searchQuality.empty)} de {fmt(insights.searchQuality.total)})</span>
            </p>
          )}
          {insights.searchQuality.topEmpty.length > 0 && (
            <div className="mt-3">
              <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-[#94a3b8]">Buscaron y no había nadie</p>
              <ul className="divide-y divide-[#eef2f6]">
                {insights.searchQuality.topEmpty.map((row) => (
                  <li key={row.label} className="flex items-center justify-between gap-3 py-1.5 text-sm">
                    <span className="min-w-0 truncate text-[#334155]">{row.label}</span>
                    <span className="shrink-0 font-semibold tabular-nums text-[#0f172a]">{fmt(row.count)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {gateSince && (
            <p className="mt-3 text-xs text-[#64748b]">
              Los intentos de contacto se registran desde el <strong className="text-[#0f172a]">{gateSince}</strong>. Los pasos no representan las mismas personas ni una tasa de contratación.
            </p>
          )}
        </Section>

        <Section icon={MapPinned} title="Qué buscan vs. qué ofrecemos" sub="Últimos 30 días" action={<Link href="/admin/cobertura" className="text-xs font-semibold text-[#008ce0] hover:underline">Cobertura</Link>}>
          {insights.demand.length === 0 ? (
            <p className="text-sm text-[#94a3b8]">Sin datos</p>
          ) : (
            <ul className="divide-y divide-[#eef2f6]">
              {insights.demand.map((row) => (
                <li key={row.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                  <div className="min-w-0">
                    <p className="truncate font-semibold text-[#0f172a]">{row.label}</p>
                    <p className="text-[11px] text-[#94a3b8]">{row.searches} búsquedas · {row.projects} proyectos</p>
                  </div>
                  <div className="shrink-0 text-right">
                    <p className="text-sm tabular-nums text-[#0f172a]"><strong>{row.supply}</strong> <span className="text-xs text-[#64748b]">prof.</span></p>
                    <p className={`text-[11px] font-semibold ${row.gap ? "text-red-600" : "text-emerald-600"}`}>{row.gap ? "Revisar oferta" : "Oferta registrada"}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </Section>
      </div>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
        <Section icon={Smartphone} title="Uso de web y apps" sub="Últimos 7 días" className="lg:col-span-3">
          {!data.runtimeUsage ? <p className="text-sm text-[#64748b]">La medición de uso no está disponible. Intenta de nuevo más tarde.</p> : <>
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
              {data.runtimeUsage.rows.filter(row => ["web_desktop", "web_mobile", "android", "ios"].includes(row.runtime) || row.sessions > 0 || row.visitors > 0 || row.registrations > 0 || Object.keys(row.actions).length > 0).map(row => (
                <div key={row.runtime} className="rounded-xl border border-[#e5e7eb] p-4" data-testid={`analytics-runtime-${row.runtime}`}>
                  <h3 className="mb-3 text-sm font-bold">{{ web_desktop: "Web en computadora", web_mobile: "Web móvil", web: "Web sin dispositivo identificado", android: "App Android", ios: "App iOS", native_unknown: "App móvil sin sistema identificado", unknown: "Sin plataforma identificada" }[row.runtime] ?? row.runtime}</h3>
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-xs">
                    {[["Visitantes", row.visitors], ["Usuarios con cuenta", row.users], ["Sesiones", row.sessions], ["Accesos con cuenta", row.accesses], ["Pantallas vistas", row.screens], ["Registros nuevos", row.registrations], ...(["android", "ios", "native_unknown"].includes(row.runtime) ? [["Primeros usos detectados", row.first_uses]] : [])].map(([label, value]) => <div key={label}><dt className="text-[#64748b]">{label}</dt><dd className="mt-1 text-xl font-bold tabular-nums">{fmt(Number(value))}</dd></div>)}
                  </dl>
                  <details className="mt-4 border-t border-[#e5e7eb] pt-3">
                    <summary className="min-h-11 cursor-pointer py-2 text-xs font-semibold text-[#009dca]">Ver acciones y pantallas</summary>
                    <ul className="space-y-2 text-xs">{Object.entries(row.actions).map(([action, count]) => <li key={action} className="flex justify-between gap-3"><span>{runtimeActionLabel(action)}</span><strong>{fmt(count)}</strong></li>)}</ul>
                    {row.recent_accounts.length > 0 && <><p className="mb-2 mt-4 font-semibold text-xs">Cuentas con actividad reciente</p><ul className="space-y-2 text-xs">{row.recent_accounts.map(account => <li key={account.id} className="flex justify-between gap-3"><Link href={`/admin/usuarios/${account.id}`} className="min-w-0 break-words font-semibold text-[#009dca]">{formatFullPersonName(account.full_name) || "Usuario"}</Link><span className="shrink-0 text-[#64748b]">{new Date(account.last_seen).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" })} · {fmt(account.sessions)} ses.</span></li>)}</ul></>}
                    {row.top_screens.length > 0 && <><p className="mb-2 mt-4 font-semibold text-xs">Pantallas más visitadas</p><ul className="space-y-2 text-xs">{row.top_screens.map(screen => <li key={`${screen.path}:${screen.tab}`} className="flex justify-between gap-3"><span className="min-w-0 break-all">{screen.path}{screen.tab ? ` · ${screen.tab}` : ""}</span><strong>{fmt(screen.views)}</strong></li>)}</ul></>}
                  </details>
                </div>
              ))}
            </div>
            <p className="mt-4 text-xs leading-relaxed text-[#64748b]">Web móvil incluye celulares y tabletas. Los accesos agregados a inicio desde el navegador cuentan como web, según el dispositivo. App Android y App iOS corresponden a las aplicaciones nativas; App iOS incluye iPhone y iPad. Las sesiones terminan tras 30 minutos sin actividad. Visitantes cuenta dispositivos/navegadores; usuarios con cuenta cuenta personas identificadas en cada plataforma. Una persona puede usar varias plataformas. Primer uso detectado no equivale a descarga: las descargas se consultan en las tiendas. La medición nueva empieza {data.runtimeUsage.since ? new Date(data.runtimeUsage.since).toLocaleDateString("es-CR", { timeZone: "America/Costa_Rica" }) : "al activar el seguimiento"}; el histórico sin plataforma o dispositivo se conserva por separado.</p>
          </>}
        </Section>

        <Section icon={UserCheck} title="Profesionales" sub={`${fmt(pros.total)} registrados · ${fmt(pros.withServices)} con servicios publicados`}>
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
