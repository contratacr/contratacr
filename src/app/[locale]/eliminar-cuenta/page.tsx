import { ArrowRight, CheckCircle2, Headset, ShieldCheck, Trash2 } from "lucide-react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Link } from "@/i18n/navigation";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createClient } from "@/lib/supabase/server";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? {
        title: "Delete account - ContrataCR",
        description: "Delete or disable your ContrataCR account from Account and security.",
      }
    : {
        title: "Eliminar cuenta - ContrataCR",
        description: "Elimina o deshabilita tu cuenta de ContrataCR desde Cuenta y seguridad.",
      };
}

export default async function DeleteAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  const supabase = await createClient();
  const user = await safeGetUser(supabase);

  const accountSecurityHref = "/dashboard/profesional?tab=cuenta";
  const supportSubject = en ? "Account access for deletion" : "Acceso a mi cuenta para eliminación";
  const supportMessage = en
    ? "Hello ContrataCR support,\n\nI cannot access my account and need help recovering access or processing my deletion request.\n\nEmail linked to the account:\nReason:"
    : "Hola soporte de ContrataCR,\n\nNo puedo entrar a mi cuenta y necesito ayuda para recuperar el acceso o procesar mi solicitud de eliminación.\n\nCorreo vinculado a la cuenta:\nMotivo:";
  const supportQuery = `topic=subject1&subject=${encodeURIComponent(supportSubject)}&message=${encodeURIComponent(supportMessage)}`;
  const supportHref = user
    ? `/dashboard/profesional?tab=soporte&newSupport=1&${supportQuery}`
    : `/soporte?${supportQuery}`;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 px-4 pb-16 pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl">
          <header className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fd] text-[#0089bb]">
              <Trash2 className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-3xl font-black text-[#162543] sm:text-4xl">
              {en ? "Delete or disable your account" : "Eliminar o deshabilitar tu cuenta"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-[#6b7280]">
              {en
                ? "If you can sign in, manage this directly from Account and security. Support is only for people who cannot access their account."
                : "Si puedes iniciar sesión, hazlo directamente desde Cuenta y seguridad. Soporte queda solo para quienes no pueden entrar a su cuenta."}
            </p>
          </header>

          <section className="mt-8 rounded-xl border border-[#dfe5eb] bg-white p-5 shadow-sm sm:p-7">
            <div className="rounded-lg border border-[#d8e9f2] bg-[#f4faff] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0089bb]" />
                <div>
                  <h2 className="text-sm font-bold text-[#162543]">
                    {en ? "From Account and security" : "Desde Cuenta y seguridad"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#526277]">
                    {en
                      ? "There you can disable your account if you may return later, or permanently delete it automatically if you want to close it for good."
                      : "Ahí puedes deshabilitar tu cuenta si podrías volver después, o eliminarla permanentemente de forma automática si quieres cerrarla por completo."}
                  </p>
                </div>
              </div>
            </div>

            <ol className="mt-6 space-y-3 text-sm text-[#4b5563]">
              {[
                en ? "Sign in to your ContrataCR account." : "Inicia sesión en tu cuenta de ContrataCR.",
                en ? "Open Account and security." : "Abre Cuenta y seguridad.",
                en ? "Choose Disable account or Delete account." : "Elige Deshabilitar cuenta o Eliminar cuenta.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#009FD9]" />
                  <span>{item}</span>
                </li>
              ))}
            </ol>

            <Link
              href={accountSecurityHref}
              className="mt-7 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#009FD9] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]"
            >
              {en ? "Go to Account and security" : "Ir a Cuenta y seguridad"}
              <ArrowRight className="h-4 w-4" />
            </Link>

            <div className="mt-6 rounded-lg border border-[#e5e7eb] bg-white p-4">
              <div className="flex items-start gap-3">
                <Headset className="mt-0.5 h-5 w-5 shrink-0 text-[#0089bb]" />
                <div>
                  <h2 className="text-sm font-bold text-[#162543]">
                    {en ? "Can't sign in?" : "¿No puedes iniciar sesión?"}
                  </h2>
                  <p className="mt-1 text-sm leading-6 text-[#526277]">
                    {en
                      ? "Open a support case only if you cannot access your panel. We'll help verify your identity first."
                      : "Abre un caso de soporte solo si no puedes entrar al panel. Primero te ayudamos a confirmar tu identidad."}
                  </p>
                </div>
              </div>
              <Link
                href={supportHref}
                className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-[#cfe7f2] bg-[#f5fbfe] px-5 text-sm font-bold text-[#0089bb] transition-colors hover:border-[#009FD9]/50 hover:bg-[#eaf7fd]"
              >
                {en ? "Open support case" : "Abrir caso de soporte"}
                <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </section>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
