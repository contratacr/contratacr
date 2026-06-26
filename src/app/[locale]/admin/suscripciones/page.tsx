import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { SubscriptionPanel } from "@/components/dashboard/pro/subscription-panel";
import { LAUNCH_BENEFITS, PAYMENTS_ENABLED, PRICES, formatColones } from "@/lib/payments/config";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

// Admin-only preview of the real professional-facing subscription page. Guarded
// by requireAdmin(), so regular users cannot reach it. While PAYMENTS_ENABLED is
// off this is the only place the subscription page is visible.
export default async function AdminSuscripcionesPage() {
  const admin = await requireAdmin();

  return (
    <AdminShell adminName={admin.fullName} active="suscripciones">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#111827]">Suscripciones (vista previa)</h1>
        <p className="mt-0.5 text-sm text-[#6b7280]">
          Así verá un profesional la página de suscripción cuando activemos los pagos.
        </p>
      </div>

      <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#bfdbfe] bg-[#EBF5FB] px-4 py-3 text-sm text-[#0f172a]">
        <Info className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
        <div>
          <p>
            Pagos {PAYMENTS_ENABLED ? <strong className="text-[#15803d]">ACTIVOS</strong> : <strong className="text-[#b45309]">INACTIVOS</strong>}.
            {" "}Mientras estén inactivos, ningún profesional ve esta página y todos conservan acceso completo gratis.
          </p>
          <p className="mt-1 text-[13px] text-[#374151]">
            Planes: <strong>{formatColones(PRICES.monthly)}/mes</strong> · <strong>{formatColones(PRICES.annual)}/año</strong> (pagas 10 meses y ahorras 2).
            {" "}Lanzamiento: {LAUNCH_BENEFITS.existingUsersFreeMonths} meses gratis para usuarios existentes y {LAUNCH_BENEFITS.earlyCollaboratorsFreeMonths} meses gratis para colaboradores iniciales.
            {" "}El cobro público será solo con tarjeta automática.
          </p>
        </div>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold text-[#111827]">Vista previa de la página del profesional</p>
        <div className="max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-4">
          <SubscriptionPanel />
        </div>
      </div>
    </AdminShell>
  );
}
