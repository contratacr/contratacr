"use client";

import { useState, useEffect, useRef } from "react";
import { X, Menu, Mail, Lock, Eye, EyeOff, AlertCircle, ChevronDown, Search, MapPin } from "lucide-react";
import { Link, useRouter, usePathname } from "@/i18n/navigation";
import { useLocale } from "next-intl";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const PROVINCES = [
  "San José", "Alajuela", "Cartago", "Heredia",
  "Guanacaste", "Puntarenas", "Limón",
];

/* ─── Logo ─── */
export function ContrataCRLogo({ className }: { className?: string }) {
  return (
    <div className={cn("flex items-center select-none", className)}>
      {/* TODO: AI DESIGN TEAM — ContrataCR wordmark SVG goes here */}
      <span className="text-[17px] font-extrabold tracking-tight leading-none">
        <span className="text-[#1a2744]">Contrata</span>
        <span className="text-[#009FD9]">CR</span>
      </span>
    </div>
  );
}

/* ─── Language Toggle Pill ─── */
function LanguageTogglePill() {
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();

  function switchLang(lang: string) {
    if (typeof window !== "undefined") {
      localStorage.setItem("contratacr_lang", lang);
    }
    router.replace(pathname, { locale: lang });
  }

  return (
    <div className="inline-flex border border-gray-200 rounded-full overflow-hidden text-[13px] font-medium shrink-0">
      {["es", "en"].map((lang) => {
        const active = locale === lang;
        return (
          <button
            key={lang}
            onClick={() => switchLang(lang)}
            className="px-2.5 py-1 transition-colors"
            style={{
              background: active ? "#009FD9" : "transparent",
              color: active ? "#fff" : "#6b7280",
            }}
          >
            {lang.toUpperCase()}
          </button>
        );
      })}
    </div>
  );
}

/* ─── Dropdown data ─── */
const NAV_MENUS = [
  {
    id: "interior",
    label: "Interior",
    columns: [
      {
        heading: "Hogar",
        links: [
          "Limpieza del hogar",
          "Plomería",
          "Electricidad",
          "Pintura interior",
          "Carpintería",
          "Remodelación",
        ],
      },
    ],
  },
  {
    id: "exterior",
    label: "Exterior",
    columns: [
      {
        heading: "Al aire libre",
        links: [
          "Jardinería",
          "Construcción",
          "Lavado a presión",
          "Impermeabilización",
          "Mudanzas",
          "Piscinas",
        ],
      },
    ],
  },
  {
    id: "mas",
    label: "Más servicios",
    columns: [
      {
        heading: "Tecnología",
        links: ["Soporte técnico", "Redes y WiFi", "Seguridad CCTV", "Diseño web"],
      },
      {
        heading: "Bienestar",
        links: ["Belleza y estética", "Entrenamiento personal", "Masajes", "Nutrición"],
      },
      {
        heading: "Vehículos",
        links: ["Mecánica automotriz", "Lavado de autos", "Cerrajería"],
      },
    ],
  },
  {
    id: "recursos",
    label: "Recursos",
    columns: [
      {
        heading: "Aprendé",
        links: ["Guías de precios", "Cómo funciona", "Centro de ayuda"],
      },
      {
        heading: "Profesionales",
        links: ["Registrá tu perfil", "Para profesionales", "Verificación de cédula"],
      },
    ],
  },
];

/* ─── Login Modal ─── */
function LoginModal({ onClose }: { onClose: () => void }) {
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  const callbackUrl = typeof window !== "undefined"
    ? `${window.location.origin}/auth/callback`
    : "/auth/callback";

  async function handleOAuth(provider: "google" | "facebook" | "apple") {
    setLoading(true); setError(null);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({ provider, options: { redirectTo: callbackUrl } });
    if (error) { setError(error.message); setLoading(false); }
  }

  async function handleEmailAuth(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { setError("Completá todos los campos."); return; }
    setLoading(true); setError(null);
    const supabase = createClient();
    if (mode === "login") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      if (error) { setError("Correo o contraseña incorrectos."); setLoading(false); return; }
      onClose();
    } else {
      const { error } = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: callbackUrl } });
      if (error) { setError(error.message); setLoading(false); return; }
      setSuccess("¡Revisá tu correo para confirmar tu cuenta!");
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px] p-8 z-10"
        style={{ animation: "modalIn 0.22s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <style>{`@keyframes modalIn{from{opacity:0;transform:scale(0.95) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}`}</style>
        <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400">
          <X className="h-4 w-4" />
        </button>
        <div className="mb-6">
          <ContrataCRLogo className="mb-4" />
          <h2 className="text-2xl font-bold text-[#1a2744]">
            {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta gratis"}
          </h2>
          <p className="text-sm text-gray-400 mt-1">{mode === "login" ? "Iniciá sesión para continuar" : "Registrate en segundos"}</p>
        </div>

        {success ? (
          <div className="text-center py-6">
            <div className="text-4xl mb-3">📧</div>
            <p className="font-semibold text-[#1a2744] mb-2">¡Revisá tu correo!</p>
            <p className="text-sm text-gray-400">{success}</p>
            <button onClick={onClose} className="mt-6 text-sm text-[#009FD9] hover:underline">Cerrar</button>
          </div>
        ) : (
          <>
            <div className="space-y-3 mb-5">
              <button onClick={() => handleOAuth("google")} disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 active:scale-[0.98] disabled:opacity-60">
                <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                Continuar con Google
              </button>
              <button onClick={() => handleOAuth("facebook")} disabled={loading}
                className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:bg-gray-50 transition-all text-sm font-medium text-gray-700 active:scale-[0.98] disabled:opacity-60">
                <svg className="h-5 w-5 shrink-0 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                </svg>
                Continuar con Facebook
              </button>
            </div>

            <div className="flex items-center gap-3 mb-5">
              <div className="flex-1 h-px bg-gray-100" /><span className="text-xs text-gray-400 font-medium">o</span><div className="flex-1 h-px bg-gray-100" />
            </div>

            <form onSubmit={handleEmailAuth} className="space-y-3 mb-4">
              {error && (
                <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-xs text-red-600">
                  <AlertCircle className="h-3.5 w-3.5 shrink-0" />{error}
                </div>
              )}
              <div className="relative">
                <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Correo electrónico"
                  className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 placeholder:text-gray-400" />
              </div>
              <div className="relative">
                <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)} placeholder="Contraseña"
                  className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9]/30 focus:border-[#009FD9] transition-all bg-gray-50/50 placeholder:text-gray-400" />
                <button type="button" onClick={() => setShowPw(!showPw)} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500">
                  {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </button>
              </div>
              <button type="submit" disabled={loading}
                className="w-full py-3 rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-bold text-sm transition-all active:scale-[0.98] disabled:opacity-60 flex items-center justify-center gap-2">
                {loading && <span className="h-4 w-4 rounded-full border-2 border-white/30 border-t-white animate-spin" />}
                {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
              </button>
            </form>

            <p className="text-center text-sm text-gray-400">
              {mode === "login" ? (
                <>¿No tenés cuenta?{" "}
                  <button onClick={() => { setMode("register"); setError(null); }} className="text-[#009FD9] font-semibold hover:underline">Registrate gratis</button>
                </>
              ) : (
                <>¿Ya tenés cuenta?{" "}
                  <button onClick={() => { setMode("login"); setError(null); }} className="text-[#009FD9] font-semibold hover:underline">Iniciá sesión</button>
                </>
              )}
            </p>
          </>
        )}
      </div>
    </div>
  );
}

/* ─── Navbar ─── */
export function LandingNavbar() {
  const [compact, setCompact] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [openMenu, setOpenMenu] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [provinceQuery, setProvinceQuery] = useState("");
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const router = useRouter();

  useEffect(() => {
    const sentinel = document.getElementById("hero-search-sentinel");
    if (!sentinel) {
      // Non-landing pages: fallback to scrollY
      const handler = () => setCompact(window.scrollY > 300);
      window.addEventListener("scroll", handler, { passive: true });
      return () => window.removeEventListener("scroll", handler);
    }
    const observer = new IntersectionObserver(
      ([entry]) => setCompact(!entry.isIntersecting),
      { threshold: 0, rootMargin: "-64px 0px 0px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, []);

  function openDropdown(id: string) {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    setOpenMenu(id);
  }
  function closeDropdown() {
    closeTimer.current = setTimeout(() => setOpenMenu(null), 120);
  }

  function handleCompactSearch(e: React.FormEvent) {
    e.preventDefault();
    const params = new URLSearchParams();
    if (searchQuery.trim()) params.set("q", searchQuery.trim());
    if (provinceQuery) params.set("provincia", provinceQuery);
    router.push(`/buscar?${params.toString()}`);
  }

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          "bg-white/96 backdrop-blur-md shadow-sm border-b border-gray-100/80"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          {/* Relative container for absolute-positioned rows */}
          <div className="relative h-16">

            {/* ── Default row ── */}
            <div
              className="absolute inset-0 flex items-center gap-4 transition-opacity duration-300"
              style={{ opacity: compact ? 0 : 1, pointerEvents: compact ? "none" : "auto" }}
            >
              {/* Logo */}
              <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
                <ContrataCRLogo />
              </Link>

              {/* Nav links directly after logo */}
              <nav className="hidden lg:flex items-center gap-0.5">
                {NAV_MENUS.map((menu) => (
                  <div
                    key={menu.id}
                    className="relative"
                    onMouseEnter={() => openDropdown(menu.id)}
                    onMouseLeave={closeDropdown}
                  >
                    <button
                      className={cn(
                        "flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                        openMenu === menu.id ? "text-[#1a2744] bg-gray-50" : "text-[#374151] hover:text-[#1a2744] hover:bg-gray-50"
                      )}
                    >
                      {menu.label}
                      <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", openMenu === menu.id && "rotate-180")} />
                    </button>

                    {/* Dropdown panel */}
                    {openMenu === menu.id && (
                      <div
                        className={cn(
                          "absolute top-full left-1/2 -translate-x-1/2 mt-1.5 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 z-50 min-w-[220px]",
                          menu.columns.length > 1 && "grid gap-8"
                        )}
                        style={{
                          gridTemplateColumns: `repeat(${menu.columns.length}, minmax(160px, 1fr))`,
                          animation: "tab-cards-in 0.15s ease both",
                        }}
                      >
                        {/* Arrow pip */}
                        <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-gray-100 rotate-45" />
                        {menu.columns.map((col) => (
                          <div key={col.heading}>
                            <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">{col.heading}</h4>
                            <ul className="space-y-2.5">
                              {col.links.map((link) => (
                                <li key={link}>
                                  <Link href="/buscar" className="text-sm text-gray-600 hover:text-[#009FD9] transition-colors leading-tight block">
                                    {link}
                                  </Link>
                                </li>
                              ))}
                            </ul>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </nav>

              {/* Spacer */}
              <div className="flex-1" />

              {/* Right actions: Registrarse como profesional → Iniciar sesión → ES/EN */}
              <div className="hidden lg:flex items-center gap-1 shrink-0">
                <Link
                  href="/registro/profesional"
                  className="ml-1 inline-flex items-center bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-5 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(0,159,217,0.35)] whitespace-nowrap"
                >
                  Registrarse como profesional
                </Link>
                <button
                  onClick={() => setShowLogin(true)}
                  className="text-sm font-medium px-3 py-2 rounded-xl text-[#374151] hover:bg-gray-50 transition-colors"
                >
                  Iniciar sesión
                </button>
                <LanguageTogglePill />
              </div>

              {/* Mobile toggle */}
              <button
                onClick={() => setMobileOpen(!mobileOpen)}
                className="lg:hidden p-2 rounded-xl text-[#1a2744] hover:bg-gray-50 transition-colors"
                aria-label="Menú"
              >
                {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
              </button>
            </div>

            {/* ── Compact row (shown when scrollY > 500) ── */}
            <div
              className="absolute inset-0 flex items-center gap-3 transition-opacity duration-300"
              style={{ opacity: compact ? 1 : 0, pointerEvents: compact ? "auto" : "none" }}
            >
              {/* Small logo */}
              <Link href="/" aria-label="ContrataCR inicio" className="shrink-0">
                <ContrataCRLogo />
              </Link>

              {/* Search bar — same layout as hero */}
              <form onSubmit={handleCompactSearch} className="flex-1 min-w-0">
                <div className="flex items-center h-11 sm:h-12 bg-white border border-gray-200 rounded-[6px] overflow-hidden pl-4 pr-2 shadow-[0_4px_20px_rgba(0,0,0,0.10)]">
                  {/* Text input */}
                  <div className="flex items-center gap-2 flex-1 min-w-0 h-full">
                    <Search className="h-4 w-4 sm:h-5 sm:w-5 text-gray-300 shrink-0" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Describí tu proyecto o problema…"
                      className="flex-1 text-sm sm:text-base text-gray-700 placeholder:text-gray-400 bg-transparent focus:outline-none min-w-0"
                    />
                  </div>
                  {/* Divider + province select — visible from md up */}
                  <div className="hidden md:flex items-center h-full">
                    <div className="w-px bg-gray-200 self-stretch my-2 mx-2 shrink-0" />
                    <div className="flex items-center gap-1.5 min-w-[120px] shrink-0">
                      <MapPin className="h-4 w-4 text-gray-300 shrink-0" />
                      <select
                        value={provinceQuery}
                        onChange={(e) => setProvinceQuery(e.target.value)}
                        className="flex-1 text-sm text-gray-500 bg-transparent focus:outline-none appearance-none cursor-pointer"
                      >
                        <option value="">Ubicación</option>
                        {PROVINCES.map((p) => <option key={p} value={p}>{p}</option>)}
                      </select>
                    </div>
                  </div>
                  {/* Buscar button */}
                  <button
                    type="submit"
                    className="ml-2 h-8 sm:h-9 px-5 sm:px-7 bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold rounded-[4px] transition-all duration-150 active:scale-[0.97] whitespace-nowrap shrink-0"
                  >
                    Buscar
                  </button>
                </div>
              </form>

              {/* Right: Registrarse como profesional + lang toggle */}
              <div className="hidden sm:flex items-center gap-2 shrink-0">
                <Link
                  href="/registro/profesional"
                  className="inline-flex items-center bg-[#009FD9] hover:bg-[#0089bb] text-white text-sm font-bold px-4 py-2 rounded-full transition-all duration-150 active:scale-[0.97] whitespace-nowrap"
                >
                  Registrarse
                </Link>
                <LanguageTogglePill />
              </div>
            </div>

          </div>
        </div>

        {/* Mobile drawer */}
        <div className={cn(
          "lg:hidden bg-white border-t border-gray-100 overflow-hidden transition-all duration-300 ease-in-out",
          mobileOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
        )}>
          <div className="px-4 py-4 overflow-y-auto max-h-[70vh]">
            {NAV_MENUS.map((menu) => (
              <div key={menu.id} className="mb-4">
                <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{menu.label}</p>
                {menu.columns.flatMap((col) => col.links).slice(0, 5).map((link) => (
                  <Link key={link} href="/buscar" onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 text-sm text-gray-600 hover:text-[#009FD9] transition-colors">
                    {link}
                  </Link>
                ))}
              </div>
            ))}
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
              {/* Language toggle visible on mobile */}
              <div className="flex items-center justify-between px-1 pb-1">
                <span className="text-xs text-gray-400 font-medium">Idioma / Language</span>
                <LanguageTogglePill />
              </div>
              <button onClick={() => { setShowLogin(true); setMobileOpen(false); }}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-[#374151] border border-gray-200 hover:bg-gray-50 text-left">
                Iniciar sesión
              </button>
              <Link href="/registro/profesional" onClick={() => setMobileOpen(false)}
                className="w-full block px-4 py-3 rounded-full bg-[#009FD9] text-white text-sm font-bold text-center hover:bg-[#0089bb] transition-colors">
                Registrarse como profesional
              </Link>
            </div>
          </div>
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
