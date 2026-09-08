import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { ServiceLanding } from "@/components/landing-servicios/service-landing";
import { getAllCategories, getCategoryLabel } from "@/lib/data/categories";
import { getProvinceById } from "@/lib/data/cr-geography";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";
const OG_LOCALE: Record<string, string> = { en: "en_US", es: "es_CR" };

type Props = { params: Promise<{ locale: string; categoria: string; provincia: string }> };

export const revalidate = 3600;

function known(categoria: string, provincia: string) {
  return getAllCategories().some((c) => c.id === categoria) && !!getProvinceById(provincia);
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale, categoria, provincia } = await params;
  if (!known(categoria, provincia)) return {};
  const t = await getTranslations("serviceLanding");
  const supply = await getSupplyCounts();
  const category = getCategoryLabel(categoria, locale);
  const place = getProvinceById(provincia)!.name;
  const count = supply.byCategoryProvince[supplyKey(categoria, provincia)] ?? 0;
  const path = `/${locale}/servicios/${categoria}/${provincia}`;
  const title = t("metaTitle", { category, place });
  const description = t("metaDesc", { count, category, place });
  return {
    title,
    description,
    alternates: { canonical: path },
    robots: count >= MIN_SUPPLY_FOR_LANDING ? undefined : { index: false },
    openGraph: { title, description, url: `${APP_URL}${path}`, siteName: "ContrataCR", locale: OG_LOCALE[locale] ?? "es_CR", type: "website" },
  };
}

export default async function CategoryProvinceLandingPage({ params }: Props) {
  const { locale, categoria, provincia } = await params;
  if (!known(categoria, provincia)) notFound();
  return <ServiceLanding locale={locale} categoryId={categoria} provinceId={provincia} />;
}
