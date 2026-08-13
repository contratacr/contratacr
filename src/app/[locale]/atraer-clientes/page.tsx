"use client";

import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import {
  ArrowRight,
  BadgeCheck,
  BriefcaseBusiness,
  CalendarDays,
  Camera,
  CheckCircle2,
  Images,
  MapPin,
  Star,
  Tags,
} from "lucide-react";

const PROFILE_ACTIONS = [
  { index: 0, icon: Camera },
  { index: 1, icon: BadgeCheck },
  { index: 2, icon: Images },
  { index: 4, icon: Star },
  { index: 5, icon: MapPin },
  { index: 7, icon: CalendarDays },
];

export default function AtraerClientesPage() {
  const t = useTranslations("atraerClientes");
  const dos = (t.raw("dos") as string[]).slice(0, 4);
  const donts = (t.raw("donts") as string[]).slice(0, 4);

  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
      <main className="flex-1">
        <section className="border-b border-[#e5e7eb] px-4 pb-12 pt-12 sm:pb-14 sm:pt-12">
          <div className="mx-auto max-w-3xl text-center">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-lg bg-[#eaf7fd] text-[#0089bb]"><BriefcaseBusiness className="h-5 w-5" /></div>
            <p className="mt-4 text-xs font-bold uppercase text-[#009fd9]">{t("eyebrow")}</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-[#162543] sm:text-5xl">{t("titleA")} {t("titleB")}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6b7280] sm:text-lg">{t("subtitle")}</p>
          </div>
        </section>

        <section className="bg-[#f4f7fa] px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <div className="mb-7 max-w-2xl">
              <h2 className="text-2xl font-extrabold text-[#162543]">{t("profileChecklistTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("profileChecklistSubtitle")}</p>
            </div>
            <div className="divide-y divide-[#e5e7eb] rounded-lg border border-[#dfe5eb] bg-white px-5 sm:px-7">
              {PROFILE_ACTIONS.map(({ index, icon: Icon }) => (
                <article key={index} className="grid gap-3 py-6 sm:grid-cols-[2.5rem_minmax(0,1fr)]">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf7fd] text-[#0089bb]"><Icon className="h-5 w-5" /></div>
                  <div>
                    <h3 className="text-sm font-bold text-[#162543]">{t(`tip${index}Title`)}</h3>
                    <p className="mt-1 text-sm leading-6 text-[#6b7280]">{t(`tip${index}Body`)}</p>
                    <p className="mt-2 text-xs font-semibold text-[#0089bb]">{t(`tip${index}Highlight`)}</p>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <div className="mb-7 max-w-2xl">
              <h2 className="text-2xl font-extrabold text-[#162543]">{t("growthToolsTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("growthToolsSubtitle")}</p>
            </div>
            <div className="grid overflow-hidden rounded-lg border border-[#dfe5eb] bg-white md:grid-cols-2 md:divide-x md:divide-[#e5e7eb]">
              <article className="border-b border-[#e5e7eb] p-6 md:border-b-0">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf7fd] text-[#0089bb]"><BriefcaseBusiness className="h-5 w-5" /></div>
                <h3 className="mt-4 text-base font-bold text-[#162543]">{t("jobsTitle")}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("jobsBody")}</p>
                <Link href="/empleos" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0089bb] hover:text-[#007aa7]">{t("jobsCta")}<ArrowRight className="h-4 w-4" /></Link>
              </article>
              <article className="p-6">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[#eaf7fd] text-[#0089bb]"><Tags className="h-5 w-5" /></div>
                <h3 className="mt-4 text-base font-bold text-[#162543]">{t("offersTitle")}</h3>
                <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("offersBody")}</p>
                <Link href="/ofertas" className="mt-4 inline-flex items-center gap-2 text-sm font-bold text-[#0089bb] hover:text-[#007aa7]">{t("offersCta")}<ArrowRight className="h-4 w-4" /></Link>
              </article>
            </div>
          </div>
        </section>

        <section className="bg-[#f4f7fa] px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-4xl">
            <div className="mb-7">
              <h2 className="text-2xl font-extrabold text-[#162543]">{t("dosDontsTitle")}</h2>
              <p className="mt-2 text-sm text-[#6b7280]">{t("dosDontsSubtitle")}</p>
            </div>
            <div className="grid gap-5 md:grid-cols-2">
              <div className="rounded-lg border border-[#cae8db] bg-[#f3fbf7] p-5">
                <h3 className="text-sm font-bold text-[#166534]">{t("dosTitle")}</h3>
                <ul className="mt-4 space-y-3">{dos.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-[#374151]"><CheckCircle2 className="mt-1 h-4 w-4 shrink-0 text-[#16a34a]" />{item}</li>)}</ul>
              </div>
              <div className="rounded-lg border border-[#f0d3d3] bg-[#fff8f8] p-5">
                <h3 className="text-sm font-bold text-[#b91c1c]">{t("dontsTitle")}</h3>
                <ul className="mt-4 space-y-3">{donts.map((item) => <li key={item} className="flex gap-2 text-sm leading-6 text-[#374151]"><span className="font-bold text-[#dc2626]">×</span>{item}</li>)}</ul>
              </div>
            </div>
          </div>
        </section>

        <section className="border-t border-[#e5e7eb] bg-[#f7fbfd] px-4 py-12">
          <div className="mx-auto flex max-w-4xl flex-col items-start justify-between gap-5 sm:flex-row sm:items-center">
            <div><h2 className="text-xl font-extrabold text-[#162543]">{t("ctaTitle")}</h2><p className="mt-2 text-sm text-[#6b7280]">{t("ctaSubtitle")}</p></div>
            <Link href="/registro/profesional" className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg bg-[#009fd9] px-5 text-sm font-bold text-white hover:bg-[#0089bb]">{t("ctaRegister")}<ArrowRight className="h-4 w-4" /></Link>
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
