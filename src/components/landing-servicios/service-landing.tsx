import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { VerifiedSeal } from "@/components/ui/verified-seal";
import { Star, MapPin, ArrowRight } from "lucide-react";
import { getCategoryLabel } from "@/lib/data/categories";
import { PROVINCES, getProvinceById } from "@/lib/data/cr-geography";
import { searchProfessionals } from "@/lib/queries/professionals";
import { getSupplyCounts, supplyKey, MIN_SUPPLY_FOR_LANDING } from "@/lib/queries/supply";
import { primaryPricingLabel } from "@/lib/pricing";
import { cldThumb } from "@/lib/cloudinary";
import { getInitials, proDisplayName } from "@/lib/utils";
import type { ProfessionalCardData } from "@/components/professionals/professional-card";

/**
 * Página de aterrizaje por oficio (y opcionalmente provincia). Es la primera
 * pantalla del tráfico pagado y la página que Google indexa: liviana, sin mapa
 * ni filtros, con pocos profesionales muy calificados y una sola acción.
 */
export async function ServiceLanding({ locale, categoryId, provinceId }: { locale: string; categoryId: string; provinceId?: string }) {
  const t = await getTranslations("serviceLanding");
  const category = getCategoryLabel(categoryId, locale);
  const province = provinceId ? getProvinceById(provinceId) : undefined;
  const supply = await getSupplyCounts();
  const [results, nationwide] = await Promise.all([
    searchProfessionals({ categoryId, provinceId: province?.id, sortBy: "rating" }),
    province ? searchProfessionals({ categoryId, sortBy: "rating" }) : Promise.resolve<ProfessionalCardData[]>([]),
  ]);
  const list = province && results.length < MIN_SUPPLY_FOR_LANDING ? nationwide : results;
  const top = [...list]
    .sort((a, b) => (Number(b.isVerified) - Number(a.isVerified)) || (b.reviewCount - a.reviewCount) || (b.ratingAvg - a.ratingAvg))
    .slice(0, 6);
  const count = list.length;
  const placeName = province?.name ?? "";
  const provincesWithSupply = PROVINCES.filter((p) => (supply.byCategoryProvince[supplyKey(categoryId, p.id)] ?? 0) >= MIN_SUPPLY_FOR_LANDING);
  const buscarHref = `/buscar?categoria=${encodeURIComponent(categoryId)}${province ? `&provincia=${province.id}` : ""}`;
  const chip = (active: boolean) =>
    `inline-flex h-9 shrink-0 items-center rounded-full border px-3.5 text-[13px] font-bold transition-colors ${active ? "border-[#009FD9] bg-[#009FD9] text-white" : "border-[#d7e1ea] bg-white text-[#162543] hover:border-[#009FD9] hover:text-[#009FD9]"}`;

  return (
    <div className="flex min-h-screen flex-col bg-[#f4f7fa]">
      <LandingNavbar />
      <main className="flex-1 pt-16">
        <section className="bg-white px-4 pb-6 pt-7 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h1 className="text-[26px] font-extrabold leading-tight text-[#162543] sm:text-4xl">
              {province ? t("title", { category, place: placeName }) : t("titleCountry", { category })}
            </h1>
            <p className="mt-2 text-[15px] leading-6 text-[#52627a] sm:text-lg">{t("subtitle", { count })}</p>
            <p className="mt-2 inline-flex items-center gap-1.5 text-[13px] font-semibold text-[#0089bb]">
              <VerifiedSeal className="h-4 w-4 text-[#009FD9]" />
              {t("trust")}
            </p>
            {provincesWithSupply.length > 0 && (
              <div className="mt-5">
                <p className="mb-2 text-[12px] font-bold uppercase tracking-wide text-[#68778d]">{t("whereLabel")}</p>
                <div className="scrollbar-none -mx-4 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0">
                  <Link href={`/servicios/${categoryId}`} className={chip(!province)}>{t("allCountry")}</Link>
                  {provincesWithSupply.map((p) => (
                    <Link key={p.id} href={`/servicios/${categoryId}/${p.id}`} className={chip(province?.id === p.id)}>{p.name}</Link>
                  ))}
                </div>
              </div>
            )}
          </div>
        </section>

        <section className="px-4 py-6 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-lg font-extrabold text-[#162543]">{t("topTitle")}</h2>
            <div className="overflow-hidden rounded-2xl border border-[#e5eaf0] bg-white">
              {top.map((pro, i) => {
                const name = pro.businessName?.trim() || proDisplayName(pro.fullName);
                const price = primaryPricingLabel(pro.pricing, pro.hourlyRate, locale);
                const place = [pro.cantonName, pro.provinceName].filter(Boolean).join(", ");
                return (
                  <Link
                    key={pro.id}
                    href={`/profesionales/${pro.slug}?from=${encodeURIComponent(`/servicios/${categoryId}${province ? `/${province.id}` : ""}`)}`}
                    className={`flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-[#f8fafc] ${i > 0 ? "border-t border-[#eef2f6]" : ""}`}
                  >
                    <span className="grid h-14 w-14 shrink-0 place-items-center overflow-hidden rounded-full bg-[#EBF5FB] text-base font-bold text-[#009FD9]">
                      {pro.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- miniatura ya redimensionada por Cloudinary
                        <img src={cldThumb(pro.avatarUrl, 160)} alt="" className="h-full w-full object-cover" loading={i < 3 ? "eager" : "lazy"} />
                      ) : getInitials(pro.fullName)}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex min-w-0 items-center gap-1">
                        <span className="truncate text-[15px] font-extrabold text-[#162543]">{name}</span>
                        {pro.isVerified && <VerifiedSeal label={t("verified")} className="h-4 w-4 shrink-0 text-[#009FD9]" />}
                      </span>
                      <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-[13px] text-[#52627a]">
                        {pro.reviewCount > 0 ? (
                          <span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 fill-[#ff9b32] text-[#ff9b32]" /><b className="text-[#162543]">{pro.ratingAvg.toFixed(1)}</b> {t("reviews", { count: pro.reviewCount })}</span>
                        ) : (
                          <span>{t("noReviews")}</span>
                        )}
                        {place && <span className="inline-flex items-center gap-1"><MapPin className="h-3.5 w-3.5 text-[#68778d]" />{place}</span>}
                      </span>
                      {price && <span className="mt-0.5 block text-[13px] font-bold text-[#007fae]">{price}</span>}
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-[#9aa8ba]" />
                  </Link>
                );
              })}
            </div>
            <Link href={buscarHref} className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full bg-[#009FD9] px-6 text-[15px] font-bold text-white transition-colors hover:bg-[#0089bb]">
              {t("seeAll", { count })}
            </Link>
          </div>
        </section>

        <section className="px-4 pb-6 sm:px-6">
          <div className="mx-auto max-w-3xl rounded-2xl border border-[#e5eaf0] bg-white p-5">
            <h2 className="text-lg font-extrabold text-[#162543]">{t("publishTitle")}</h2>
            <p className="mt-1 text-[14px] leading-6 text-[#52627a]">{t("publishBody", { category })}</p>
            <Link href="/dashboard/profesional?tab=sent_projects&openPublish=1" className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-full border-[1.5px] border-[#009FD9] bg-white px-5 text-[14px] font-bold text-[#009FD9] transition-colors hover:bg-[#EBF5FB] sm:w-auto">
              {t("publishCta")}
            </Link>
          </div>
        </section>

        <section className="px-4 pb-10 sm:px-6">
          <div className="mx-auto max-w-3xl">
            <h2 className="mb-3 text-lg font-extrabold text-[#162543]">{t("howTitle")}</h2>
            <ol className="grid gap-2 sm:grid-cols-3">
              {[t("how1"), t("how2"), t("how3")].map((step, i) => (
                <li key={i} className="flex items-start gap-3 rounded-2xl border border-[#e5eaf0] bg-white p-4">
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[#eaf7fc] text-[13px] font-extrabold text-[#0089bb]">{i + 1}</span>
                  <span className="text-[14px] leading-6 text-[#162543]">{step}</span>
                </li>
              ))}
            </ol>
            {provincesWithSupply.length > 1 && (
              <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-[#68778d]">
                <span>{t("otherPlaces")}</span>
                {provincesWithSupply.filter((p) => p.id !== province?.id).map((p) => (
                  <Link key={p.id} href={`/servicios/${categoryId}/${p.id}`} className="font-semibold text-[#0089bb] hover:underline">{p.name}</Link>
                ))}
              </p>
            )}
          </div>
        </section>
      </main>
      <LandingFooter />
    </div>
  );
}
