import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { SubscriptionPanel } from "@/components/dashboard/pro/subscription-panel";
import { PAYMENTS_ENABLED, PRICES, formatColones } from "@/lib/payments/config";
import { Info } from "lucide-react";

export const dynamic = "force-dynamic";

// ADMIN-ONLY preview of the real professional-facing subscription page. Guarded by
// requireAdmin() (redirects non-admins to the admin login), so a regular user
// cannot reach it even by typing the URL. While PAYMENTS_ENABLED is off this is the
// ONLY place the subscription page is visible — no professional sees it yet.
export default async function AdminSuscripcionesPage() {
  const admin = await requireAdmin();

  return (
    <AdminShell adminName={admin.fullName} active="suscripciones">
      <div className="mb-5">
        <h1 className="text-xl font-bold text-[#111827]">Suscripciones (vista previa)</h1>
        <p className="text-sm text-[#6b7280] mt-0.5">
          Así verá un profesional la página de suscripción cuando activemos los pagos.
        </p>
      </div>

      {/* Status banner: what's live and what isn't. */}
      <div className="mb-5 flex items-start gap-2 rounded-xl border border-[#bfdbfe] bg-[#EBF5FB] px-4 py-3 text-sm text-[#0f172a]">
        <Info className="h-4 w-4 text-[#009FD9] shrink-0 mt-0.5" />
        <div>
          <p>
            Pagos {PAYMENTS_ENABLED ? <strong className="text-[#15803d]">ACTIVOS</strong> : <strong className="text-[#b45309]">INACTIVOS</strong>}.
            {" "}Mientras estén inactivos, ningún profesional ve esta página y todos conservan acceso completo gratis.
          </p>
          <p className="mt-1 text-[13px] text-[#374151]">
            Planes: <strong>{formatColones(PRICES.monthly)}/mes</strong> · <strong>{formatColones(PRICES.annual)}/año</strong> (2 meses gratis).
            Para registrar un pago por SINPE o gestionar la suscripción de un profesional específico, ve a
            {" "}<strong>Usuarios</strong> → abre el profesional → sección <strong>Suscripción</strong>.
          </p>
        </div>
      </div>

      {/* The REAL pro-facing component, rendered here for preview. */}
      <div className="max-w-xl rounded-2xl border border-[#e5e7eb] bg-white p-4">
        <SubscriptionPanel />
      </div>
    </AdminShell>
  );
}
