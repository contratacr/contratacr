import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getTranslations } from "next-intl/server";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  FileText,
  MessageCircle,
  Search,
  Star,
} from "lucide-react";

type IconComponent = (props: { className?: string }) => ReactNode;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
const iconTileClass = "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#EAF7FD] text-[#0089bb]";
const softCardClass = "rounded-2xl border border-[#e5e7eb] bg-white shadow-sm";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("comoFunciona");
  const path = `/${locale}/como-funciona`;
  const imageUrl = `${APP_URL}/${locale}/opengraph-image`;

  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: { canonical: path },
    openGraph: {
      title: t("metaTitle"),
      description: t("metaDesc"),
      url: path,
      siteName: "ContrataCR",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: "ContrataCR" }],
    },
    twitter: {
      card: "summary_large_image",
      title: t("metaTitle"),
      description: t("metaDesc"),
      images: [imageUrl],
    },
  };
}

function SectionHeading({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle: string }) {
  return (
    <div className="mx-auto mb-9 max-w-2xl text-center">
      <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#009FD9]">{eyebrow}</p>
      <h2 className="mt-2 text-2xl font-extrabold leading-tight text-[#162543] sm:text-3xl">{title}</h2>
      <p className="mt-3 text-sm leading-relaxed text-[#6b7280] sm:text-base">{subtitle}</p>
    </div>
  );
}

function StepCard({ n, title, body }: { n: number; title: string; body: string }) {
  return (
    <div className="flex gap-3 rounded-xl border border-[#e5e7eb] bg-white p-4">
      <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[#009FD9] text-xs font-black text-white">
        {n}
      </div>
      <div>
        <h3 className="text-sm font-bold text-[#162543]">{title}</h3>
        <p className="mt-1 text-sm leading-relaxed text-[#6b7280]">{body}</p>
      </div>
    </div>
  );
}

function MiniMetric({ value, label }: { value: string; label: string }) {
  return (
    <div className="rounded-xl border border-[#d8eef8] bg-white px-4 py-3 text-left">
      <p className="text-lg font-black text-[#162543]">{value}</p>
      <p className="text-xs font-semibold leading-snug text-[#6b7280]">{label}</p>
    </div>
  );
}

export default async function ComoFuncionaPage() {
  const t = await getTranslations("comoFunciona");

  const clientSteps = [0, 1, 2].map((i) => ({
    title: t(`clientStep${i}Title`),
    body: t(`clientStep${i}Body`),
  }));
  const publishSteps = [0, 1, 2].map((i) => ({
    title: t(`publishStep${i}Title`),
    body: t(`publishStep${i}Body`),
  }));
  const proSteps = [0, 1, 2].map((i) => ({
    title: t(`proStep${i}Title`),
    body: t(`proStep${i}Body`),
  }));
  const trustItems: Array<{ icon: IconComponent; title: string; body: string }> = [
    { icon: BadgeCheck, title: t("trust0Title"), body: t("trust0Body") },
    { icon: Star, title: t("trust1Title"), body: t("trust1Body") },
    { icon: MessageCircle, title: t("trust2Title"), body: t("trust2Body") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      <main className="flex-1">
        <section className="bg-white px-4 pb-10 pt-24 sm:pb-12 sm:pt-32">
          <div className="mx-auto max-w-4xl text-center">
            <span className="inline-flex rounded-full bg-[#EBF5FB] px-4 py-1.5 text-xs font-bold uppercase tracking-[0.18em] text-[#009FD9]">
              {t("eyebrow")}
            </span>
            <h1 className="mt-5 text-3xl font-black leading-tight text-[#162543] sm:text-5xl lg:text-6xl">
              {t("title")}
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-base leading-relaxed text-[#6b7280] sm:text-lg">
              {t("subtitle")}
            </p>
          </div>
        </section>

        <section className="border-y border-[#e5e7eb] bg-[#f8fbfd] px-4 py-8">
          <div className="mx-auto grid max-w-5xl gap-3 sm:grid-cols-3">
            <MiniMetric value={t("metric0Value")} label={t("metric0Label")} />
            <MiniMetric value={t("metric1Value")} label={t("metric1Label")} />
            <MiniMetric value={t("metric2Value")} label={t("metric2Label")} />
          </div>
        </section>

        <section className="bg-white px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <SectionHeading eyebrow={t("pathsEyebrow")} title={t("pathsTitle")} subtitle={t("pathsSubtitle")} />
            <div className="grid gap-5 lg:grid-cols-2">
              <div className={`${softCardClass} h-full p-5 sm:p-6`}>
                <div className="mb-5 flex items-center gap-3">
                  <div className={iconTileClass}><Search className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#009FD9]">{t("clientPathBadge")}</p>
                    <h2 className="text-xl font-black text-[#162543]">{t("clientPathTitle")}</h2>
                  </div>
                </div>
                <p className="mb-5 text-sm leading-relaxed text-[#6b7280]">{t("clientPathDesc")}</p>
                <div className="space-y-3">
                  {clientSteps.map((step, i) => <StepCard key={step.title} n={i + 1} title={step.title} body={step.body} />)}
                </div>
                <Link href="/buscar" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#009FD9] hover:underline">
                  {t("clientPathCta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>

              <div className={`${softCardClass} h-full p-5 sm:p-6`}>
                <div className="mb-5 flex items-center gap-3">
                  <div className={iconTileClass}><FileText className="h-5 w-5" /></div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#009FD9]">{t("publishPathBadge")}</p>
                    <h2 className="text-xl font-black text-[#162543]">{t("publishPathTitle")}</h2>
                  </div>
                </div>
                <p className="mb-5 text-sm leading-relaxed text-[#6b7280]">{t("publishPathDesc")}</p>
                <div className="space-y-3">
                  {publishSteps.map((step, i) => <StepCard key={step.title} n={i + 1} title={step.title} body={step.body} />)}
                </div>
                <Link href="/publicar-proyecto" className="mt-6 inline-flex items-center gap-2 text-sm font-black text-[#009FD9] hover:underline">
                  {t("publishPathCta")} <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f7fa] px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <div className={`${softCardClass} p-5 sm:p-6`}>
              <div className="mb-5 flex items-start gap-3">
                <div className={iconTileClass}><BriefcaseBusiness className="h-5 w-5" /></div>
                <div>
                  <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#009FD9]">{t("prosEyebrow")}</p>
                  <h2 className="text-xl font-black text-[#162543]">{t("proFlowTitle")}</h2>
                  <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{t("proFlowDesc")}</p>
                </div>
              </div>
              <div className="space-y-3">
                {proSteps.map((step, i) => <StepCard key={step.title} n={i + 1} title={step.title} body={step.body} />)}
              </div>
              <Link href="/registro/profesional" className="mt-6 inline-flex items-center justify-center gap-2 rounded-full bg-[#009FD9] px-6 py-3 text-sm font-black text-white transition-colors hover:bg-[#0089bb]">
                {t("prosCta")} <ArrowRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <SectionHeading eyebrow={t("trustEyebrow")} title={t("trustTitle")} subtitle={t("trustSubtitle")} />
            <div className="grid gap-4 md:grid-cols-3">
              {trustItems.map((item) => (
                <div key={item.title} className={`${softCardClass} p-5`}>
                  <div className="mb-4 flex items-center gap-3">
                    <div className={iconTileClass}><item.icon className="h-5 w-5" /></div>
                    <h3 className="text-sm font-bold leading-snug text-[#162543]">{item.title}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-[#6b7280]">{item.body}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8fbfd] px-4 py-16">
          <div className="mx-auto max-w-4xl text-center">
            <h2 className="text-2xl font-extrabold text-[#162543] sm:text-3xl">{t("ctaTitle")}</h2>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-[#6b7280] sm:text-base">{t("ctaSubtitle")}</p>
            <div className="mt-7 flex flex-col items-stretch justify-center gap-3 sm:flex-row sm:items-center">
              <Link href="/buscar" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#009FD9] px-6 py-3 text-sm font-black text-white hover:bg-[#0089bb]">
                {t("ctaSearch")} <Search className="h-4 w-4" />
              </Link>
              <Link href="/publicar-proyecto" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d7e0e8] bg-white px-6 py-3 text-sm font-black text-[#162543] hover:border-[#009FD9] hover:text-[#0089bb]">
                {t("ctaPublish")} <FileText className="h-4 w-4" />
              </Link>
              <Link href="/registro/profesional" className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#d7e0e8] bg-white px-6 py-3 text-sm font-black text-[#162543] hover:border-[#009FD9] hover:text-[#0089bb]">
                {t("ctaOffer")} <BriefcaseBusiness className="h-4 w-4" />
              </Link>
            </div>
            <Link href="/ayuda" className="mt-6 inline-flex items-center gap-2 text-sm font-bold text-[#0089bb] hover:underline">
              {t("helpCta")} <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
