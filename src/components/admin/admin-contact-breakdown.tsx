import type { AdminReports } from "@/lib/admin/reports";
const fmt = (n: number) => n.toLocaleString("es-CR");
const segments = [['services','Servicios'],['jobs','Empleos'],['projects','Profesionales a proyectos'],['unknown','Sin contexto suficiente']] as const;
export function AdminContactBreakdown({ data }: { data: AdminReports["contactBreakdown"] }) {
  if (!data) return <p className="text-sm text-[#64748b]">No se pudo cargar el desglose de contactos.</p>;
  const current = data.allTime ?? data.last7;
  const label = data.allTime ? 'Todo el tiempo disponible' : 'Últimos 7 días';
  const hires = data.allTime ? data.declaredHiresAll : data.declaredHires7;
  return <div className="space-y-5">
    <p className="text-sm font-semibold text-[#475569]">{label}</p>
    <div className="grid gap-3 sm:grid-cols-2" data-testid="admin-contact-segments">
      {segments.map(([key,title]) => <div key={key} data-contact-segment={key} className="rounded-xl border border-[#e5e7eb] p-4">
        <h3 className="text-sm font-semibold text-[#162543]">{title}</h3>
        <dl className="mt-3 grid grid-cols-2 gap-3"><div><dt className="text-xs text-[#64748b]">Clics de contacto</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#162543]">{fmt(current[key].clicks)}</dd></div><div><dt className="text-xs text-[#64748b]">Pares únicos</dt><dd className="mt-1 text-2xl font-bold tabular-nums text-[#162543]">{fmt(current[key].uniquePairs)}</dd></div></dl>
      </div>)}
    </div>
    <p className="text-xs leading-relaxed text-[#64748b]">Un par es una cuenta o identificador de visita con un destinatario durante el período. No equivale a una persona verificada ni a un trabajo contratado. Los mensajes internos y las promociones sin tipo identificado quedan fuera de los contactos de servicios.</p>
    <div className="rounded-xl bg-[#eef9fd] p-4"><p className="text-sm font-semibold text-[#162543]">Contrataciones declaradas · {label.toLowerCase()}</p><p className="mt-2 text-3xl font-bold text-[#162543]" data-testid="admin-declared-hires">{hires == null ? 'No disponible' : fmt(hires)}</p><p className="mt-2 text-xs leading-relaxed text-[#475569]">Confirmación del cliente registrada en el seguimiento. No verifica pago ni finalización. No se infiere de clics, reseñas ni del envío de eventos a Meta.</p></div>
    <details className="rounded-xl border border-[#e5e7eb] p-4"><summary className="cursor-pointer text-sm font-semibold text-[#162543]">Comparar últimos 7 y 30 días</summary><div className="mt-3 overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="text-xs text-[#64748b]"><th className="py-2 pr-3">Actividad</th><th className="px-3 py-2 text-right">7 días</th><th className="px-3 py-2 text-right">30 días</th></tr></thead><tbody className="divide-y divide-[#eef2f6]">{segments.map(([key,title])=><tr key={key}><th className="py-3 pr-3 font-medium">{title}</th><td className="px-3 py-3 text-right tabular-nums">{fmt(data.last7[key].clicks)}</td><td className="px-3 py-3 text-right tabular-nums">{fmt(data.last30[key].clicks)}</td></tr>)}</tbody></table></div></details>
  </div>;
}
