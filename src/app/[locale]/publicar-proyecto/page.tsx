"use client";

import { useEffect, useState } from "react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/navbar";
import { Button } from "@/components/ui/button";
import { CheckCircle2 } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

type Category = { id: string; name: string; icon: string };

const TIMELINES = [
  { value: "Urgente (esta semana)", label: "Urgente — esta semana" },
  { value: "Pronto (este mes)", label: "Pronto — este mes" },
  { value: "Flexible", label: "Soy flexible" },
  { value: "Estoy planificando", label: "Estoy planificando" },
];

export default function PublicarProyectoPage() {
  const router = useRouter();
  const { user, loading: authLoading } = useAuth();

  const [categories, setCategories] = useState<Category[]>([]);
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

  useEffect(() => {
    const supabase = createClient();
    supabase.from("categories").select("id, name, icon").order("name").then(({ data }) => {
      setCategories(data ?? []);
    });
  }, []);

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
        setError(data.error ?? "Error al publicar el proyecto.");
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
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>{c.icon} {c.name}</option>
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
    </div>
  );
}
