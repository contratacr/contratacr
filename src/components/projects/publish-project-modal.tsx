"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { PriceInput } from "@/components/ui/price-input";
import { PhoneInput, hasPhoneNumber } from "@/components/ui/phone-input";
import { CedulaInput } from "@/components/ui/cedula-input";
import { CategorySearch } from "@/components/ui/category-search";
import { SelectMenu } from "@/components/ui/select-menu";
import { DateOfBirthPicker } from "@/components/ui/date-of-birth-picker";
import { FormLoadingState } from "@/components/ui/loading-state";
import { Loader2, ShieldAlert, ShieldCheck, X } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { isHealthCategory } from "@/lib/data/categories";
import { createClient } from "@/lib/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { cleanId, detectIdType, formatId, isValidId } from "@/lib/cedula";
import { isMinorFromDob } from "@/lib/age";
import { NAME_MAX_LENGTH, limitText } from "@/lib/text-limits";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { BrandIconBadge } from "@/components/ui/brand-icon-badge";

const PROJECT_TITLE_MAX_LENGTH = 80;
const PROJECT_DESCRIPTION_MAX_LENGTH = 300;

const phoneDigits = (value: string) => value.replace(/\D/g, "");

// "Publicar proyecto" as a MODAL (was a standalone page). Same fields, validation
// and submit logic as the old publish-form — only the container changed to a modal:
// dimmed backdrop, centered white rounded dialog, PINNED header + footer with a
// SCROLLING body, closes on X / Cancelar / backdrop / Esc, mobile bottom-sheet.
// On success it calls onSuccess (the panel refreshes its project list) and closes —
// it does NOT navigate to a separate page.
export function PublishProjectModal({ onClose, onSuccess }: { onClose: () => void; onSuccess?: () => void }) {
  const t = useTranslations("publicarProyecto");
  const ti = useTranslations("identity");
  const searchParams = useSearchParams();
  const initialCategoryId = searchParams.get("categoria") || "";
  const initialProvinceId = searchParams.get("provincia") || "";
  const initialCantonId = searchParams.get("canton") || "";

  const TIMELINES = [
    { value: "Urgente (esta semana)", label: t("tlUrgent") },
    { value: "Pronto (este mes)", label: t("tlSoon") },
    { value: "Flexible", label: t("tlFlexible") },
    { value: "Estoy planificando", label: t("tlPlanning") },
  ];

  const [form, setForm] = useState({
    categoryId: initialCategoryId,
    title: "",
    description: "",
    provinciaId: initialProvinceId,
    cantonId: initialCantonId,
    budgetMin: "",
    budgetMax: "",
    timeline: "",
    cedula: "",
    forSomeoneElse: false,
    beneficiaryName: "",
    beneficiaryDob: "",
  });
  const [error, setError] = useState<string | null>(null);
  const [identityNotice, setIdentityNotice] = useState<string | null>(null);
  const [clientName, setClientName] = useState("");
  const [identityLookup, setIdentityLookup] = useState<"idle" | "loading" | "found" | "notfound">("idle");
  const [officialName, setOfficialName] = useState("");
  const [noCedula, setNoCedula] = useState(false);
  const [savedCedula, setSavedCedula] = useState("");
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [profileLoadedFor, setProfileLoadedFor] = useState<string | null>(null);
  const [published, setPublished] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const { user, loading: authLoading } = useAuth();

  // Same rule as "Solicitar servicio": the contact phone is shared by the client
  // and professional panels. The user can keep it or edit it before publishing.
  const [phone, setPhone] = useState("");
  const [profilePhoneInitial, setProfilePhoneInitial] = useState("");
  useEffect(() => {
    if (!user?.id) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setProfileLoaded(true);
      setProfileLoadedFor(null);
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
      const accountPhone = p;
      // If this user became a professional before the account phone was filled,
      // use the professional number as the visible prefill and sync on submit.
      if (!p) {
        const { data: pro } = await supabase.from("professionals").select("whatsapp").eq("profile_id", user.id).maybeSingle();
        const wa = (pro?.whatsapp as string | undefined) ?? "";
        if (hasPhoneNumber(wa)) p = wa;
      }
      if (!active) return;
      setPhone(p);
      setProfilePhoneInitial(accountPhone);
      if (fullName) setClientName(limitText(fullName, NAME_MAX_LENGTH));
      if (cedula) {
        setSavedCedula(cedula);
        setForm((f) => (f.cedula ? f : { ...f, cedula }));
      }
      setProfileLoaded(true);
      setProfileLoadedFor(user.id);
    })().catch(() => {
      if (active) {
        setProfileLoaded(true);
        setProfileLoadedFor(user.id);
      }
    });
    return () => { active = false; };
  }, [user?.id]);

  // Smart identity lookup while typing: national cédulas auto-fill the official
  // full name from the padrón before submit. The API verifies again server-side.
  useEffect(() => {
    const cedula = cleanId(form.cedula);
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
          setOfficialName(limitText(data.fullName, NAME_MAX_LENGTH));
          setClientName(limitText(data.fullName, NAME_MAX_LENGTH));
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
  const selectedIsHealth = isHealthCategory(form.categoryId);

  function update(field: keyof typeof form, value: string) {
    const nextValue =
      field === "title" ? value.slice(0, PROJECT_TITLE_MAX_LENGTH) :
      field === "description" ? value.slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) :
      field === "beneficiaryName" ? limitText(value, NAME_MAX_LENGTH) :
      value;
    setForm((f) => ({ ...f, [field]: nextValue, ...(field === "provinciaId" ? { cantonId: "" } : {}) }));
  }

  function setForSomeoneElse(value: boolean) {
    setForm((f) => ({
      ...f,
      forSomeoneElse: value,
      beneficiaryName: value ? f.beneficiaryName : "",
      beneficiaryDob: value ? f.beneficiaryDob : "",
    }));
  }

  function handleCategoryChange(id: string) {
    setForm((f) => ({
      ...f,
      categoryId: id,
      ...(isHealthCategory(id) ? {} : { forSomeoneElse: false, beneficiaryName: "", beneficiaryDob: "" }),
    }));
  }

  function skipCedula() {
    setNoCedula(true);
    setOfficialName("");
    setIdentityLookup("idle");
    setIdentityNotice(null);
    setForm((f) => ({ ...f, cedula: "" }));
  }

  // Close on Esc + lock background scroll while open (matches the app's modals).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const releaseBodyScroll = lockBodyScroll();
    return () => { document.removeEventListener("keydown", onKey); releaseBodyScroll(); };
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (published) { onClose(); return; }
    setError(null);
    setIdentityNotice(null);

    if (!form.categoryId) { setError(t("errCategory")); return; }
    if (!form.title.trim()) { setError(t("errTitle")); return; }
    if (!form.description.trim()) { setError(t("errDescription")); return; }
    if (selectedIsHealth && form.forSomeoneElse && !form.beneficiaryName.trim()) { setError(t("errBeneficiaryName")); return; }
    if (selectedIsHealth && form.forSomeoneElse && !form.beneficiaryDob) { setError(t("errBeneficiaryDob")); return; }
    if (!profileReady) return;
    const sendingWithoutCedula = noCedula && !savedCedula;
    const cedulaForSubmit = savedCedula || (sendingWithoutCedula ? "" : form.cedula);
    if (!savedCedula && !sendingWithoutCedula && !isValidId(cedulaForSubmit)) { setError(t("errCedula")); return; }
    const cleanPhone = phoneDigits(phone);
    if (cleanPhone.length < 8) { setError(t("errPhone")); return; }

    setSubmitting(true);
    try {
      // Keep the shared contact phone aligned when the user confirms the request.
      if (user?.id) {
        const supabase = createClient();
        const phoneChanged = cleanPhone !== phoneDigits(profilePhoneInitial);
        if (phoneChanged) {
          const { error: phoneError } = await supabase.from("profiles").update({ phone: cleanPhone }).eq("id", user.id);
          if (phoneError) { setError(t("errPhoneSave")); setSubmitting(false); return; }
        }
        const { error: professionalPhoneError } = await supabase.from("professionals").update({ whatsapp: cleanPhone }).eq("profile_id", user.id);
        if (professionalPhoneError) { setError(t("errPhoneSave")); setSubmitting(false); return; }
        setProfilePhoneInitial(cleanPhone);
        setPhone(cleanPhone);
        window.dispatchEvent(new Event("ccr:profile-updated"));
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title.trim().slice(0, PROJECT_TITLE_MAX_LENGTH),
          description: form.description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH),
          categoryId: form.categoryId || null,
          provinciaId: form.provinciaId || null,
          cantonId: form.cantonId || null,
          budgetMin: form.budgetMin || null,
          budgetMax: form.budgetMax || null,
          timeline: form.timeline || null,
          cedula: cedulaForSubmit,
          fullName: limitText(clientName, NAME_MAX_LENGTH),
          forSomeoneElse: selectedIsHealth && form.forSomeoneElse,
          beneficiaryName: selectedIsHealth && form.forSomeoneElse ? limitText(form.beneficiaryName, NAME_MAX_LENGTH) : null,
          beneficiaryDob: selectedIsHealth && form.forSomeoneElse ? form.beneficiaryDob : null,
          beneficiaryIsMinor: selectedIsHealth && form.forSomeoneElse && form.beneficiaryDob ? isMinorFromDob(form.beneficiaryDob) : false,
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
      if (identityStatus === "unverified" && !sendingWithoutCedula) {
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
  const profileReady = !authLoading && profileLoaded && profileLoadedFor === (user?.id ?? null);
  const shouldAskCedula = profileReady && !savedCedula && !noCedula;
  const shouldShowNoCedulaNotice = profileReady && !savedCedula && noCedula;

  return (
    <div className="app-modal-screen fixed inset-0 z-[100] flex items-end justify-center sm:items-center sm:p-4">
      {/* Dimmed backdrop — click to close */}
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      {/* Dialog: full-width bottom-sheet on mobile, centered card on desktop. */}
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-project-title"
        className="app-bottom-sheet relative z-10 flex h-[92dvh] min-h-0 w-full max-h-[92vh] flex-col rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-w-lg sm:max-h-[90vh] sm:rounded-2xl"
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
        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col sm:flex-none">
          {!profileReady ? (
            <FormLoadingState label={t("loadingProfile")} />
          ) : (
          <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto overscroll-contain px-5 py-5 sm:max-h-[calc(90vh-145px)] sm:flex-none sm:px-6">
            {/* Category */}
            <div>
              <label className="text-sm font-medium text-[#374151] block mb-1.5">
                {t("category")} <span className="text-red-500">*</span>
              </label>
              <p className="text-xs text-[#9ca3af] mb-1.5">{t("categoryHelp")}</p>
              <CategorySearch
                value={form.categoryId}
                onChange={handleCategoryChange}
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
                maxLength={PROJECT_TITLE_MAX_LENGTH}
                required
              />
              {form.title.length >= PROJECT_TITLE_MAX_LENGTH && (
                <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: PROJECT_TITLE_MAX_LENGTH })}</p>
              )}
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
                maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                required
              />
              {/* Limit message ONLY once the cap is reached — silent otherwise (no counter).
                  300 is the SAME cap as the direct-booking note (sprint 449) — both fields ask
                  the client to "describe briefly what you need", so they share one coherent limit. */}
              {form.description.length >= PROJECT_DESCRIPTION_MAX_LENGTH && (
                <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: PROJECT_DESCRIPTION_MAX_LENGTH })}</p>
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
                  <div className="flex items-start gap-3 rounded-2xl border border-[#bae6fd] bg-[#f8fbff] px-4 py-3.5 shadow-sm">
                    <BrandIconBadge icon={ShieldCheck} size={36} className="mt-0.5" />
                    <div className="min-w-0">
                      <p className="text-xs font-semibold text-[#64748b]">{t("cedulaOwnerTitle")}</p>
                      <p className="mt-1 break-words text-sm font-bold leading-5 text-[#162543]">{officialName}</p>
                      <p className="mt-2 text-xs font-medium text-[#64748b]">{t("cedulaLabel")}</p>
                      <p className="mt-0.5 text-sm font-semibold text-[#162543]">{formatId(form.cedula)}</p>
                      <p className="mt-2 text-xs leading-5 text-[#475569]">{t("cedulaOwnerBody")}</p>
                    </div>
                  </div>
                )}
                <button type="button" onClick={skipCedula} className="self-start -mt-1 text-xs font-semibold text-[#009FD9] hover:underline">
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
            {selectedIsHealth && (
              <div className="border-t border-[#edf1f5] pt-3">
                <label className="text-sm font-semibold text-[#374151] block mb-2.5">
                  {t("forWho.question")}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { v: false, label: t("forWho.me") },
                    { v: true, label: t("forWho.someoneElse") },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => setForSomeoneElse(opt.v)}
                      className={`h-10 rounded-xl border px-3 text-sm font-semibold transition-all ${
                        form.forSomeoneElse === opt.v
                          ? "border-[#009FD9] bg-[#f5fbfe] text-[#0089bb] shadow-[0_0_0_1px_rgba(0,159,217,0.08)]"
                          : "border-[#e5e7eb] bg-white text-[#374151] hover:border-[#009FD9]/40"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                {form.forSomeoneElse && (
                  <div className="mt-3 flex flex-col gap-3 border-l-2 border-[#d8eef8] pl-3">
                    <div>
                      <label className="text-xs font-medium text-[#374151] block mb-1.5">
                        {t("forWho.nameLabel")} <span className="text-red-500">*</span>
                      </label>
                      <input
                        type="text"
                        className={inputClass}
                        placeholder={t("forWho.namePlaceholder")}
                        value={form.beneficiaryName}
                        maxLength={NAME_MAX_LENGTH}
                        onChange={(e) => update("beneficiaryName", e.target.value)}
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#374151] block mb-1.5">
                        {t("forWho.dobLabel")} <span className="text-red-500">*</span>
                      </label>
                      <DateOfBirthPicker value={form.beneficiaryDob} onChange={(v) => update("beneficiaryDob", v)} />
                    </div>
                  </div>
                )}
              </div>
            )}

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

            {/* Contact phone: always visible so the client can confirm or update it before publishing. */}
            <div>
              <PhoneInput
                label={t("phoneLabel")}
                required
                value={phone}
                onChange={setPhone}
              />
              <p className="text-xs text-[#9ca3af] mt-1">{t("phoneHelp")}</p>
            </div>

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
          )}

          {/* Footer (pinned) */}
          <div className="flex shrink-0 gap-3 border-t border-[#f3f4f6] px-5 py-4 pb-[max(env(safe-area-inset-bottom),1rem)] sm:px-6 sm:pb-4">
            <Button type="button" variant="outline" size="lg" onClick={onClose}>
              {t("cancel")}
            </Button>
            <Button type={published ? "button" : "submit"} size="lg" className="flex-1" loading={submitting} disabled={submitting || !profileReady} onClick={published ? onClose : undefined}>
              {published ? t("close") : submitting ? t("publishing") : t("publish")}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
