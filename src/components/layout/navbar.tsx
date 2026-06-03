"use client";

import { useState, useRef, useEffect } from "react";
import { Menu, X, Search, LogOut, LayoutDashboard, ChevronDown } from "lucide-react";
import { useTranslations, useLocale } from "next-intl";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { Button } from "@/components/ui/button";
import { NotificationBell } from "@/components/notifications/notification-bell";
import { ContrataCRLogo } from "@/components/landing/landing-navbar";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { cn } from "@/lib/utils";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";
import { getInitials } from "@/lib/utils";

function LanguagePill() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLang(lang: string) {
    if (typeof window !== "undefined") localStorage.setItem("contratacr_lang", lang);
    router.replace(pathname, { locale: lang });
  }

  return (
    <div className="inline-flex border border-gray-200 rounded-full overflow-hidden text-[13px] font-medium shrink-0">
      {["es", "en"].map((lang) => (
        <button
          key={lang}
          onClick={() => switchLang(lang)}
          className="px-2.5 py-1 transition-colors"
          style={{
            background: locale === lang ? "#009FD9" : "transparent",
            color: locale === lang ? "#fff" : "#6b7280",
          }}
        >
          {lang.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

function UserMenu() {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  if (!user) return null;

  const role = user.user_metadata?.role as string | undefined;
  const dashboardHref = role === "professional" ? "/dashboard/profesional" : "/dashboard/cliente";
  const initials = getInitials(user.user_metadata?.full_name ?? user.email ?? "?");
  const avatarUrl = user.user_metadata?.avatar_url as string | undefined;

  async function handleSignOut() {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <div ref={ref} className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2 py-1.5 rounded-xl hover:bg-gray-50 transition-colors"
      >
        <Avatar className="h-7 w-7">
          <AvatarImage src={avatarUrl} />
          <AvatarFallback className="text-[11px] bg-[#009FD9] text-white font-semibold">
            {initials}
          </AvatarFallback>
        </Avatar>
        <ChevronDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div className="absolute right-0 top-full mt-1.5 w-52 bg-white border border-gray-100 rounded-xl shadow-lg z-50 py-1.5 overflow-hidden">
          <p className="px-3 py-1.5 text-xs text-[#9ca3af] truncate border-b border-gray-50 mb-1">
            {user.email}
          </p>
          <Link
            href={dashboardHref}
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-sm text-[#374151] hover:bg-[#f9fafb] transition-colors"
          >
            <LayoutDashboard className="h-4 w-4 text-[#009FD9]" />
            Mi panel
          </Link>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Cerrar sesión
          </button>
        </div>
      )}
    </div>
  );
}

export function Navbar() {
  const [open, setOpen] = useState(false);
  const t = useTranslations("nav");
  const { user } = useAuth();
  const router = useRouter();

  const role = user?.user_metadata?.role as string | undefined;
  const dashboardHref = role === "professional" ? "/dashboard/profesional" : "/dashboard/cliente";

  async function handleMobileSignOut() {
    setOpen(false);
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  }

  return (
    <header className="sticky top-0 z-50 w-full bg-white/96 backdrop-blur-md shadow-sm border-b border-gray-100/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-16 items-center gap-4">

          {/* Logo */}
          <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
            <ContrataCRLogo />
          </Link>

          {/* Nav links */}
          <nav className="hidden lg:flex items-center gap-0.5">
            <Link href="/buscar" className="px-4 py-2 rounded-xl text-sm font-medium text-[#374151] hover:text-[#1a2744] hover:bg-gray-50 transition-colors">
              {t("search")}
            </Link>
            <Link href="/categorias" className="px-4 py-2 rounded-xl text-sm font-medium text-[#374151] hover:text-[#1a2744] hover:bg-gray-50 transition-colors">
              {t("categories")}
            </Link>
            <Link href="/como-funciona" className="px-4 py-2 rounded-xl text-sm font-medium text-[#374151] hover:text-[#1a2744] hover:bg-gray-50 transition-colors">
              {t("howItWorks")}
            </Link>
          </nav>

          {/* Spacer */}
          <div className="flex-1" />

          {/* Right actions */}
          <div className="hidden lg:flex items-center gap-1 shrink-0">
            {user ? (
              <>
                <Link
                  href={dashboardHref}
                  className="text-sm font-medium px-3 py-2 text-[#374151] hover:text-[#1a2744] transition-colors whitespace-nowrap"
                >
                  Mi panel
                </Link>
                <NotificationBell />
                <UserMenu />
                <LanguagePill />
              </>
            ) : (
              <>
                <Link
                  href="/registro/profesional"
                  className="ml-1 inline-flex items-center bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)] whitespace-nowrap"
                >
                  Registrarse como profesional
                </Link>
                <Link
                  href="/login"
                  className="text-sm font-medium px-3 py-2 rounded-xl text-[#374151] hover:bg-gray-50 transition-colors"
                >
                  {t("login")}
                </Link>
                <NotificationBell />
                <LanguagePill />
              </>
            )}
          </div>

          {/* Mobile hamburger */}
          <button
            onClick={() => setOpen(!open)}
            className="lg:hidden p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
            aria-label="Menú"
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {/* Mobile drawer */}
      <div className={cn(
        "lg:hidden bg-white border-t border-gray-100 overflow-hidden transition-all duration-300 ease-in-out",
        open ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
      )}>
        <nav className="px-4 py-4 flex flex-col gap-1">
          <Link href="/buscar" onClick={() => setOpen(false)} className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            <Search className="h-4 w-4" />
            {t("searchProfessionals")}
          </Link>
          <Link href="/categorias" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            {t("categories")}
          </Link>
          <Link href="/como-funciona" onClick={() => setOpen(false)} className="px-3 py-2.5 rounded-xl text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
            {t("howItWorks")}
          </Link>
          <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
            <div className="flex items-center justify-between px-1 pb-1">
              <span className="text-xs text-gray-400 font-medium">Idioma / Language</span>
              <LanguagePill />
            </div>
            {user ? (
              <>
                <Link href={dashboardHref} onClick={() => setOpen(false)}>
                  <Button variant="outline" size="md" className="w-full">
                    <LayoutDashboard className="h-4 w-4" />
                    Mi panel
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="md"
                  className="w-full text-red-600 hover:bg-red-50"
                  onClick={handleMobileSignOut}
                >
                  <LogOut className="h-4 w-4" />
                  Cerrar sesión
                </Button>
              </>
            ) : (
              <>
                <Link href="/login" onClick={() => setOpen(false)}>
                  <Button variant="outline" size="md" className="w-full">{t("login")}</Button>
                </Link>
                <Link href="/registro/profesional" onClick={() => setOpen(false)}>
                  <Button size="md" className="w-full">Registrarse como profesional</Button>
                </Link>
              </>
            )}
          </div>
        </nav>
      </div>
    </header>
  );
}
