import { requireAdmin } from "@/lib/auth/admin";
import { AdminShell } from "@/components/admin/admin-shell";
import { AdminUserProfile } from "@/components/admin/admin-user-profile";

export const dynamic = "force-dynamic";

export default async function AdminUserDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ from?: string }>;
}) {
  const admin = await requireAdmin();
  const { id } = await params;
  const { from } = await searchParams;
  const fromVerification = from === "verificacion";
  return (
    <AdminShell adminName={admin.fullName} active={fromVerification ? "verificacion" : "usuarios"}>
      <AdminUserProfile
        userId={id}
        backHref={fromVerification ? "/admin/verificacion" : "/admin/usuarios"}
        backLabel={fromVerification ? "Volver a verificación" : "Búsqueda de usuarios"}
      />
    </AdminShell>
  );
}
