import type { AdminReports } from "@/lib/admin/reports";
const fmt = (n: number) => n.toLocaleString("es-CR");
export function AdminContactBreakdown({data}:{data:AdminReports["contactBreakdown"]}) {
  return <>
        {!data ? <p className="text-sm text-[#64748b]">No se pudo cargar el desglose de contactos.</p> : <>
          <div className="overflow-x-auto"><table className="w-full text-sm" data-testid="admin-contact-segments">
            <thead><tr className="text-left text-xs text-[#64748b]"><th className="py-2 pr-3">Actividad</th><th className="px-3 py-2 text-right">7 días</th><th className="px-3 py-2 text-right">30 días</th><th className="px-3 py-2 text-right">Pares únicos · 30 días</th></tr></thead>
            <tbody className="divide-y divide-[#eef2f6]">{([['services','Servicios'],['jobs','Empleos'],['projects','Profesionales a proyectos'],['unknown','Sin contexto suficiente']] as const).map(([key,label]) => <tr key={key} data-contact-segment={key}><th scope="row" className="py-2 pr-3 text-left font-semibold">{label}</th><td className="px-3 py-2 text-right tabular-nums">{fmt(data!.last7[key].clicks)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(data!.last30[key].clicks)}</td><td className="px-3 py-2 text-right tabular-nums">{fmt(data!.last30[key].uniquePairs)}</td></tr>)}</tbody>
          </table></div>
          <p className="mt-3 text-xs text-[#64748b]">Un par es una cuenta o identificador de visita con un destinatario durante el período. No equivale a una persona verificada ni a un trabajo contratado. Los mensajes internos y las promociones sin tipo identificado quedan fuera de los contactos de servicios.</p>
          <div className="mt-4 rounded-xl bg-[#f1f5f9] p-3"><p className="text-xs font-semibold text-[#475569]">Contrataciones de servicios declaradas · 30 días</p><p className="mt-1 text-2xl font-bold" data-testid="admin-declared-hires">{data.declaredHires30 === null ? 'No disponible' : fmt(data.declaredHires30)}</p><p className="mt-1 text-xs text-[#64748b]">Confirmación del cliente registrada en el seguimiento. No verifica pago ni finalización. No se infiere de clics, reseñas generales ni del envío de eventos a Meta.</p></div>
        </>}
  </>;
}
