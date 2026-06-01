import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";

export async function Footer() {
  const t = await getTranslations("footer");

  return (
    <footer className="border-t border-[#e5e7eb] bg-white mt-16">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8 py-12">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="md:col-span-1">
            <div className="flex items-center gap-2 mb-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-xl bg-[#319278]">
                <span className="text-white font-bold text-sm">C</span>
              </div>
              <span className="font-bold text-[#111827] text-lg">
                Contrata<span className="text-[#319278]">CR</span>
              </span>
            </div>
            <p className="text-sm text-[#6b7280] leading-relaxed">{t("tagline")}</p>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">{t("clients.title")}</h3>
            <ul className="space-y-2">
              <li><Link href="/buscar" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("clients.search")}</Link></li>
              <li><Link href="/como-funciona" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("clients.howItWorks")}</Link></li>
              <li><Link href="/categorias" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("clients.categories")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">{t("pros.title")}</h3>
            <ul className="space-y-2">
              <li><Link href="/registro/profesional" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("pros.register")}</Link></li>
              <li><Link href="/como-funciona" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("pros.howItWorks")}</Link></li>
              <li><Link href="/planes" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("pros.plans")}</Link></li>
            </ul>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-[#111827] mb-3">{t("company.title")}</h3>
            <ul className="space-y-2">
              <li><Link href="/nosotros" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("company.about")}</Link></li>
              <li><Link href="/contacto" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("company.contact")}</Link></li>
              <li><Link href="/terminos" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("company.terms")}</Link></li>
              <li><Link href="/privacidad" className="text-sm text-[#6b7280] hover:text-[#319278] transition-colors">{t("company.privacy")}</Link></li>
            </ul>
          </div>
        </div>

        <div className="border-t border-[#e5e7eb] mt-10 pt-6 flex flex-col sm:flex-row items-center justify-between gap-2">
          <p className="text-xs text-[#9ca3af]">{t("rights")}</p>
          <p className="text-xs text-[#9ca3af]">{t("madeIn")}</p>
        </div>
      </div>
    </footer>
  );
}
