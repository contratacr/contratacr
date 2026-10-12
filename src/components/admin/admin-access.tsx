import { getLocale } from "next-intl/server";
import { ShieldAlert } from "lucide-react";
import { getAdminAccess } from "@/lib/auth/admin";
import { Link } from "@/i18n/navigation";
import { AdminLogin } from "./admin-login";

// This is a server component: hiding controls in the browser never grants access.
export async function AdminAccess() {
  const access = await getAdminAccess();
  if (!access.authenticated) return <AdminLogin />;
  const en = (await getLocale()) === "en";

  return (
    <main className="flex min-h-[70dvh] items-center justify-center px-4 py-12">
      <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 text-center">
        <ShieldAlert aria-hidden="true" className="mx-auto mb-5 h-12 w-12 text-[#009FD9]" />
        <h1 className="text-2xl font-bold text-[#162543]">
          {en ? "Access restricted" : "Acceso restringido"}
        </h1>
        <p className="mt-3 text-slate-600">
          {en
            ? "You do not have permission to access this section. It is available only to ContrataCR administrators."
            : "No tienes permisos para acceder a esta sección. Está disponible solo para administradores de ContrataCR."}
        </p>
        <Link href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 font-semibold text-white hover:bg-[#0089bb]">
          {en ? "Back to home" : "Volver al inicio"}
        </Link>
      </div>
    </main>
  );
}
