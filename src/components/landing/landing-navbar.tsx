"use client";

import { useState, useEffect, useRef } from "react";
import { ChevronDown, X, Menu, Mail, Lock, Eye, EyeOff } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

const EXPLORE_SECTIONS = [
  {
    title: "Hogar",
    items: ["Limpieza del hogar", "Plomería", "Electricidad", "Pintura interior", "Carpintería", "Remodelación"],
  },
  {
    title: "Exterior",
    items: ["Jardinería", "Construcción", "Lavado a presión", "Mudanzas", "Impermeabilización"],
  },
  {
    title: "Tecnología",
    items: ["Soporte técnico", "Redes y WiFi", "Seguridad CCTV", "Diseño web", "Recuperación de datos"],
  },
  {
    title: "Bienestar",
    items: ["Belleza y estética", "Entrenamiento personal", "Masajes", "Nutrición", "Yoga"],
  },
];

/* ─── Login Modal ─── */
function LoginModal({ onClose }: { onClose: () => void }) {
  const [showPw, setShowPw] = useState(false);
  const [mode, setMode] = useState<"login" | "register">("login");
  const overlayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
      <div
        ref={overlayRef}
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />
      <div
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-[420px] p-8 z-10"
        style={{ animation: "modalIn 0.22s cubic-bezier(0.16,1,0.3,1) both" }}
      >
        <style>{`
          @keyframes modalIn {
            from { opacity:0; transform:scale(0.95) translateY(12px); }
            to   { opacity:1; transform:scale(1) translateY(0); }
          }
        `}</style>

        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-full hover:bg-gray-100 transition-colors text-gray-400 hover:text-gray-600"
          aria-label="Cerrar"
        >
          <X className="h-4 w-4" />
        </button>

        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-4">
            <svg width="18" height="18" viewBox="0 0 22 22" fill="none">
              <path d="M11 1L21 11L11 21L1 11L11 1Z" fill="#2563EB" />
            </svg>
            <span className="text-sm font-bold text-[#1a2744]">Contrata<span className="text-[#2563EB]">CR</span></span>
          </div>
          <h2 className="text-2xl font-bold text-[#1a2744]">
            {mode === "login" ? "Bienvenido de vuelta" : "Crear cuenta gratis"}
          </h2>
          <p className="text-sm text-gray-400 mt-1">
            {mode === "login" ? "Iniciá sesión para continuar" : "Registrate en segundos"}
          </p>
        </div>

        {/* Social auth */}
        <div className="space-y-3 mb-5">
          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 transition-all text-sm font-medium text-gray-700 active:scale-[0.98]">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continuar con Google
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl border border-gray-200 hover:border-gray-300 hover:bg-gray-50/80 transition-all text-sm font-medium text-gray-700 active:scale-[0.98]">
            <svg className="h-5 w-5 shrink-0 text-[#1877F2]" viewBox="0 0 24 24" fill="currentColor">
              <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
            </svg>
            Continuar con Facebook
          </button>

          <button className="w-full flex items-center gap-3 px-4 py-3 rounded-xl bg-black hover:bg-gray-900 transition-all text-sm font-medium text-white active:scale-[0.98]">
            <svg className="h-5 w-5 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M12.152 6.896c-.948 0-2.415-1.078-3.96-1.04-2.04.027-3.91 1.183-4.961 3.014-2.117 3.675-.546 9.103 1.519 12.09 1.013 1.454 2.208 3.09 3.792 3.039 1.52-.065 2.09-.987 3.935-.987 1.831 0 2.35.987 3.96.948 1.637-.026 2.676-1.48 3.676-2.948 1.156-1.688 1.636-3.325 1.662-3.415-.039-.013-3.182-1.221-3.22-4.857-.026-3.04 2.48-4.494 2.597-4.559-1.429-2.09-3.623-2.324-4.39-2.376-2-.156-3.675 1.09-4.61 1.09zM15.53 3.83c.843-1.012 1.4-2.427 1.245-3.83-1.207.052-2.662.805-3.532 1.818-.78.896-1.454 2.338-1.273 3.714 1.338.104 2.715-.688 3.559-1.701"/>
            </svg>
            Continuar con Apple
          </button>
        </div>

        <div className="flex items-center gap-3 mb-5">
          <div className="flex-1 h-px bg-gray-100" />
          <span className="text-xs text-gray-400 font-medium">o</span>
          <div className="flex-1 h-px bg-gray-100" />
        </div>

        {/* Email + Password */}
        <div className="space-y-3 mb-4">
          <div className="relative">
            <Mail className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <input
              type="email"
              placeholder="Correo electrónico"
              className="w-full pl-10 pr-4 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all bg-gray-50/50 hover:bg-white placeholder:text-gray-400"
            />
          </div>
          <div className="relative">
            <Lock className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-300" />
            <input
              type={showPw ? "text" : "password"}
              placeholder="Contraseña"
              className="w-full pl-10 pr-10 py-3 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB]/30 focus:border-[#2563EB] transition-all bg-gray-50/50 hover:bg-white placeholder:text-gray-400"
            />
            <button
              type="button"
              onClick={() => setShowPw(!showPw)}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-gray-300 hover:text-gray-500 transition-colors"
            >
              {showPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
          <button className="w-full py-3 rounded-xl bg-[#2563EB] hover:bg-[#1d4ed8] text-white font-semibold text-sm transition-all active:scale-[0.98] shadow-sm hover:shadow-md">
            {mode === "login" ? "Iniciar sesión" : "Crear cuenta"}
          </button>
        </div>

        <p className="text-center text-sm text-gray-400">
          {mode === "login" ? (
            <>¿No tenés cuenta?{" "}
              <button onClick={() => setMode("register")} className="text-[#2563EB] font-semibold hover:underline">
                Registrate gratis
              </button>
            </>
          ) : (
            <>¿Ya tenés cuenta?{" "}
              <button onClick={() => setMode("login")} className="text-[#2563EB] font-semibold hover:underline">
                Iniciá sesión
              </button>
            </>
          )}
        </p>
      </div>
    </div>
  );
}

/* ─── Navbar ─── */
export function LandingNavbar() {
  const [scrolled, setScrolled] = useState(false);
  const [showLogin, setShowLogin] = useState(false);
  const [explorarOpen, setExplorarOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const explorarTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const handler = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  function openExplorar() {
    if (explorarTimeout.current) clearTimeout(explorarTimeout.current);
    setExplorarOpen(true);
  }

  function closeExplorar() {
    explorarTimeout.current = setTimeout(() => setExplorarOpen(false), 150);
  }

  return (
    <>
      <header
        className={cn(
          "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
          scrolled
            ? "bg-white/96 backdrop-blur-md shadow-sm border-b border-gray-100/80"
            : "bg-transparent"
        )}
      >
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="flex h-16 items-center justify-between gap-6">

            {/* Logo */}
            <Link href="/" className="flex items-center gap-2 shrink-0">
              <svg width="22" height="22" viewBox="0 0 22 22" fill="none">
                <path d="M11 1L21 11L11 21L1 11L11 1Z" fill="#2563EB"/>
              </svg>
              <span className="text-lg font-extrabold tracking-tight text-[#1a2744]">
                Contrata<span className="text-[#2563EB]">CR</span>
              </span>
            </Link>

            {/* Center — Explorar dropdown */}
            <nav className="hidden md:flex items-center flex-1 justify-center">
              <div className="relative" onMouseEnter={openExplorar} onMouseLeave={closeExplorar}>
                <button
                  className={cn(
                    "flex items-center gap-1 px-4 py-2 rounded-xl text-sm font-medium transition-colors",
                    scrolled
                      ? "text-[#374151] hover:bg-gray-100"
                      : "text-[#1a2744] hover:bg-black/5"
                  )}
                >
                  Explorar
                  <ChevronDown className={cn("h-3.5 w-3.5 transition-transform duration-200", explorarOpen && "rotate-180")} />
                </button>

                {explorarOpen && (
                  <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 bg-white rounded-2xl shadow-2xl border border-gray-100 p-6 w-[660px] grid grid-cols-4 gap-6 z-50">
                    {/* Arrow */}
                    <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white border-l border-t border-gray-100 rotate-45" />
                    {EXPLORE_SECTIONS.map((sec) => (
                      <div key={sec.title}>
                        <h4 className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mb-3">
                          {sec.title}
                        </h4>
                        <ul className="space-y-2.5">
                          {sec.items.map((item) => (
                            <li key={item}>
                              <Link
                                href="/buscar"
                                className="text-sm text-gray-600 hover:text-[#2563EB] transition-colors leading-tight"
                              >
                                {item}
                              </Link>
                            </li>
                          ))}
                        </ul>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </nav>

            {/* Right actions */}
            <div className="hidden md:flex items-center gap-2 shrink-0">
              <button
                onClick={() => setShowLogin(true)}
                className={cn(
                  "text-sm font-medium px-3 py-2 rounded-xl transition-colors",
                  scrolled ? "text-[#374151] hover:bg-gray-100" : "text-[#1a2744] hover:bg-black/5"
                )}
              >
                Iniciar sesión
              </button>
              <Link
                href="/registro/profesional"
                className="inline-flex items-center bg-[#2563EB] hover:bg-[#1d4ed8] text-white text-sm font-semibold px-5 py-2.5 rounded-full transition-all duration-150 active:scale-[0.97] shadow-sm hover:shadow-[0_4px_20px_rgba(37,99,235,0.35)]"
              >
                Únete como profesional
              </Link>
            </div>

            {/* Mobile toggle */}
            <button
              onClick={() => setMobileOpen(!mobileOpen)}
              className="md:hidden p-2 rounded-xl text-[#1a2744] hover:bg-black/5 transition-colors"
              aria-label="Menú"
            >
              {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile drawer */}
        <div
          className={cn(
            "md:hidden bg-white border-t border-gray-100 overflow-hidden transition-all duration-300 ease-in-out",
            mobileOpen ? "max-h-[80vh] opacity-100" : "max-h-0 opacity-0"
          )}
        >
          <div className="px-4 py-4 overflow-y-auto max-h-[70vh]">
            {EXPLORE_SECTIONS.map((sec) => (
              <div key={sec.title} className="mb-4">
                <p className="px-2 py-1 text-[10px] font-bold text-gray-400 uppercase tracking-widest">{sec.title}</p>
                {sec.items.slice(0, 4).map((item) => (
                  <Link
                    key={item}
                    href="/buscar"
                    onClick={() => setMobileOpen(false)}
                    className="block px-2 py-2 text-sm text-gray-600 hover:text-[#2563EB] transition-colors"
                  >
                    {item}
                  </Link>
                ))}
              </div>
            ))}
            <div className="border-t border-gray-100 pt-4 flex flex-col gap-2">
              <button
                onClick={() => { setShowLogin(true); setMobileOpen(false); }}
                className="w-full px-4 py-3 rounded-xl text-sm font-medium text-[#374151] border border-gray-200 hover:bg-gray-50 transition-colors text-left"
              >
                Iniciar sesión
              </button>
              <Link
                href="/registro/profesional"
                onClick={() => setMobileOpen(false)}
                className="w-full block px-4 py-3 rounded-full bg-[#2563EB] text-white text-sm font-semibold text-center hover:bg-[#1d4ed8] transition-colors"
              >
                Únete como profesional
              </Link>
            </div>
          </div>
        </div>
      </header>

      {showLogin && <LoginModal onClose={() => setShowLogin(false)} />}
    </>
  );
}
