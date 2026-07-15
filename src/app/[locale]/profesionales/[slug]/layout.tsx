import type { Metadata } from "next";
import { getProfessionalBySlug } from "@/lib/queries/professionals";
import { getCategoryLabel } from "@/lib/data/categories";
import { proDisplayName } from "@/lib/utils";

type ProfileLayoutProps = {
  children: React.ReactNode;
  params: Promise<{ locale: string; slug: string }>;
};

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function cleanDescription(text?: string | null) {
  const clean = (text ?? "").replace(/\s+/g, " ").trim();
  return clean.length >= 24 ? clean.slice(0, 155) : "";
}

export async function generateMetadata({ params }: ProfileLayoutProps): Promise<Metadata> {
  const { locale, slug } = await params;
  const isEn = locale === "en";
  const pro = await getProfessionalBySlug(slug);

  if (!pro) {
    const title = isEn ? "Professional profile | ContrataCR" : "Perfil profesional | ContrataCR";
    const description = isEn
      ? "Find and hire service professionals in Costa Rica."
      : "Encuentra y contrata profesionales de servicios en Costa Rica.";
    return { title, description };
  }

  const displayName = pro.businessName?.trim() || proDisplayName(pro.fullName);
  const serviceIds = pro.professions?.length ? pro.professions : pro.categoryId ? [pro.categoryId] : [];
  const services = serviceIds.slice(0, 3).map((id) => getCategoryLabel(id, locale)).filter(Boolean);
  const serviceText = services.join(" · ");
  const location = [pro.cantonName, pro.provinceName].filter(Boolean).join(", ");
  const title = serviceText ? `${displayName} | ${serviceText}` : `${displayName} | ContrataCR`;
  const fallbackDescription = isEn
    ? `View ${displayName}'s professional profile on ContrataCR${location ? ` in ${location}` : ""}.`
    : `Conoce el perfil profesional de ${displayName} en ContrataCR${location ? ` en ${location}` : ""}.`;
  const description = cleanDescription(pro.bio) || fallbackDescription;
  const path = `/${locale}/profesionales/${slug}`;
  const absoluteUrl = `${APP_URL}${path}`;
  const imageUrl = `${APP_URL}${path}/opengraph-image`;

  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "profile",
      siteName: "ContrataCR",
      title,
      description,
      url: absoluteUrl,
      locale: isEn ? "en_US" : "es_CR",
      images: [{ url: imageUrl, width: 1200, height: 630, alt: title }],
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: [imageUrl],
    },
  };
}

export default function ProfileLayout({ children }: ProfileLayoutProps) {
  return children;
}
