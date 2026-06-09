"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import { LandingNavbar } from "@/components/landing/landing-navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { FadeInUp } from "@/components/landing/fade-in-up";
import { Link } from "@/i18n/navigation";
import { normalizeText } from "@/lib/data/categories";
import {
  Home, Leaf, Sparkles, Laptop, Briefcase, Heart, Star, BookOpen,
  Truck, CalendarDays, Shield, Car, Search, X, Check, ArrowRight,
} from "lucide-react";

const GROUPS = [
  { key: "hogar", Icon: Home, ids: ["plomeria","electricidad","construccion","pintura","carpinteria","remodelacion","techos","pisos","impermeabilizacion","fumigacion","cerrajeria","aire_acondicionado","calentadores","ventanas_puertas","soldadura","gypsum"] },
  { key: "jardin", Icon: Leaf, ids: ["jardineria","poda_arboles","paisajismo","limpieza_piscinas","riego_automatizado","control_plagas"] },
  { key: "limpieza", Icon: Sparkles, ids: ["limpieza","limpieza_oficinas","desinfeccion","lavado_alfombras","limpieza_post_construccion","lavado_vehiculos"] },
  { key: "tecnologia", Icon: Laptop, ids: ["reparacion_computadoras","redes_internet","camaras_seguridad","domotica","desarrollo_web","diseno_grafico","diseno_apps","soporte_tecnico","impresion_3d","audio_video"] },
  { key: "profesional", Icon: Briefcase, ids: ["contabilidad","legal","ingenieria_civil","arquitectura","topografia","consultoria","traduccion","recursos_humanos","marketing_digital","fotografia","produccion_video","bienes_raices"] },
  { key: "salud", Icon: Heart, ids: ["entrenamiento_personal","nutricion","masajes","psicologia","fisioterapia","enfermeria","cuidado_adultos","cuidado_infantil","veterinaria","peluqueria_canina"] },
  { key: "belleza", Icon: Star, ids: ["peluqueria","maquillaje","unhas","pestanas","depilacion","estetica_facial","bronceado"] },
  { key: "educacion", Icon: BookOpen, ids: ["tutorias","idiomas","musica","matematicas","preparacion_universitaria","clases_manejo","clases_cocina"] },
  { key: "mudanzas", Icon: Truck, ids: ["mudanzas","fletes","mensajeria","transporte_mascotas"] },
  { key: "eventos", Icon: CalendarDays, ids: ["fotografia_eventos","videografia","dj_sonido","catering","decoracion","animacion_infantil","bartending"] },
  { key: "seguridad", Icon: Shield, ids: ["guardas_seguridad","alarmas","cctv","control_acceso"] },
  { key: "automotriz", Icon: Car, ids: ["mecanica","hojalateria","electricidad_automotriz","tapiceria","detailing","cambio_llantas"] },
] as const;

export default function CategoriasPage() {
  const t = useTranslations("categories");
  const tg = useTranslations("categoryGroups");

  const [query, setQuery] = useState("");
  const q = normalizeText(query.trim());

  // Flat list of every category (with its group) for the live filter.
  const all = useMemo(
    () => GROUPS.flatMap((g) => g.ids.map((id) => ({ id, group: g.key }))),
    []
  );
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const label = (id: string) => t(id as any);
  const matches = q ? all.filter((c) => normalizeText(label(c.id)).includes(q)) : null;

  // Suggest-to-admin ("¿No ves tu categoría?").
  const [suggest, setSuggest] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  async function sendSuggestion() {
    const name = suggest.trim();
    if (!name) return;
    setSending(true);
    try {
      await fetch("/api/categories/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setSent(true);
      setSuggest("");
    } catch { /* best-effort */ } finally { setSending(false); }
  }

  return (
    <div className="min-h-screen flex flex-col bg-white">
      <LandingNavbar />

      {/* Hero + search */}
      <section className="relative overflow-hidden pt-32 pb-10 text-center px-4">
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-[360px] bg-[radial-gradient(70%_60%_at_50%_0%,#EBF5FB_0%,transparent_72%)]" />
        <FadeInUp>
          <span className="relative inline-block text-xs font-bold uppercase tracking-widest text-[#009FD9] bg-[#EBF5FB] px-4 py-1.5 rounded-full mb-4">Servicios</span>
          <h1 className="relative text-4xl sm:text-5xl font-extrabold text-[#111827] mb-4 leading-tight">Explora todos los servicios</h1>
          <p className="relative text-lg text-[#6b7280] max-w-xl mx-auto mb-8">Encuentra profesionales para cualquier proyecto, organizados por categoría.</p>

          <div className="relative mx-auto max-w-xl">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 h-5 w-5 text-[#9ca3af] pointer-events-none" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Busca una categoría… ej. plomería, niñera, fotografía"
              className="w-full rounded-2xl border border-[#e5e7eb] bg-white py-3.5 pl-12 pr-11 text-base text-[#111827] placeholder:text-[#9ca3af] shadow-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
            />
            {query && (
              <button onClick={() => setQuery("")} aria-label="Limpiar" className="absolute right-3 top-1/2 -translate-y-1/2 text-[#9ca3af] hover:text-[#374151]">
                <X className="h-5 w-5" />
              </button>
            )}
          </div>
        </FadeInUp>
      </section>

      {/* Results */}
      <section className="pb-20 px-4 bg-white">
        <div className="mx-auto max-w-6xl">
          {matches ? (
            matches.length > 0 ? (
              <>
                <p className="text-sm text-[#6b7280] mb-4">{matches.length} {matches.length === 1 ? "categoría" : "categorías"} para “{query}”</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                  {matches.map((c) => (
                    <Link key={c.id} href={`/buscar?categoria=${c.id}`} className="group flex items-center justify-between gap-2 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm font-medium text-[#374151] hover:border-[#009FD9] hover:text-[#009FD9] hover:shadow-sm transition-all">
                      <span className="truncate">{label(c.id)}</span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-[#9ca3af] group-hover:text-[#009FD9] transition-colors" />
                    </Link>
                  ))}
                </div>
              </>
            ) : (
              <div className="text-center py-12 rounded-2xl border border-dashed border-[#d1d5db] bg-[#f9fafb]">
                <p className="text-[#374151] font-medium">No encontramos “{query}”.</p>
                <p className="text-sm text-[#9ca3af] mt-1">Prueba con otra palabra o sugiérenos la categoría más abajo.</p>
              </div>
            )
          ) : (
            <div className="flex flex-col gap-8">
              {GROUPS.map((group, gi) => (
                <FadeInUp key={group.key} delay={gi * 20}>
                  <div className="rounded-2xl border border-[#e5e7eb] bg-white overflow-hidden">
                    <div className="flex items-center gap-3 px-5 py-3.5 border-b border-[#f3f4f6] bg-[#f9fafb]">
                      <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#EBF5FB]">
                        <group.Icon className="h-5 w-5 text-[#009FD9]" />
                      </div>
                      {/* eslint-disable-next-line @typescript-eslint/no-explicit-any */}
                      <h2 className="text-base font-bold text-[#111827]">{tg(group.key as any)}</h2>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2 p-4">
                      {group.ids.map((id) => (
                        <Link key={id} href={`/buscar?categoria=${id}`} className="group flex items-center justify-between gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-[#374151] hover:bg-[#EBF5FB] hover:text-[#009FD9] transition-colors">
                          <span className="truncate leading-snug">{label(id)}</span>
                          <ArrowRight className="h-3.5 w-3.5 shrink-0 text-transparent group-hover:text-[#009FD9] transition-colors" />
                        </Link>
                      ))}
                    </div>
                  </div>
                </FadeInUp>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Suggest a category */}
      <section className="py-16 px-4 bg-[#EBF5FB]">
        <div className="mx-auto max-w-xl text-center">
          <FadeInUp>
            <h2 className="text-2xl sm:text-3xl font-bold text-[#111827] mb-2">¿No ves tu categoría?</h2>
            <p className="text-[#6b7280] mb-6">Dinos qué servicio buscas y lo revisamos para agregarlo.</p>
            {sent ? (
              <p className="inline-flex items-center gap-2 rounded-xl bg-white px-5 py-3 text-sm font-medium text-[#15803d] shadow-sm">
                <Check className="h-4 w-4" /> ¡Gracias! Enviamos tu sugerencia a nuestro equipo.
              </p>
            ) : (
              <div className="flex flex-col sm:flex-row gap-2 max-w-md mx-auto">
                <input
                  value={suggest}
                  onChange={(e) => setSuggest(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); sendSuggestion(); } }}
                  placeholder="Ej. limpieza de tanques sépticos"
                  className="flex-1 rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
                />
                <button
                  type="button"
                  onClick={sendSuggestion}
                  disabled={!suggest.trim() || sending}
                  className="rounded-xl bg-[#009FD9] hover:bg-[#0089bb] text-white font-semibold px-6 py-3 text-sm transition-colors disabled:opacity-50 shrink-0"
                >
                  {sending ? "Enviando…" : "Enviar"}
                </button>
              </div>
            )}
          </FadeInUp>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
