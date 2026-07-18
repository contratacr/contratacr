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
  Search,
  Star,
} from "lucide-react";

type IconComponent = (props: { className?: string }) => ReactNode;

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");

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
    twitter: { card: "summary_large_image", title: t("metaTitle"), description: t("metaDesc"), images: [imageUrl] },
  };
}

function Journey({
  icon: Icon,
  label,
  title,
  description,
  steps,
  href,
  cta,
  emphasized = false,
}: {
  icon: IconComponent;
  label: string;
  title: string;
  description: string;
  steps: Array<{ title: string; body: string }>;
  href: "/buscar" | "/publicar-proyecto" | "/registro/profesional";
  cta: string;
  emphasized?: boolean;
}) {
  return (
    <article className={`border-b border-[#e5e7eb] py-9 last:border-0 sm:py-11 ${emphasized ? "bg-[#f7fbfd] px-5 sm:px-7" : ""}`}>
      <div className="grid gap-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:gap-10">
        <div>
          <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-lg bg-[#eaf7fd] text-[#0089bb]">
            <Icon className="h-5 w-5" />
          </div>
          <p className="text-xs font-bold uppercase text-[#009fd9]">{label}</p>
          <h2 className="mt-2 text-xl font-extrabold text-[#162543] sm:text-2xl">{title}</h2>
          <p className="mt-3 text-sm leading-6 text-[#6b7280]">{description}</p>
          <Link href={href} className="mt-5 inline-flex min-h-11 items-center gap-2 rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white hover:bg-[#0089bb]">
            {cta}<ArrowRight className="h-4 w-4" />
          </Link>
        </div>
        <ol className="space-y-5">
          {steps.map((step, index) => (
            <li key={step.title} className="flex gap-4">
              <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-[#bfe5f4] bg-white text-xs font-black text-[#0089bb]">
                {index + 1}
              </span>
              <div>
                <h3 className="text-sm font-bold text-[#162543]">{step.title}</h3>
                <p className="mt-1 text-sm leading-6 text-[#6b7280]">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </article>
  );
}

export default async function ComoFuncionaPage() {
  const t = await getTranslations("comoFunciona");
  const steps = (prefix: "client" | "publish" | "pro") => [0, 1, 2].map((i) => ({
    title: t(`${prefix}Step${i}Title`),
    body: t(`${prefix}Step${i}Body`),
  }));

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />
      <main className="flex-1">
        <section className="border-b border-[#e5e7eb] px-4 pb-12 pt-24 sm:pb-14 sm:pt-32">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase text-[#009fd9]">{t("eyebrow")}</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-[#162543] sm:text-5xl">{t("title")}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6b7280] sm:text-lg">{t("subtitle")}</p>
          </div>
        </section>

        <section className="px-4 py-6 sm:py-10">
          <div className="mx-auto max-w-4xl">
            <Journey icon={Search} label={t("clientPathBadge")} title={t("clientPathTitle")} description={t("clientPathDesc")} steps={steps("client")} href="/buscar" cta={t("clientPathCta")} />
            <Journey icon={FileText} label={t("publishPathBadge")} title={t("publishPathTitle")} description={t("publishPathDesc")} steps={steps("publish")} href="/publicar-proyecto" cta={t("publishPathCta")} emphasized />
            <Journey icon={BriefcaseBusiness} label={t("prosEyebrow")} title={t("proFlowTitle")} description={t("proFlowDesc")} steps={steps("pro")} href="/registro/profesional" cta={t("prosCta")} />
          </div>
        </section>

        <section className="border-y border-[#e5e7eb] bg-[#f4f7fa] px-4 py-12">
          <div className="mx-auto max-w-4xl">
            <div className="mb-7 max-w-2xl">
              <p className="text-xs font-bold uppercase text-[#009fd9]">{t("trustEyebrow")}</p>
              <h2 className="mt-2 text-2xl font-extrabold text-[#162543]">{t("trustTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("trustSubtitle")}</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              {[
                { icon: BadgeCheck, title: t("trust0Title"), body: t("trust0Body") },
                { icon: Star, title: t("trust1Title"), body: t("trust1Body") },
              ].map(({ icon: Icon, title, body }) => (
                <div key={title} className="flex gap-3 rounded-lg border border-[#dde4ea] bg-white p-5">
                  <Icon className="mt-0.5 h-5 w-5 shrink-0 text-[#009fd9]" />
                  <div><h3 className="text-sm font-bold text-[#162543]">{title}</h3><p className="mt-1 text-sm leading-6 text-[#6b7280]">{body}</p></div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-14 text-center">
          <h2 className="text-2xl font-extrabold text-[#162543]">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#6b7280]">{t("ctaSubtitle")}</p>
          <Link href="/ayuda" className="mt-6 inline-flex min-h-11 items-center gap-2 rounded-lg border border-[#cdd8e1] px-5 text-sm font-bold text-[#162543] hover:border-[#009fd9] hover:text-[#0089bb]">
            {t("helpCta")}<ArrowRight className="h-4 w-4" />
          </Link>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
