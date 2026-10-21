import { HomeRecoveryLink } from "@/components/error/home-recovery-link";
import { getLocale } from "next-intl/server";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Compass, Search } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";

export default async function NotFound() {
  const [t, locale] = await Promise.all([getTranslations("notFound"), getLocale()]);

  return (
    <ErrorScreen
      code={t("code")}
      icon={<Compass className="h-7 w-7" />}
      title={t("title")}
      message={t("desc")}
    >
      <HomeRecoveryLink href={rutaConIdioma(locale, "/")} className={errorPrimaryBtn}>{t("home")}</HomeRecoveryLink>
      <Link href="/profesionales" className={errorSecondaryBtn}>
        <Search className="h-4 w-4" /> {t("search")}
      </Link>
    </ErrorScreen>
  );
}
