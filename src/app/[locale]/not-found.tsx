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
      <main className="relative flex-1 flex items-center justify-center py-20 px-4 overflow-hidden">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[400px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
        <div className="relative text-center max-w-md">
          <p className="text-6xl font-extrabold text-[#009FD9] mb-3">404</p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2">{t("title")}</h1>
          <p className="text-[#6b7280] mb-8">{t("desc")}</p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Button asChild size="lg">
              <Link href="/">{t("home")}</Link>
            </Button>
            <Button asChild size="lg" variant="outline">
              <Link href="/buscar"><Search className="h-4 w-4" /> Buscar profesionales</Link>
            </Button>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
