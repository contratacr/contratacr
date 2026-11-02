import type { MeasurementReport } from "@/lib/analytics/measurement-report";
const fmt = (value: number) => value.toLocaleString("es-CR");
const card = "rounded-xl border border-[#e5e7eb] p-3";
export function AdminMeasurement({ data }: { data: MeasurementReport }) {
  return <div className="space-y-5" data-testid="admin-measurement">
    <p className="text-sm text-[#475569]">Los registros del servicio, las señales con consentimiento y la atribución de Meta son medidas distintas. No se suman ni representan contrataciones.</p>
    <div>
      <h3 className="mb-2 text-sm font-bold">Mensajes reales en ContrataCR · {data.period === "week" ? "últimos 7 días" : "histórico conservado"}</h3>
      {data.operations ? <dl className="grid gap-3 sm:grid-cols-3">
        {[["Conversaciones con mensajes del cliente", data.operations.conversations], ["Mensajes enviados por clientes", data.operations.clientMessages], ["De esas conversaciones, vinculadas a proyectos", data.operations.projectConversations]].map(([label, value]) => <div className={card} key={label}><dt className="text-xs text-[#64748b]">{label}</dt><dd className="mt-1 text-2xl font-bold">{fmt(Number(value))}</dd></div>)}
      </dl> : <p role="status">Registros de mensajes no disponibles.</p>}
      <p className="mt-2 text-xs text-[#64748b]">Se cuentan mensajes guardados, no aperturas del chat. Cada conversación cuenta una vez por período; puede incluir conversaciones anteriores que continuaron. No se lee el contenido. Su origen publicitario no está vinculado: no se atribuyen a campañas.</p>
    </div>
    <div>
      <h3 className="mb-2 text-sm font-bold">Señales de contacto por campaña</h3>
      {data.campaigns === null ? <p role="status">Señales de campaña no disponibles.</p> : data.campaigns.length ? <div className="overflow-x-auto"><table className="w-full text-left text-xs"><thead><tr>{["Campaña / origen", "Señales", "Recibidas por Meta (servidor)", "En cola", "Sin entrega confirmada", "Pruebas excluidas"].map(label => <th key={label} className="p-2">{label}</th>)}</tr></thead><tbody>{data.campaigns.map(row => <tr key={row.campaign} className="border-t border-[#e5e7eb]"><td className="max-w-64 break-words p-2">{row.campaign}</td>{[row.signals, row.received, row.pending, row.other, row.tests].map((value, i) => <td key={i} className="p-2 tabular-nums">{fmt(value)}</td>)}</tr>)}</tbody></table></div> : <p className="text-sm text-[#64748b]">Sin señales de contacto registradas en este período.</p>}
      <p className="mt-2 text-xs text-[#64748b]">Son eventos Contact con permiso: abrir WhatsApp, llamada o correo no confirma una conversación. El sistema agrupa por persona/profesional/día; no son personas únicas de toda la campaña. Una recepción del servidor de Meta no confirma atribución al anuncio. Los envíos de prueba se excluyen.</p>
      <p className="mt-2 text-xs text-[#64748b]">Contactos atribuidos y costo por contacto: revisar en el Administrador de anuncios. No están sincronizados con este panel. No se calcula una tasa cruzando estos eventos con las conversaciones internas.</p>
    </div>
    <div>
      <h3 className="mb-2 text-sm font-bold">Elecciones explícitas guardadas por cuenta · últimos 180 días</h3>
      {data.consent ? <dl className="grid gap-3 sm:grid-cols-2">{([['analytics', 'Estadísticas'], ['advertising', 'Publicidad']] as const).map(([key, label]) => <div key={key} className={card}><dt className="text-sm font-semibold">{label}</dt><dd className="mt-1 text-sm">Aceptaron: {fmt(data.consent![key].accepted)} · Rechazaron: {fmt(data.consent![key].declined)}</dd></div>)}</dl> : <p role="status">Recibos de preferencias no disponibles.</p>}
      <p className="mt-2 text-xs text-[#64748b]">Última elección explícita conservada por cuenta y finalidad, en la versión vigente. No incluye visitantes sin cuenta ni todas las decisiones de dispositivos; no es el porcentaje de visitantes que acepta cookies ni habilita seguimiento. La ausencia de recibo no equivale a rechazo.</p>
    </div>
  </div>;
}
