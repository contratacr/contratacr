"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { PhoneInput, hasPhoneNumber } from "@/components/ui/phone-input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { CategorySearch } from "@/components/ui/category-search";
import { SelectMenu } from "@/components/ui/select-menu";
import { Loader2, ShieldAlert, X } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";

// "Publicar proyecto" as a MODAL (was a standalone page). Same fields, validation
// and submit logic as the old publish-form — only the container changed to a modal:
// dimmed backdrop, centered white rounded dialog, PINNED header + footer with a
// SCROLLING body, closes on X / Cancelar / backdrop / Esc, mobile bottom-sheet.
// On success it calls onSuccess (the panel refreshes its project list) and closes —
// it does NOT navigate to a separate page.
export function PublishProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const t = useTranslations("publicarProyecto");
  const ti = useTranslations("identity");

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
    cedula: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [identityLookup, setIdentityLookup] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [officialName, setOfficialName] = useState("");
  const [noCedula, setNoCedula] = useState(false);
  const [savedCedula, setSavedCedula] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user } = useAuth();

  // Same rule as "Solicitar servicio": projects need a contact phone. If the client
  // already has one on file we don't ask; otherwise we prompt for it here and save it
  // to their profile so we never ask again.
  const [phone, setPhone] = useState("");
  const [needsPhone, setNeedsPhone] = useState(false);
  // Whether a real phone is ALREADY on profiles.phone — if so we never re-save it.
  const [phoneOnProfile, setPhoneOnProfile] = useState(false);
  useEffect(() => {
    if (!user?.id) {
      setProfileLoaded(true);
      return;
    }
    const supabase = createClient();
    let active = true;
    setProfileLoaded(false);
    (async () => {
      const { data } = await supabase.rpc("get_my_profile");
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const raw = ((data as any)?.phone as string | undefined) ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const cedula = ((data as any)?.cedula as string | undefined) ?? "";
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const fullName = ((data as any)?.full_name as string | undefined) ?? "";
      // A bare dial code / empty value is NOT a phone (legacy clears stored "506").
      let p = hasPhoneNumber(raw) ? raw : "";
      const onProfile = !!p;
      // A PROFESSIONAL's contact number lives in professionals.whatsapp, NOT
      // profiles.phone — fall back to it so a pro who already has a number on file is
      // never asked again (mirrors the booking modal's prefill). It's backfilled to
      // profiles.phone on submit so the published solicitud has a reachable contact.
      if (!p) {
        const { data: pro } = await supabase.from("professionals").select("whatsapp").eq("profile_id", user.id).maybeSingle();
        const wa = (pro?.whatsapp as string | undefined) ?? "";
        if (hasPhoneNumber(wa)) p = wa;
      }
      if (!active) return;
      setPhone(p);
      if (fullName) setClientName(fullName);
      if (cedula) {
        setSavedCedula(cedula);
        setForm((f) => (f.cedula ? f : { ...f, cedula }));
      }
      setPhoneOnProfile(onProfile);
      setNeedsPhone(!p);
      setProfileLoaded(true);
    })().catch(() => {
      if (active) setProfileLoaded(true);
    });
    return () => { active = false; };
  }, [user?.id]);

  // Smart identity lookup while typing: national cédulas auto-fill the official
  // full name from the padrón before submit. The API verifies again server-side.
  useEffect(() => {
    const cedula = cleanId(form.cedula);
    setOfficialName("");
    if (!isValidId(cedula) || detectIdType(cedula) !== "cedula") {
      setIdentityLookup("idle");
      return;
    }
    let active = true;
    setIdentityLookup("loading");
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/cedula/${cedula}`);
        const data = await res.json().catch(() => ({}));
        if (!active) return;
        if (res.ok && data?.fullName) {
          setOfficialName(data.fullName);
          setClientName(data.fullName);
          setIdentityLookup("found");
        } else {
          setIdentityLookup("notfound");
        }
      } catch {
        if (active) setIdentityLookup("notfound");
      }
    }, 450);
    return () => { active = false; clearTimeout(timer); };
  }, [form.cedula]);

  const selectedProvincia = PROVINCES.find((p) => p.id === form.provinciaId);
  const cantons = selectedProvincia?.cantons ?? [];

  function update(field: keyof typeof form, value: string) {
    setForm((f) => ({ ...f, [field]: value, ...(field === "provinciaId" ? { cantonId: "" } : {}) }));
  }

  // Close on Esc + lock background scroll while open (matches the app's modals).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prevOverflow; };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (published) { onClose(); return; }
    setError(null);
    setIdentityNotice(null);

    if (!form.categoryId) { setError(t("errCategory")); return; }
    if (!form.title.trim()) { setError(t("errTitle")); return; }
    if (!form.description.trim()) { setError(t("errDescription")); return; }
    if (!profileLoaded) return;
    const cedulaForSubmit = savedCedula || form.cedula;
    if (!savedCedula && !noCedula && !isValidId(cedulaForSubmit)) { setError(t("errCedula")); return; }
    if (needsPhone && phone.replace(/\D/g, "").length < 8) { setError(t("errPhone")); return; }

    setSubmitting(true);
    try {
      // Persist the phone to profiles.phone when it isn't already there, so the
      // solicitud has a reachable contact and we never ask again.
      if (user?.id && phone && !phoneOnProfile) {
        const supabase = createClient();
        await supabase.from("profiles").update({ phone }).eq("id", user.id);
      }
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
          cedula: noCedula && !savedCedula ? "" : cedulaForSubmit,
          fullName: clientName,
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("[publicar-proyecto] error:", data.error);
        setError(data.error ?? t("errPublish"));
        return;
      }

      onSuccess?.();
      const identityStatus = data.clientIdentityStatus as "verified" | "pending" | "unverified" | undefined;
      if (identityStatus === "pending") {
        setPublished(true);
        setIdentityNotice(t("identityPendingNotice"));
        return;
      }
      if (identityStatus === "unverified") {
        setPublished(true);
        setIdentityNotice(t("identityUnverifiedNotice"));
        return;
      }
      onClose();
    } catch {
      setError(t("errUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }


  const inputClass =
    "w-full h-11 rounded-xl border border-[#e5e7eb] bg-white px-4 text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all";
  const shouldAskCedula = profileLoaded && !savedCedula && !noCedula;
  const shouldShowNoCedulaNotice = profileLoaded && !savedCedula && noCedula;

  return (
    <div className="fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      {/* Dimmed backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog: full-width bottom-sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-project-title"
        className="relative z-10 flex w-full max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:max-w-lg sm:max-h-[90vh] sm:rounded-2xl"
      >
        {/* Header (pinned) */}
        <div className="flex items-start justify-between gap-3 border-b border-[#f3f4f6] px-5 py-4 shrink-0 sm:px-6">
          <div className="min-w-0">
            <h2 id="publish-project-title" className="text-lg font-bold text-[#111827]">{t("title")}</h2>
            <p className="mt-0.5 text-xs text-[#6b7280]">{t("subtitle")}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("close")}
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[#9ca3af] hover:bg-[#f3f4f6] hover:text-[#374151] transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Form: scrolling body + pinned footer */}
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
          <div className="flex-1 overflow-y-auto px-5 py-5 flex flex-col gap-5 sm:px-6">
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
                className="w-full rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-sm text-[#111827] placeholder:text-[#9ca3af] min-h-[120px] resize-none break-words focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent transition-all"
                placeholder={t("descriptionPlaceholder")}
                value={form.description}
                onChange={(e) => update("description", e.target.value)}
                maxLength={300}
                required
              />
              {/* Limit message ONLY once the cap is reached — silent otherwise (no counter).
                  300 is the SAME cap as the direct-booking note (sprint 449) — both fields ask
                  the client to "describe briefly what you need", so they share one coherent limit. */}
              {form.description.length >= 300 && (
                <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: 300 })}</p>
              )}
            </div>

            {shouldAskCedula && (
              <>
                <CedulaInput
                  value={form.cedula}
                  onChange={(cedula) => update("cedula", cedula)}
                  required
                  hint={t("cedulaHelp")}
                />
                {identityLookup === "loading" && (
                  <div className="flex items-center gap-2 text-sm text-[#6b7280]">
                    <Loader2 className="h-4 w-4 animate-spin" /> {ti("searching")}
                  </div>
                )}
                {identityLookup === "found" && officialName && (
                  <div className="rounded-lg bg-[#fffbeb] border border-[#fde68a] px-3 py-2.5 flex items-start gap-2">
                    <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#b45309]" />
                    <p className="text-xs text-[#92400e] leading-snug break-words">
                      {t.rich("cedulaOwnerWarning", { name: officialName, strong: (c) => <strong>{c}</strong> })}
                    </p>
                  </div>
                )}
                <button type="button" onClick={() => setNoCedula(true)} className="self-start -mt-1 text-xs font-semibold text-[#009FD9] hover:underline">
                  {t("noCedula")}
                </button>
              </>
            )}
            {shouldShowNoCedulaNotice && (
              <div className="rounded-lg bg-[#f9fafb] border border-[#e5e7eb] px-3 py-2.5 flex items-start gap-2">
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-[#6b7280]" />
                <div className="text-xs text-[#6b7280] leading-snug break-words">
                  <p>{t.rich("noCedulaNotice", { strong: (c) => <strong>{c}</strong> })}</p>
                  <button type="button" onClick={() => setNoCedula(false)} className="mt-1 font-semibold text-[#009FD9] hover:underline">{t("haveCedula")}</button>
                </div>
              </div>
            )}

            {/* Location — the SAME polished SelectMenu popover used by the pro panel's
                "¿En qué zonas ofreces tus servicios?" (and the Disponibilidad time picker),
                NOT a native <select> (sprint 311), so every provincia/cantón dropdown in
                the app opens + reads identically. A first "Todas/Todos" item resets the
                optional filter (mirrors the old empty-option default). */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("provincia")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                </label>
                <SelectMenu
                  value={form.provinciaId}
                  onChange={(v) => update("provinciaId", v)}
                  options={[{ value: "", label: t("allF") }, ...PROVINCES.map((p) => ({ value: p.id, label: p.name }))]}
                />
              </div>
              <div>
                <label className="text-sm font-medium text-[#374151] block mb-1.5">
                  {t("canton")} <span className="text-[#9ca3af] font-normal">{t("optional")}</span>
                </label>
                <SelectMenu
                  value={form.cantonId}
                  onChange={(v) => update("cantonId", v)}
                  disabled={!form.provinciaId}
                  options={[{ value: "", label: t("allM") }, ...cantons.map((c) => ({ value: c.id, label: c.name }))]}
                />
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
              <SelectMenu
                value={form.timeline}
                onChange={(v) => update("timeline", v)}
                placeholder={t("tlAny")}
                options={[
                  { value: "", label: t("tlAny") },
                  ...TIMELINES.map(({ value, label }) => ({ value, label })),
                ]}
              />
            </div>

            {/* Contact phone — only when the client has none on file. */}
            {needsPhone && (
              <div>
                <PhoneInput
                  label={t("phoneLabel")}
                  required
                  value={phone}
                  onChange={setPhone}
                />
                <p className="text-xs text-[#9ca3af] mt-1">{t("phoneHelp")}</p>
              </div>
            )}

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}
            {identityNotice && (
              <p className="text-sm font-medium leading-relaxed text-[#374151] [overflow-wrap:anywhere]">
                {identityNotice}
              </p>
            )}
          </div>

          {/* Footer (pinned) */}
          <div className="flex gap-3 border-t border-[#f3f4f6] px-5 py-4 shrink-0 sm:px-6">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type={published ? "button" : "submit"} size="lg" className="flex-1" loading={submitting} disabled={submitting || !profileLoaded} onClick={published ? onClose : undefined}>
              {published ? t("close") : submitting ? t("publishing") : t("publish")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
