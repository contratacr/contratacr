import { ShieldCheck, IdCard, ScanFace, RefreshCw, Search } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { VerificationCta } from "@/components/professionals/verification-cta";

export async function generateMetadata() {
  const t = await getTranslations("proveedoresPage");
  return { title: t("metaTitle"), description: t("metaDesc") };
}

const rich = { strong: (c: React.ReactNode) => <strong>{c}</strong> };

export default async function IdentityVerificationPage() {
  const t = await getTranslations("proveedoresPage");
  const STEPS = [
    { icon: IdCard, title: t("step1Title"), body: t("step1Body") },
    { icon: ScanFace, title: t("step2Title"), body: t("step2Body") },
    { icon: RefreshCw, title: t("step3Title"), body: t("step3Body") },
  ];
  return (
    <div className="min-h-screen flex flex-col bg-[#f4f7fa]">
      <Navbar />
      <main className="flex-1">
        {/* Hero */}
        <section className="bg-white border-b border-[#e5e7eb]">
          <div className="mx-auto max-w-3xl px-4 sm:px-6 py-12 text-center">
            <div className="inline-flex items-center gap-2 rounded-full bg-[#dcfce7] px-3 py-1 text-sm font-semibold text-[#15803d]">
              <ShieldCheck className="h-4 w-4" /> {t("badge")}
            </div>
            <h1 className="mt-4 text-3xl font-bold text-[#111827]">{t("h1")}</h1>
            <p className="mt-3 text-[#6b7280] leading-relaxed">
              {t.rich("intro", rich)}
            </p>
          </div>
        </section>

        {/* Steps */}
        <section className="mx-auto max-w-3xl px-4 sm:px-6 py-10">
          <h2 className="text-lg font-bold text-[#111827] mb-5">{t("howWorks")}</h2>
          <div className="grid sm:grid-cols-3 gap-4">
            {STEPS.map((s) => (
              <div key={s.title} className="bg-white rounded-xl border border-[#e5e7eb] p-5">
                <div className="h-9 w-9 rounded-lg bg-[#EBF5FB] flex items-center justify-center mb-3">
                  <s.icon className="h-5 w-5 text-[#009FD9]" />
                </div>
                <h3 className="font-semibold text-[#111827] text-sm">{s.title}</h3>
                <p className="text-sm text-[#6b7280] mt-1 leading-relaxed">{s.body}</p>
              </div>
            ))}
          </div>

          {/* Disclaimer — intermediary framing, no "garantía" / "autorizado".
              #que-significa is the deep-link target from every "Verificado" badge. */}
          <div id="que-significa" className="mt-8 rounded-xl border border-[#fde68a] bg-[#fffbeb] p-5 scroll-mt-24">
            <h3 className="font-semibold text-[#92400e] text-sm">{t("disclaimerTitle")}</h3>
            <p className="text-sm text-[#92400e] mt-1.5 leading-relaxed">
              {t.rich("disclaimer", rich)}
            </p>
          </div>

          {/* CTAs */}
          <div className="mt-8 flex flex-wrap gap-3">
            <Link
              href="/buscar?verificados=1"
              className="inline-flex items-center gap-2 rounded-xl bg-[#16a34a] px-5 py-3 text-sm font-bold text-white hover:bg-[#15803d]"
            >
              <Search className="h-4 w-4" /> {t("ctaVerified")}
            </Link>
            <VerificationCta className="inline-flex items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white px-5 py-3 text-sm font-bold text-[#374151] hover:border-[#009FD9]" />
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
