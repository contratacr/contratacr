"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { Navbar } from "@/components/layout/navbar";
import { LandingFooter } from "@/components/landing/landing-footer";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { CategorySearch } from "@/components/ui/category-search";
import { CheckCircle2 } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { cn } from "@/lib/utils";


export default function PublicarProyectoPage() {
  const router = useRouter();
  const t = useTranslations("publicarProyecto");
  const { user, loading: authLoading } = useAuth();
  const isPro = user?.user_metadata?.role === "professional";

  const TIMELINES = [
    { value: "Urgente (esta semana)", label: t("tlUrgent") },
    { value: "Pronto (este mes)", label: t("tlSoon") },
    { value: "Flexible", label: t("tlFlexible") },
    { value: "Estoy planificando", label: t("tlPlanning") },
  ];

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

    // Category is REQUIRED — it's what routes the project to the right pros.
    if (!form.categoryId) { setError(t("errCategory")); return; }
    if (!form.title.trim()) { setError(t("errTitle")); return; }
    if (!form.description.trim()) { setError(t("errDescription")); return; }

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
        setError(data.error ?? t("errPublish"));
        return;
      }

      setSuccess(true);
    } catch {
      setError(t("errUnexpected"));
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
            <h1 className="text-2xl font-bold text-[#111827] mb-2">{t("successTitle")}</h1>
            <p className="text-[#6b7280] mb-8">
              {t("successBody")}
            </p>
            <div className="flex flex-col gap-2">
              {/* Professionals manage projects inside their unified "Mi panel"
                  ("Contratar servicios"); plain clients use the client panel. */}
              <Button size="lg" className="w-full" onClick={() => router.push(isPro ? "/dashboard/profesional?tab=sent_projects" : "/dashboard/cliente?tab=projects")}>
                {t("viewProjects")}
              </Button>
              <Button size="lg" variant="outline" className="w-full" onClick={() => router.push(isPro ? "/dashboard/profesional" : "/dashboard/cliente")}>
                {t("goToPanel")}
              </Button>
            </div>
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
            <h1 className="text-2xl font-bold text-[#111827]">{t("title")}</h1>
            <p className="text-[#6b7280] mt-1">
              {t("subtitle")}
            </p>
          </div>

          <div className="bg-white rounded-3xl border border-[#e5e7eb] shadow-sm p-8">
            <form onSubmit={handleSubmit} className="flex flex-col gap-5">
              {/* Category */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("category")} <span className="text-red-500">*</span>
                </label>
                <p className="text-xs text-[#9ca3af] mb-1.5">{t("categoryHelp")}</p>
                <CategorySearch
                  value={form.categoryId}
                  onChange={(id) => update("categoryId", id)}
                  placeholder={t("categoryPlaceholder")}
                />
              </div>

              {/* Title */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("projectTitle")} <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  className={inputClass}
                  placeholder={t("titlePlaceholder")}
                  value={form.title}
                  onChange={(e) => update("title", e.target.value)}
                  required
                />
              </div>

              {/* Description */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("description")} <span className="text-red-500">*</span>
                </label>
                <textarea
                  className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                  placeholder={t("descriptionPlaceholder")}
                  value={form.description}
                  onChange={(e) => update("description", e.target.value)}
                  required
                />
              </div>

              {/* Location */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    {t("provincia")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                  </label>
                  <select
                    className={cn(inputClass, "cursor-pointer")}
                    value={form.provinciaId}
                    onChange={(e) => update("provinciaId", e.target.value)}
                  >
                    <option value="">{t("allF")}</option>
                    {PROVINCES.map((p) => (
                      <option key={p.id} value={p.id}>{p.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-[#374151] block mb-1.5">
                    {t("canton")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                  </label>
                  <select
                    className={cn(inputClass, "cursor-pointer", !form.provinciaId && "opacity-50")}
                    value={form.cantonId}
                    onChange={(e) => update("cantonId", e.target.value)}
                    disabled={!form.provinciaId}
                  >
                    <option value="">{t("allM")}</option>
                    {cantons.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Budget */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("budget")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                </label>
                <div className="grid grid-cols-2 gap-3">
                  <PriceInput placeholder={t("budgetMin")} value={form.budgetMin} onChange={(v) => update("budgetMin", v)} />
                  <PriceInput placeholder={t("budgetMax")} value={form.budgetMax} onChange={(v) => update("budgetMax", v)} />
                </div>
              </div>

              {/* Timeline */}
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("whenNeeded")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
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
                  {t("cancel")}
                </Button>
                <Button type="submit" size="lg" className="flex-1" loading={submitting} disabled={submitting}>
                  {submitting ? t("publishing") : t("publish")}
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
