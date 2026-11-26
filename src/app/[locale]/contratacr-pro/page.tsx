import type { Metadata } from "next";
import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ArrowRight, CalendarDays, Check, ClipboardList, FolderOpen, Hammer, Users, Wallet, FileText, UserRound } from "lucide-react";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Link } from "@/i18n/navigation";
import { prefijoDeIdioma, rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { alternativasDeIdioma } from "@/lib/seo/alternates";
import { rutaImagenSocial } from "@/lib/seo/imagen-social";
import { PRO_ENABLED } from "@/lib/pro/enabled";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";

// Public offer page of ContrataCR Pro (owner decision 2026-11-22: a logged-out visitor is OFFERED Pro). Same gate as the rest of Pro:
// PRO_ENABLED (the middleware answers 404 where Pro is off, i.e. production). Only features that work today are listed as available;
// partial ones are "próximamente" and anything that needs a provider account is "en preparación", never promised as live.
export const dynamic = "force-dynamic";

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
const PATH = "/contratacr-pro";

type IconComponent = (props: { className?: string }) => ReactNode;
// Each family opens its own Pro section; logged out, the middleware sends to login with ?redirect= and comes back here.
const FAMILY_TAB: Record<string, string> = { clients: "pro_clients", agenda: "pro_agenda", jobs: "pro_projects", team: "pro_team", quotes: "quotes", money: "pro_payments", files: "pro_files", portal: "pro_projects" };
const FAMILIES: { id: string; icon: IconComponent; items: number }[] = [
  { id: "clients", icon: UserRound, items: 3 },
  { id: "agenda", icon: CalendarDays, items: 2 },
  { id: "jobs", icon: ClipboardList, items: 3 },
  { id: "team", icon: Users, items: 3 },
  { id: "quotes", icon: FileText, items: 3 },
  { id: "money", icon: Wallet, items: 3 },
  { id: "files", icon: FolderOpen, items: 4 },
  { id: "portal", icon: Hammer, items: 2 },
];

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  const t = await getTranslations("proLanding");
  const imageUrl = `${APP_URL}${rutaImagenSocial(locale)}`;
  return {
    title: t("metaTitle"),
    description: t("metaDesc"),
    alternates: alternativasDeIdioma(locale, PATH),
    openGraph: { title: t("metaTitle"), description: t("metaDesc"), url: `${prefijoDeIdioma(locale)}${PATH}`, siteName: "ContrataCR", images: [{ url: imageUrl, width: 1200, height: 630, alt: "ContrataCR" }] },
    twitter: { card: "summary_large_image", title: t("metaTitle"), description: t("metaDesc"), images: [imageUrl] },
  };
}

async function isProfessional(): Promise<boolean> {
  try {
    const db = await createClient();
    const user = await safeGetUser(db);
    if (!user) return false;
    const { data } = await db.from("professionals").select("id").eq("profile_id", user.id).maybeSingle();
    return !!data?.id;
  } catch {
    return false;
  }
}

export default async function ContrataCRProPage({ params }: { params: Promise<{ locale: string }> }) {
  if (!PRO_ENABLED) notFound();
  const { locale } = await params;
  // A professional with an account goes straight to their Pro space.
  if (await isProfessional()) redirect(rutaConIdioma(locale, "/dashboard/pro"));
  const t = await getTranslations("proLanding");
  const cta = (id: string) => (
    <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:justify-center" data-pro-landing-cta={id}>
      <Link href="/registro/profesional" className="inline-flex min-h-12 items-center justify-center gap-2 rounded-full bg-[#009fd9] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#0089bb]">
        {t("ctaRegister")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
      </Link>
      <Link href="/login?redirect=%2Fdashboard%2Fpro" className="inline-flex min-h-12 items-center justify-center rounded-full border border-[#d7e1ea] bg-white px-6 text-[15px] font-bold text-[#162543] transition-colors hover:border-[#b9c8d6] hover:bg-[#f6f9fb]">
        {t("ctaLogin")}
      </Link>
    </div>
  );
  return (
    <div className="flex min-h-screen flex-col bg-white">
      <LandingNavbar />
      <div className="ccr-navbar-spacer h-16" aria-hidden />
      <main id="contenido" className="flex-1" data-pro-landing="">
        <section className="border-b border-[#e5e7eb] px-4 pb-12 pt-6 sm:pb-14 lg:pt-10">
          <div className="mx-auto max-w-3xl text-center">
            <p className="text-xs font-bold uppercase text-[#009fd9]">{t("eyebrow")}</p>
            <h1 className="mt-3 text-3xl font-black leading-tight text-[#162543] sm:text-5xl">{t("title")}</h1>
            <p className="mx-auto mt-4 max-w-2xl text-base leading-7 text-[#6b7280] sm:text-lg">{t("subtitle")}</p>
            {cta("hero")}
            <p className="mt-3 text-[13px] font-medium text-[#68778d]">{t("free")}</p>
          </div>
        </section>

        <section className="px-4 py-10 sm:py-14" aria-labelledby="pro-families">
          <div className="mx-auto max-w-6xl">
            <h2 id="pro-families" className="text-2xl font-extrabold text-[#162543] sm:text-3xl">{t("familiesTitle")}</h2>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[#6b7280]">{t("familiesSub")}</p>
            <ul className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {FAMILIES.map(({ id, icon: Icon, items }) => (
                <li key={id} data-pro-family={id} className="flex min-w-0 flex-col rounded-2xl border border-[#e5e7eb] bg-white p-5">
                  <span className="flex h-11 w-11 items-center justify-center rounded-xl ccr-caja-icono"><Icon className="h-5 w-5" /></span>
                  <h3 className="mt-4 text-lg font-bold text-[#162543]">{t(`f_${id}_title`)}</h3>
                  <ul className="mt-3 space-y-2.5">
                    {Array.from({ length: items }, (_, i) => (
                      <li key={i} className="flex gap-2 text-sm leading-6 text-[#475569]">
                        <Check className="mt-1 h-4 w-4 shrink-0 text-[#009fd9]" aria-hidden="true" />
                        <span>{t(`f_${id}_${i}`)}</span>
                      </li>
                    ))}
                  </ul>
                  <Link href={`/dashboard/pro?tab=${FAMILY_TAB[id]}`} prefetch={false} data-pro-family-open={id} className="mt-4 inline-flex min-h-10 items-center gap-1.5 self-start rounded-full bg-[#eaf7fd] px-4 text-sm font-bold text-[#0083b0] hover:bg-[#d9f0fb]">
                    {t("openFamily")}<ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </section>

        <section className="border-y border-[#e5e7eb] bg-[#f6f9fb] px-4 py-10 sm:py-14" aria-labelledby="pro-soon" data-pro-soon="">
          <div className="mx-auto grid max-w-6xl gap-8 md:grid-cols-2">
            <div>
              <h2 id="pro-soon" className="text-2xl font-extrabold text-[#162543]">{t("soonTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("soonSub")}</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[#475569]">
                {[0, 1, 2, 3, 4, 5].map((i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#9bd8ef]" /><span>{t(`soon_${i}`)}</span></li>)}
              </ul>
            </div>
            <div>
              <h2 className="text-2xl font-extrabold text-[#162543]">{t("prepTitle")}</h2>
              <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("prepSub")}</p>
              <ul className="mt-4 space-y-2 text-sm leading-6 text-[#475569]">
                {[0, 1, 2, 3, 4].map((i) => <li key={i} className="flex gap-2"><span aria-hidden="true" className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-[#cbd5e1]" /><span>{t(`prep_${i}`)}</span></li>)}
              </ul>
            </div>
          </div>
        </section>

        {/* Herramientas (menu): the free tools for everyone live on the same page as Pro. */}
        <section data-free-tools className="border-t border-[#e5e9ee] px-4 py-10">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-2xl font-extrabold text-[#162543]">{t("freeToolsTitle")}</h2>
            <p className="mt-2 text-sm leading-6 text-[#6b7280]">{t("freeToolsSub")}</p>
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {[{ href: "/dashboard/profesional?tab=cv", k: "freeTool_cv" }, { href: "/dashboard/profesional?tab=carta", k: "freeTool_letter" }].map((o) => (
                <Link key={o.k} href={o.href} prefetch={false} className="flex items-center justify-between gap-3 rounded-2xl border border-[#e5e9ee] bg-white px-4 py-4 text-[15px] font-bold text-[#162543] hover:border-[#009FD9]">
                  <span className="flex items-center gap-3"><FileText className="h-5 w-5 text-[#009FD9]" aria-hidden />{t(o.k)}</span>
                  <ArrowRight className="h-4 w-4 text-[#7a899d]" aria-hidden />
                </Link>
              ))}
            </div>
          </div>
        </section>

        <section className="px-4 py-12 sm:py-16">
          <div className="mx-auto max-w-3xl text-center">
            <h2 className="text-2xl font-extrabold text-[#162543] sm:text-3xl">{t("endTitle")}</h2>
            <p className="mx-auto mt-3 max-w-xl text-sm leading-6 text-[#6b7280]">{t("endSub")}</p>
            {cta("end")}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
