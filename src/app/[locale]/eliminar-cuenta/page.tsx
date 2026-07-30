import { ArrowRight, CheckCircle2, Mail, ShieldCheck, Trash2 } from "lucide-react";
import { LandingFooter } from "@/components/landing/landing-footer";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { Link } from "@/i18n/navigation";
import { SUPPORT_EMAIL } from "@/lib/constants";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return locale === "en"
    ? { title: "Account or data deletion - ContrataCR", description: "Request deletion of your ContrataCR account or specific personal data." }
    : { title: "Eliminación de cuenta o datos - ContrataCR", description: "Solicite eliminar su cuenta de ContrataCR o datos personales específicos." };
}

export default async function DeleteAccountPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  const en = locale === "en";
  const subject = encodeURIComponent(en ? "ContrataCR account or data deletion request" : "Solicitud de eliminación de cuenta o datos ContrataCR");
  const body = encodeURIComponent(en
    ? "Hello,\n\nI request the deletion of my ContrataCR account or specific personal data associated with this email address.\n\nFull name:\nAccount email:\nRequest details:\n\nThank you."
    : "Hola,\n\nSolicito eliminar mi cuenta de ContrataCR o datos personales específicos asociados con este correo electrónico.\n\nNombre completo:\nCorreo de la cuenta:\nDetalle de la solicitud:\n\nGracias.");

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 px-4 pb-16 pt-28 sm:pt-32">
        <div className="mx-auto max-w-2xl">
          <header className="text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-[#eaf7fd] text-[#0089BB]">
              <Trash2 className="h-6 w-6" />
            </span>
            <h1 className="mt-5 text-3xl font-black text-[#162543] sm:text-4xl">
              {en ? "Delete your account or data" : "Eliminar su cuenta o datos"}
            </h1>
            <p className="mx-auto mt-3 max-w-xl leading-7 text-[#6b7280]">
              {en
                ? "You can request deletion of your ContrataCR account or specific personal data associated with it."
                : "Puede solicitar la eliminación de su cuenta de ContrataCR o de datos personales específicos asociados."}
            </p>
          </header>

          <section className="mt-8 rounded-xl border border-[#dfe5eb] bg-white p-5 shadow-sm sm:p-7">
            <h2 className="text-lg font-bold text-[#162543]">{en ? "Before requesting deletion" : "Antes de solicitarlo"}</h2>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-[#4b5563]">
              {[
                en ? "If you request full account deletion, you will lose access to your profile, requests, saved items, following relationships, and account history." : "Si solicita eliminar toda la cuenta, perderá acceso a su perfil, solicitudes, elementos guardados, relaciones de seguimiento e historial de cuenta.",
                en ? "You may also request deletion or correction of specific personal data without deleting the full account." : "También puede solicitar eliminar o corregir datos personales específicos sin eliminar toda la cuenta.",
                en ? "Active service arrangements should be completed or canceled before full account deletion." : "Antes de eliminar toda la cuenta, debe finalizar o cancelar coordinaciones de servicio activas.",
                en ? "Some information may be temporarily retained for security, fraud prevention, claims, or legal compliance." : "Cierta información puede conservarse temporalmente por seguridad, prevención de fraude, reclamos u obligación legal.",
              ].map((item) => (
                <li key={item} className="flex gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[#009FD9]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>

            <div className="mt-6 rounded-lg border border-[#d8e9f2] bg-[#f4faff] p-4">
              <div className="flex items-start gap-3">
                <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-[#0089BB]" />
                <p className="text-sm leading-6 text-[#526277]">
                  {en
                    ? "For your protection, send the request from the email address associated with your account. We may ask for additional information to verify your identity."
                    : "Para proteger su cuenta, envíe la solicitud desde el correo asociado. Podemos pedir información adicional razonable para verificar su identidad."}
                </p>
              </div>
            </div>

            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=${subject}&body=${body}`}
              className="mt-6 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#009FD9] px-5 text-sm font-bold text-white transition-colors hover:bg-[#0089BB]"
            >
              <Mail className="h-4 w-4" />
              {en ? "Request account or data deletion" : "Solicitar eliminación de cuenta o datos"}
            </a>
            <p className="mt-3 text-center text-xs leading-5 text-[#708095]">
              {en ? "The request will be sent to" : "La solicitud se enviará a"} {SUPPORT_EMAIL}
            </p>
          </section>

          <div className="mt-6 flex flex-col items-center justify-center gap-3 text-sm sm:flex-row">
            <Link href="/privacidad" className="inline-flex items-center gap-1.5 font-semibold text-[#0089BB] hover:underline">
              {en ? "Privacy Policy" : "Política de Privacidad"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
            <span className="hidden text-[#d1d5db] sm:inline">|</span>
            <Link href="/soporte" className="font-semibold text-[#526277] hover:text-[#0089BB] hover:underline">
              {en ? "Contact support" : "Contactar soporte"}
            </Link>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
