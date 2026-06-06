"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";

/* ─── Static category groups — same source as professional registration ─── */
const CATEGORY_GROUPS = [
  { label: "Hogar y construcción", items: [
    { id: "plomeria", label: "Plomería" }, { id: "electricidad", label: "Electricidad" },
    { id: "construccion", label: "Construcción" }, { id: "pintura", label: "Pintura" },
    { id: "carpinteria", label: "Carpintería" }, { id: "remodelacion", label: "Remodelación" },
    { id: "techos", label: "Techos y cubiertas" }, { id: "pisos", label: "Pisos y revestimientos" },
    { id: "impermeabilizacion", label: "Impermeabilización" }, { id: "fumigacion", label: "Fumigación" },
    { id: "cerrajeria", label: "Cerrajería" }, { id: "aire_acondicionado", label: "Aire acondicionado" },
    { id: "calentadores", label: "Calentadores de agua" }, { id: "ventanas_puertas", label: "Ventanas y puertas" },
    { id: "soldadura", label: "Soldadura" }, { id: "gypsum", label: "Gypsum" },
  ]},
  { label: "Jardín y exterior", items: [
    { id: "jardineria", label: "Jardinería" }, { id: "poda_arboles", label: "Poda de árboles" },
    { id: "paisajismo", label: "Paisajismo" }, { id: "limpieza_piscinas", label: "Limpieza de piscinas" },
    { id: "riego_automatizado", label: "Riego automatizado" }, { id: "control_plagas", label: "Control de plagas" },
  ]},
  { label: "Limpieza", items: [
    { id: "limpieza", label: "Limpieza del hogar" }, { id: "limpieza_oficinas", label: "Limpieza de oficinas" },
    { id: "desinfeccion", label: "Desinfección" }, { id: "lavado_alfombras", label: "Lavado de alfombras" },
    { id: "limpieza_post_construccion", label: "Limpieza post-construcción" }, { id: "lavado_vehiculos", label: "Lavado de vehículos" },
  ]},
  { label: "Tecnología", items: [
    { id: "reparacion_computadoras", label: "Reparación de computadoras" }, { id: "redes_internet", label: "Redes e internet" },
    { id: "camaras_seguridad", label: "Cámaras de seguridad" }, { id: "domotica", label: "Domótica" },
    { id: "desarrollo_web", label: "Desarrollo web" }, { id: "diseno_grafico", label: "Diseño gráfico" },
    { id: "diseno_apps", label: "Diseño de apps" }, { id: "soporte_tecnico", label: "Soporte técnico" },
    { id: "impresion_3d", label: "Impresión 3D" }, { id: "audio_video", label: "Audio y video" },
  ]},
  { label: "Servicios profesionales", items: [
    { id: "contabilidad", label: "Contabilidad y finanzas" }, { id: "legal", label: "Abogados y legal" },
    { id: "ingenieria_civil", label: "Ingeniería civil" }, { id: "arquitectura", label: "Arquitectura" },
    { id: "topografia", label: "Topografía" }, { id: "consultoria", label: "Consultoría empresarial" },
    { id: "traduccion", label: "Traducción" }, { id: "recursos_humanos", label: "Recursos humanos" },
    { id: "marketing_digital", label: "Marketing digital" }, { id: "fotografia", label: "Fotografía profesional" },
    { id: "produccion_video", label: "Producción de video" }, { id: "bienes_raices", label: "Bienes raíces" },
  ]},
  { label: "Salud y bienestar", items: [
    { id: "entrenamiento_personal", label: "Entrenamiento personal" }, { id: "nutricion", label: "Nutrición y dietética" },
    { id: "masajes", label: "Masajes terapéuticos" }, { id: "psicologia", label: "Psicología" },
    { id: "fisioterapia", label: "Fisioterapia" }, { id: "enfermeria", label: "Enfermería a domicilio" },
    { id: "cuidado_adultos", label: "Cuidado de adultos mayores" }, { id: "cuidado_infantil", label: "Cuidado infantil" },
    { id: "veterinaria", label: "Veterinaria" }, { id: "peluqueria_canina", label: "Peluquería canina" },
  ]},
  { label: "Belleza y estética", items: [
    { id: "peluqueria", label: "Peluquería" }, { id: "maquillaje", label: "Maquillaje" },
    { id: "unhas", label: "Uñas" }, { id: "pestanas", label: "Pestañas" },
    { id: "depilacion", label: "Depilación" }, { id: "estetica_facial", label: "Estética facial" },
    { id: "bronceado", label: "Bronceado" },
  ]},
  { label: "Educación", items: [
    { id: "tutorias", label: "Tutorías académicas" }, { id: "idiomas", label: "Idiomas" },
    { id: "musica", label: "Música e instrumentos" }, { id: "matematicas", label: "Matemáticas y ciencias" },
    { id: "preparacion_universitaria", label: "Preparación universitaria" }, { id: "clases_manejo", label: "Clases de manejo" },
    { id: "clases_cocina", label: "Clases de cocina" },
  ]},
  { label: "Mudanzas y transporte", items: [
    { id: "mudanzas", label: "Mudanzas" }, { id: "fletes", label: "Fletes" },
    { id: "mensajeria", label: "Mensajería" }, { id: "transporte_mascotas", label: "Transporte de mascotas" },
  ]},
  { label: "Eventos", items: [
    { id: "fotografia_eventos", label: "Fotografía de eventos" }, { id: "videografia", label: "Videografía" },
    { id: "dj_sonido", label: "DJ y sonido" }, { id: "catering", label: "Catering" },
    { id: "decoracion", label: "Decoración" }, { id: "animacion_infantil", label: "Animación infantil" },
    { id: "bartending", label: "Bartending" },
  ]},
  { label: "Seguridad", items: [
    { id: "guardas_seguridad", label: "Guardas de seguridad" }, { id: "alarmas", label: "Instalación de alarmas" },
    { id: "cctv", label: "Circuito cerrado CCTV" }, { id: "control_acceso", label: "Control de acceso" },
  ]},
  { label: "Automotriz", items: [
    { id: "mecanica", label: "Mecánica general" }, { id: "hojalateria", label: "Hojalatería y pintura" },
    { id: "electricidad_automotriz", label: "Electricidad automotriz" }, { id: "tapiceria", label: "Tapicería" },
    { id: "detailing", label: "Detailing" }, { id: "cambio_llantas", label: "Cambio de llantas a domicilio" },
  ]},
];

const TIMELINES = [
  { value: "Urgente (esta semana)", label: "Urgente — esta semana" },
  { value: "Pronto (este mes)", label: "Pronto — este mes" },
  { value: "Flexible", label: "Soy flexible" },
  { value: "Estoy planificando", label: "Estoy planificando" },
];

export default function PublicarProyectoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [form, setForm] = useState({
    categoryId: "",
    title: "",
    description: "",
    provinciaId: "",
    cantonId: "",
    budgetMin: "",
    budgetMax: "",
    timeline: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!authLoading && !user) router.push("/login");
  }, [user, authLoading, router]);

  const selectedProvincia = PROVINCES.find((p) => p.id === form.provinciaId);
  const cantons = selectedProvincia?.cantons ?? [];

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value, ...(field === "provinciaId" ? { cantonId: "" } : {}) }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!form.title.trim()) { setError("El título es requerido."); return; }
    if (!form.description.trim()) { setError("La descripción es requerida."); return; }

    setSubmitting(true);
    try {
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim(),
          description: form.description.trim(),
          categoryId: form.categoryId || null,
          provinciaId: form.provinciaId || null,
          cantonId: form.cantonId || null,
          budgetMin: form.budgetMin || null,
          budgetMax: form.budgetMax || null,
          timeline: form.timeline || null,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("[publicar-proyecto] error:", data.error);
        setError(data.error ?? "Error al publicar el proyecto. Intentá de nuevo.");
        return;
      }

      setSuccess(true);
    } catch {
      setError("Error inesperado. Intentá de nuevo.");
    } finally {
      setSubmitting(false);
    }
  }

  if (success) {
    return (
      <div className="min-h-screen flex flex-col bg-[#fafafa]">
        <Navbar />
        <main className="flex-1 flex items-center justify-center px-4 py-12">
          <div className="w-full max-w-md text-center">
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-[#EBF5FB] mx-auto mb-5">
              <CheckCircle2 className="h-10 w-10 text-[#009FD9]" />
            </div>
            <h1 className="text-2xl font-bold text-[#111827] mb-2">¡Proyecto publicado!</h1>
            <p className="text-[#6b7280] mb-8">
              Los profesionales de tu zona verán tu proyecto y podrán enviarte propuestas.
            </p>
            <Button size="lg" className="w-full" onClick={() => router.push("/dashboard/cliente?tab=projects")}>
              Ver mis proyectos
            </Button>
          </div>
        </main>
        <LandingFooter />
      </div>
    );
  }

  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";

  return (
    <div className="min-h-screen flex flex-col bg-[#fafafa]">
      <Navbar />
      <main className="flex-1 py-10 px-4">
        <div className="max-w-2xl mx-auto">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-[#111827]">Publicar proyecto</h1>
            <p className="text-[#6b7280] mt-1">
              Describí tu proyecto y recibí propuestas de profesionales cercanos.
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Category */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Categoría <span className="text-[#9ca3af] font-normal">(opcional)</span>
                </label>
                <select
                  className={cn(inputClass, "cursor-pointer")}
                  value={form.categoryId}
                  onChange={(e) => update("categoryId", e.target.value)}
                >
                  <option value="">Seleccioná una categoría</option>
                  {CATEGORY_GROUPS.map((group) => (
                    <optgroup key={group.label} label={group.label}>
                      {group.items.map((item) => (
                        <option key={item.id} value={item.id}>{item.label}</option>
                      ))}
                    </optgroup>
                  ))}
                </select>
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Título del proyecto <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder="Ej: Pintura de sala y comedor, 50m²"
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Descripción detallada <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  placeholder="Describí el trabajo que necesitás, materiales, dimensiones, condiciones especiales, etc."
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  required
                />
              </div>

              {/* Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    Provincia <span className="text-[#9ca3af] font-normal">(opcional)</span>
                  </label>
                  <select
                    className={cn(inputClass, "cursor-pointer")}
                    value={form.provinciaId}
                    onChange={(e) => update("provinciaId", e.target.value)}
                  >
                    <option value="">Todas</option>
                    {PROVINCES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">Cantón</label>
                  <select
                    className={cn(inputClass, "cursor-pointer", !form.provinciaId && "opacity-50")}
                    value={form.cantonId}
                    onChange={(e) => update("cantonId", e.target.value)}
                    disabled={!form.provinciaId}
                  >
                    <option value="">Todos</option>
                    {cantons.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  Presupuesto estimado (₡) <span className="text-[#9ca3af] font-normal">(opcional)</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="Mínimo"
                    value={form.budgetMin}
                    onChange={(e) => update("budgetMin", e.target.value)}
                  />
                  <input
                    type="number"
                    className={inputClass}
                    placeholder="Máximo"
                    value={form.budgetMax}
                    onChange={(e) => update("budgetMax", e.target.value)}
                  />
                </div>
              </div>

              {/* Timeline */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  ¿Cuándo lo necesitás? <span className="text-[#9ca3af] font-normal">(opcional)</span>
                </label>
                <div className="flex flex-wrap gap-2">
                  {TIMELINES.map(({ value, label }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => update("timeline", form.timeline === value ? "" : value)}
                      className={cn(
                        "px-3 py-1.5 rounded-xl text-sm font-medium transition-all border",
                        form.timeline === value
                          ? "bg-[#009FD9] text-white border-[#009FD9]"
                          : "bg-white text-[#374151] border-[#e5e7eb] hover:border-[#009FD9] hover:text-[#009FD9]"
                      )}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {error && (
                <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                  {error}
                </div>
              )}

              <div className="flex gap-3 mt-2">
                <Button type="button" variant="outline" size="lg" onClick={() => router.back()}>
                  Cancelar
                </Button>
                <Button type="submit" size="lg" className="flex-1" loading={submitting} disabled={submitting}>
                  {submitting ? "Publicando..." : "Publicar proyecto"}
                </Button>
              </div>
            </form>
          </div>
        </div>
      </main>
      <LandingFooter />
    </div>
  );
}
