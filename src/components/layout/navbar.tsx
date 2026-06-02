"use client";

import { useState } from "react";
import { Menu, X, Search } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { cn } from "@/lib/utils";

function LanguageToggle() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const t = useTranslations("nav");

  function toggle() {
    const next = locale === "es" ? "en" : "es";
    if (typeof window !== "undefined") {
      localStorage.setItem("preferred-locale", next);
    }
    router.replace(pathname, { locale: next });
  }

  return (
    <button
      onClick={toggle}
      className="px-2.5 py-1 rounded-lg border border-[#e5e7eb] text-xs font-semibold text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] transition-colors"
      aria-label="Switch language"
    >
      {t("langToggle")}
    </button>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");

  return (
    <header className="sticky top-0 z-50 w-full border-b border-[#e5e7eb] bg-white/95 backdrop-blur-sm">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center justify-between">

          <Link href="/" aria-label="ContrataCR inicio">
            <ContrataCRLogo />
          </Link>

          <nav className="hidden md:flex items-center gap-6">
            <Link href="/buscar" className="text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors font-medium">
              {t("search")}
            </Link>
            <Link href="/categorias" className="text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors font-medium">
              {t("categories")}
            </Link>
            <Link href="/como-funciona" className="text-sm text-[#6b7280] hover:text-[#009FD9] transition-colors font-medium">
              {t("howItWorks")}
            </Link>
          </nav>

          <div className="hidden md:flex items-center gap-3">
            <LanguageToggle />
            <NotificationBell />
            <Button variant="ghost" size="sm" asChild>
              <Link href="/login">{t("login")}</Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/registro">{t("register")}</Link>
            </Button>
          </div>

          <button
            onClick={() => setOpen(!open)}
            className="md:hidden p-2 rounded-xl text-[#6b7280] hover:bg-[#f3f4f6] transition-colors"
            aria-label="Menú"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      <div className={cn("md:hidden border-t border-[#e5e7eb] bg-white overflow-hidden transition-all duration-200", open ? "max-h-80" : "max-h-0")}>
        <nav className="px-4 py-4 flex flex-col gap-1">
          <Link href="/buscar" onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            <Search className="h-4 w-4" />
            {t("searchProfessionals")}
          </Link>
          <Link href="/categorias" onClick={() => setOpen(false)}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            {t("categories")}
          </Link>
          <Link href="/como-funciona" onClick={() => setOpen(false)}
            className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            {t("howItWorks")}
          </Link>
          <div className="border-t border-[#e5e7eb] my-2" />
          <div className="flex items-center justify-between px-3 py-1">
            <span className="text-xs text-[#6b7280]">Idioma / Language</span>
            <LanguageToggle />
          </div>
          <Link href="/login" onClick={() => setOpen(false)}>
            <Button variant="outline" size="md" className="w-full">{t("login")}</Button>
          </Link>
          <Link href="/registro" onClick={() => setOpen(false)}>
            <Button size="md" className="w-full">{t("register")}</Button>
          </Link>
        </nav>
      </div>
    </header>
  );
}
