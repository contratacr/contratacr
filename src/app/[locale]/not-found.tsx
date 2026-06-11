import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Compass, Search } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <ErrorScreen
      code={t("code")}
      icon={<Compass className="h-7 w-7" />}
      title={t("title")}
      message={t("desc")}
    >
      <Link href="/" className={errorPrimaryBtn}>{t("home")}</Link>
      <Link href="/buscar" className={errorSecondaryBtn}>
        <Search className="h-4 w-4" /> {t("search")}
      </Link>
    </ErrorScreen>
  );
}
