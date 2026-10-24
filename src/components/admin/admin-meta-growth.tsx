"use client";
import { useEffect,useState } from "react";
import { GROWTH_ACTIONS } from "@/lib/analytics/growth-contract";
import type { summarizeGrowth } from "@/lib/analytics/growth-report";
type Report = ReturnType<typeof summarizeGrowth> & { month: string; capiConfigured: boolean; testMode: boolean };
const names: Record<keyof typeof GROWTH_ACTIONS,string> = {
 service_contact: "Clics de contacto de servicios",project_published: "Proyectos publicados",service_hire_confirmed: "Contrataciones confirmadas por el cliente",
 professional_profile_published: "Perfiles profesionales utilizables",professional_project_contact: "Profesionales que contactaron proyectos",
 professional_project_accepted: "Proyectos con cotización aceptada",service_offer_published: "Promociones de servicios publicadas",employer_job_published: "Empleos publicados",
};
export function AdminMetaGrowth() {
 const [report,setReport] = useState<Report | null>(null);const [error,setError] = useState("");
 useEffect(() => { let alive=true;void fetch("/api/admin/meta-growth").then(async res => { const data=await res.json();if(!res.ok)throw new Error(data.error);if(alive)setReport(data); }).catch(e=>{if(alive)setError(String(e.message));});return()=>{alive=false;}; },[]);
 return <section className="rounded-2xl border border-[#d7e1ea] bg-white p-5 space-y-3">
  <h2 className="font-bold text-[#162543]">Publicidad Meta: resultados y presupuesto</h2>
  <p className="text-sm text-[#68778d]">Prueba: hasta US$14 en siete días, dentro del saldo mensual. Techo mensual: US$20 en anuncios. El límite debe configurarse también en Meta; este panel no activa ni detiene anuncios.</p>
  {error && <p role="alert" className="text-sm text-amber-800">{error}</p>}
  {report && <>
   <p className="text-sm">{report.month}: US${report.recordedAdsUsd.toFixed(2)} registrados en Costos · US${report.remainingMonthlyUsd.toFixed(2)} disponibles hasta el techo. Concilia estos importes con Ads Manager.</p>
   <p className="text-sm">Máximo disponible para la prueba: US${report.maximumTestUsd.toFixed(2)}.</p>
   {report.spendNeedsReconciliation && <p role="alert" className="text-sm text-amber-800">Meta ya reportó US${report.auditedAdsUsd.toFixed(2)} en octubre. Falta conciliarlo con Costos. Ese gasto ya se descuenta del saldo; no es una confirmación de pago.</p>}
   {report.overMonthlyCeiling && <p role="alert" className="text-red-700">El gasto registrado supera el techo mensual. Revisa y pausa la campaña en Meta.</p>}
   <p className="text-sm">CAPI directa del servidor: {report.capiConfigured ? report.testMode ? "modo de pruebas" : "configurada" : "apagada"}. Entregados a producción: {report.productionSent} · de prueba: {report.testSent} · pendientes directos: {report.delivery.pending+report.delivery.sending} · excluidos de Meta: {report.delivery.suppressed} · vencidos: {report.delivery.expired}.</p>
   <p className="text-xs text-[#68778d]">{report.delivery.browser_only} acciones preparadas para Pixel/conexión web existente. Su recepción se comprueba en Events Manager. Los contadores de entrega de arriba corresponden únicamente al envío directo propio.</p>
   <div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr><th>Resultado</th><th>Campaña</th><th>Acciones</th><th>Personas/dispositivos</th></tr></thead><tbody>{report.results.map(row=><tr key={`${row.action}:${row.campaign}`}><td className="py-2">{names[row.action as keyof typeof names] ?? row.action}</td><td>{row.campaign}</td><td>{row.actions}</td><td>{row.people}</td></tr>)}</tbody></table></div>
   <p className="text-xs text-[#68778d]">Los clics en WhatsApp, llamadas o correo no son contrataciones. Las contrataciones se registran por separado cuando el cliente confirma que contrató; no verifican pago ni finalización. Una persona puede usar varios dispositivos; la atribución de campaña no demuestra causalidad. Los empleos y productos quedan fuera de contactos de servicios.</p>
  </>}
 </section>;
}
