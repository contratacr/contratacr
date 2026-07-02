import type { Metadata } from "next";
import type { ReactNode } from "react";
import { getLocale, getTranslations } from "next-intl/server";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { WhatsAppIcon } from "@/components/icons/whatsapp-icon";
import { PhoneFrame, ResultsScreen, buildLandingResultsCopy, type ResultsCopy } from "@/components/landing/phone-screens";
import { ComoFuncionaFaq } from "./faq-accordion";
import {
  ArrowRight,
  BadgeCheck,
  Bell,
  BriefcaseBusiness,
  CalendarClock,
  CheckCircle2,
  FileText,
  Heart,
  Image as ImageIcon,
  Languages,
  MapPin,
  MessageCircle,
  PhoneCall,
  Search,
  ShieldCheck,
  Star,
  UserCheck,
  Video,
  WalletCards,
} from "lucide-react";

type IconComponent = (props: { className?: string }) => ReactNode;
type FeatureAccent = "default" | "whatsapp";

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

function FeatureCard({ icon: Icon, title, body, accent = "default" }: { icon: IconComponent; title: string; body: string; accent?: FeatureAccent }) {
  const tileClass = accent === "whatsapp"
    ? "flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#e9fbef] text-[#25D366]"
    : iconTileClass;

  return (
    <div className={`${softCardClass} p-5`}>
      <div className="mb-4 flex items-center gap-3">
        <div className={tileClass}>
          <Icon className="h-5 w-5" />
        </div>
        <h3 className="text-sm font-bold leading-snug text-[#162543]">{title}</h3>
      </div>
      <p className="text-sm leading-relaxed text-[#6b7280]">{body}</p>
    </div>
  );
}

function BenefitListCard({
  icon: Icon,
  eyebrow,
  title,
  body,
  items,
}: {
  icon: IconComponent;
  eyebrow: string;
  title: string;
  body: string;
  items: Array<{ icon: IconComponent; title: string; body: string }>;
}) {
  return (
    <div className={`${softCardClass} p-5 sm:p-6`}>
      <div className="mb-5 flex items-start gap-3">
        <div className={iconTileClass}>
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#009FD9]">{eyebrow}</p>
          <h2 className="text-xl font-black leading-tight text-[#162543]">{title}</h2>
          <p className="mt-2 text-sm leading-relaxed text-[#6b7280]">{body}</p>
        </div>
      </div>
      <div className="divide-y divide-[#eef1f5]">
        {items.map(({ icon: ItemIcon, title: itemTitle, body: itemBody }) => (
          <div key={itemTitle} className="flex gap-3 py-3 first:pt-0 last:pb-0">
            <ItemIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#009FD9]" />
            <div>
              <p className="text-sm font-bold text-[#162543]">{itemTitle}</p>
              <p className="mt-0.5 text-sm leading-relaxed text-[#6b7280]">{itemBody}</p>
            </div>
          </div>
        ))}
      </div>
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

function ProductPreview({ copy }: { copy: ResultsCopy }) {
  return (
    <div className="relative mx-auto mt-10 flex justify-center">
      <div aria-hidden className="pointer-events-none absolute bottom-3 left-1/2 h-6 w-52 -translate-x-1/2 rounded-[50%] bg-[#1a2744]/15 blur-2xl" />
      <PhoneFrame>
        <ResultsScreen copy={copy} />
      </PhoneFrame>
    </div>
  );
}

export default async function ComoFuncionaPage() {
  const t = await getTranslations("comoFunciona");
  const tLanding = await getTranslations("landing.howItWorks");
  const tCard = await getTranslations("card");
  const tSchedule = await getTranslations("schedule");
  const locale = await getLocale();
  const resultsCopy = buildLandingResultsCopy({ locale, tLanding, tCard, tSchedule });

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
  const faqs = [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({
    question: t(`faq${i}Q`),
    answer: t(`faq${i}A`),
  }));

  const clientBenefits = [
    { icon: Search, title: t("clientBenefit0Title"), body: t("clientBenefit0Body") },
    { icon: ShieldCheck, title: t("clientBenefit1Title"), body: t("clientBenefit1Body") },
    { icon: CalendarClock, title: t("clientBenefit2Title"), body: t("clientBenefit2Body") },
    { icon: Heart, title: t("clientBenefit3Title"), body: t("clientBenefit3Body") },
  ];
  const proBenefits = [
    { icon: UserCheck, title: t("proBenefit0Title"), body: t("proBenefit0Body") },
    { icon: ImageIcon, title: t("proBenefit1Title"), body: t("proBenefit1Body") },
    { icon: MapPin, title: t("proBenefit2Title"), body: t("proBenefit2Body") },
    { icon: Bell, title: t("proBenefit3Title"), body: t("proBenefit3Body") },
    { icon: WalletCards, title: t("proBenefit4Title"), body: t("proBenefit4Body") },
    { icon: BriefcaseBusiness, title: t("proBenefit5Title"), body: t("proBenefit5Body") },
  ];
  const trustItems: Array<{ icon: IconComponent; title: string; body: string; accent?: FeatureAccent }> = [
    { icon: BadgeCheck, title: t("trust0Title"), body: t("trust0Body") },
    { icon: Star, title: t("trust1Title"), body: t("trust1Body") },
    { icon: WhatsAppIcon, title: t("trust2Title"), body: t("trust2Body"), accent: "whatsapp" },
    { icon: PhoneCall, title: t("trust3Title"), body: t("trust3Body") },
    { icon: Video, title: t("trust4Title"), body: t("trust4Body") },
    { icon: Languages, title: t("trust5Title"), body: t("trust5Body") },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      <main className="flex-1">
        <section className="bg-white px-4 pb-12 pt-28 sm:pt-32">
          <FadeInUp>
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
          </FadeInUp>
          <FadeInUp delay={80}>
            <ProductPreview copy={resultsCopy} />
          </FadeInUp>
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
          <div className="mx-auto max-w-5xl">
            <SectionHeading eyebrow={t("clientsEyebrow")} title={t("clientsTitle")} subtitle={t("clientsSubtitle")} />
            <div className="grid gap-5 lg:grid-cols-2">
              <BenefitListCard
                icon={Search}
                eyebrow={t("clientPathBadge")}
                title={t("clientPathTitle")}
                body={t("clientPathDesc")}
                items={clientBenefits}
              />
              <BenefitListCard
                icon={BriefcaseBusiness}
                eyebrow={t("prosEyebrow")}
                title={t("prosTitle")}
                body={t("prosSubtitle")}
                items={proBenefits}
              />
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16">
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

        <section className="bg-[#EBF5FB] px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <SectionHeading eyebrow={t("trustEyebrow")} title={t("trustTitle")} subtitle={t("trustSubtitle")} />
            <div className="grid gap-4 md:grid-cols-3">
              {trustItems.map((item) => (
                <FeatureCard key={item.title} icon={item.icon} title={item.title} body={item.body} accent={item.accent} />
              ))}
            </div>
          </div>
        </section>

        <section className="bg-white px-4 py-16">
          <div className="mx-auto max-w-5xl">
            <SectionHeading eyebrow={t("compareEyebrow")} title={t("compareTitle")} subtitle={t("compareSubtitle")} />
            <div className="grid gap-4 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <div key={i} className={`${softCardClass} p-5`}>
                  <div className="mb-3 flex items-center gap-2">
                    <CheckCircle2 className="h-5 w-5 text-[#009FD9]" />
                    <h3 className="text-sm font-black text-[#162543]">{t(`compare${i}Title`)}</h3>
                  </div>
                  <p className="text-sm leading-relaxed text-[#6b7280]">{t(`compare${i}Body`)}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="bg-[#f8fbfd] px-4 py-16">
          <div className="mx-auto max-w-3xl">
            <SectionHeading eyebrow={t("faqEyebrow")} title={t("faqTitle")} subtitle={t("faqSubtitle")} />
            <ComoFuncionaFaq items={faqs} />
          </div>
        </section>

        <section className="bg-[#162543] px-4 py-16 text-center">
          <h2 className="text-3xl font-black text-white">{t("ctaTitle")}</h2>
          <p className="mx-auto mt-3 max-w-xl text-sm leading-relaxed text-[#c7d2fe]">{t("ctaSubtitle")}</p>
          <div className="mt-7 flex flex-col justify-center gap-3 sm:flex-row">
            <Link href="/buscar" className="inline-flex items-center justify-center gap-2 rounded-full bg-[#009FD9] px-7 py-3 text-sm font-black text-white transition-colors hover:bg-[#0089bb]">
              <Search className="h-4 w-4" /> {t("ctaSearch")}
            </Link>
            <Link href="/publicar-proyecto" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white transition-colors hover:bg-white/20">
              <MessageCircle className="h-4 w-4" /> {t("ctaPublish")}
            </Link>
            <Link href="/registro/profesional" className="inline-flex items-center justify-center gap-2 rounded-full border border-white/20 bg-white/10 px-7 py-3 text-sm font-black text-white transition-colors hover:bg-white/20">
              <BriefcaseBusiness className="h-4 w-4" /> {t("ctaOffer")}
            </Link>
          </div>
        </section>
      </main>

      <LandingFooter />
    </div>
  );
}
