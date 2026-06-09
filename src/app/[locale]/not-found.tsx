import { getTranslations } from "next-intl/server";
import { Link } from "@/i18n/navigation";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Search } from "lucide-react";

export default async function NotFound() {
  const t = await getTranslations("notFound");

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center py-12 px-4">
        <div className="text-center">
          <div className="flex h-20 w-20 mx-auto items-center justify-center rounded-full bg-[#EBF5FB] mb-6">
            <Search className="h-9 w-9 text-[#009FD9]" />
          </div>
          <h1 className="text-3xl font-bold text-[#111827] mb-2">{t("title")}</h1>
          <p className="text-[#6b7280] mb-8 max-w-sm mx-auto">{t("desc")}</p>
          <Button asChild size="lg">
            <Link href="/">{t("home")}</Link>
          </Button>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
