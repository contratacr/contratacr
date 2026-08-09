"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ImagePlus, Search, X } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { OFFER_PRICE_UNITS, OFFER_TYPES, sanitizeOfferImages, type ProfessionalOffer } from "@/lib/offers";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import { FutureDatePicker } from "@/components/ui/future-date-picker";
import { PROVINCES, getCantonById, getCantonsByProvince, getProvinceById } from "@/lib/data/cr-geography";
import { crTodayISO } from "@/lib/time-cr";

type OfferFormProps = {
  professionalId: string;
  serviceOptions: SelectMenuOption[];
  backHref?: string;
  initialOffer?: Partial<ProfessionalOffer> | null;
  presentation?: "page" | "modal";
  onSaved?: (id: string) => void;
};

type FieldErrors = Partial<Record<"title" | "service" | "description" | "images" | "price" | "priceBefore", string>>;

const TODAY = crTodayISO();
const FIELD_CLASS = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]";
const TEXTAREA_CLASS = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#009fd9]";

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <span>{children} <span className="text-red-500">*</span></span>;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-xs font-medium text-red-600">{children}</p> : null;
}

export function OfferForm({ professionalId, serviceOptions, backHref = "/ofertas", initialOffer = null, presentation = "page", onSaved }: OfferFormProps) {
  const editing = Boolean(initialOffer?.id);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [offerType, setOfferType] = useState<string>(initialOffer?.offer_type ?? "service_offer");
  const initialServiceOption = serviceOptions.find((option) => option.value === initialOffer?.service_category_id);
  const initialServiceValue = initialServiceOption?.value
    ?? serviceOptions.find((option) => option.label.toLocaleLowerCase("es-CR") === initialOffer?.service_label?.toLocaleLowerCase("es-CR"))?.value
    ?? "";
  const [selectedServiceValue, setSelectedServiceValue] = useState(initialServiceValue);
  const [serviceInput, setServiceInput] = useState("");
  const [serviceSuggestionsOpen, setServiceSuggestionsOpen] = useState(false);
  const [currency, setCurrency] = useState<string>(initialOffer?.currency ?? "CRC");
  const [priceUnit, setPriceUnit] = useState<string>(initialOffer?.price_unit ?? "total");
  const [validUntil, setValidUntil] = useState(initialOffer?.valid_until ?? "");
  const [locationProvince, setLocationProvince] = useState("");
  const [locationCanton, setLocationCanton] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>(Array.isArray(initialOffer?.image_urls) ? initialOffer.image_urls : []);
  const visibleServiceSuggestions = useMemo(() => {
    const needle = serviceInput.trim().toLocaleLowerCase("es-CR");
    if (needle.length < 1) return [];
    return serviceOptions
      .map((option) => option.label)
      .filter((label, index, list) => label && list.findIndex((item) => item.toLocaleLowerCase("es-CR") === label.toLocaleLowerCase("es-CR")) === index)
      .filter((label) => label.toLocaleLowerCase("es-CR").includes(needle))
      .slice(0, 6);
  }, [serviceInput, serviceOptions]);
  const selectedServiceOption = useMemo(() => {
    return serviceOptions.find((option) => option.value === selectedServiceValue) ?? null;
  }, [selectedServiceValue, serviceOptions]);

  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  const locationCantons = getCantonsByProvince(locationProvince);

  function addFiles(nextFiles: FileList | null) {
    if (!nextFiles) return;
    setFiles((current) => [...current, ...Array.from(nextFiles)].slice(0, 5));
    setFieldErrors((current) => ({ ...current, images: undefined }));
  }

  async function uploadImages() {
    const urls: string[] = [];
    for (const file of files) {
      const body = new FormData();
      body.append("file", file);
      body.append("type", "portfolio");
      const response = await fetch("/api/upload/photo", { method: "POST", body });
      const json = await response.json();
      if (!response.ok) throw new Error(json?.error || "No pudimos subir una imagen.");
      urls.push(String(json.url));
    }
    return sanitizeOfferImages(urls);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const currentPrice = Number(String(form.get("price_now") || "").replace(/\D/gu, "")) || 0;
    const beforePrice = Number(String(form.get("price_before") || "").replace(/\D/gu, "")) || 0;
    const selectedLocationProvince = getProvinceById(locationProvince);
    const selectedLocationCanton = getCantonById(locationCanton);
    const locationLabel = locationProvince === "all_cr"
      ? "Todo Costa Rica"
      : selectedLocationCanton && selectedLocationProvince
        ? `${selectedLocationCanton.name}, ${selectedLocationProvince.name}`
        : selectedLocationProvince
          ? `Toda la provincia de ${selectedLocationProvince.name}`
          : String(form.get("location_label_fallback") || "").trim();
    const nextErrors: FieldErrors = {};
    if (title.length < 3) nextErrors.title = "Escribe un título de al menos 3 caracteres.";
    const selectedService = selectedServiceOption;
    if (!selectedService) nextErrors.service = "Selecciona un servicio de ContrataCR de las sugerencias.";
    if (description.length < 20) nextErrors.description = "Describe la oferta con al menos 20 caracteres.";
    if (files.length === 0 && existingImageUrls.length === 0) nextErrors.images = "Agrega al menos una imagen de la oferta.";
    if (currentPrice <= 0) nextErrors.price = "Ingresa el precio actual de la oferta.";
    if (beforePrice > 0 && beforePrice < currentPrice) nextErrors.priceBefore = "El precio anterior debe ser mayor o igual al actual.";
    if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < TODAY) {
      setError("La fecha de vigencia no puede estar en el pasado.");
      return;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError("Revisa los campos marcados antes de publicar.");
      return;
    }

    setSaving(true);
    setError("");
    try {
      const imageUrls = sanitizeOfferImages([...existingImageUrls, ...(await uploadImages())]);
      const payload = {
        professional_id: professionalId,
        service_category_id: selectedService!.value,
        title,
        description,
        offer_type: offerType,
        service_label: selectedService!.label,
        image_urls: imageUrls,
        price_now: currentPrice,
        price_before: beforePrice || null,
        currency,
        price_unit: priceUnit,
        location_label: locationLabel || null,
        valid_until: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? validUntil : null,
        quantity_available: Number(String(form.get("quantity_available") || "").replace(/\D/gu, "")) || null,
        status: editing ? (initialOffer?.status ?? "published") : "published",
      };
      const request = editing && initialOffer?.id
        ? createClient().from("professional_offers").update(payload).eq("id", initialOffer.id).eq("professional_id", professionalId).select("id").single()
        : createClient().from("professional_offers").insert(payload).select("id").single();
      const { data, error: insertError } = await request;
      if (insertError) throw new Error(insertError.message.includes("schema cache") ? "La base de datos de ofertas todavía no está habilitada." : `No pudimos publicar la oferta: ${insertError.message}`);
      if (presentation === "modal") {
        onSaved?.(data.id);
        setSaving(false);
        return;
      }
      const returnToPanel = backHref.includes("/dashboard/profesional");
      router.replace(`/ofertas/${data.id}${returnToPanel ? "?from=panel" : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "No pudimos publicar la oferta.");
      setSaving(false);
    }
  }

  return (
    <main className={presentation === "modal" ? "bg-white text-[#162543]" : "min-h-[calc(100vh-72px)] bg-white text-[#162543] lg:bg-[#f4f7fa] lg:px-6 lg:py-8"}>
      <header className={presentation === "modal" ? "hidden" : "sticky top-0 z-20 border-b border-[#dfe8f0] bg-white lg:hidden"}>
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href={backHref} aria-label="Volver" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543]"><ArrowLeft className="h-6 w-6 stroke-[2.4]" /></Link>
          <h1 className="truncate text-center text-[17px] font-extrabold">{editing ? "Editar oferta" : "Publicar oferta"}</h1>
        </div>
      </header>
      <div className={presentation === "modal" ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-0 lg:py-0"}>
        <div className={presentation === "modal" ? "hidden" : "mb-4 hidden items-center justify-between gap-4 rounded-lg border border-[#dfe8f0] bg-white px-4 py-3 shadow-sm lg:flex"}>
          <Link href={backHref} aria-label="Volver a ofertas" className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold text-[#162543] transition hover:bg-[#f1f9fc] hover:text-[#008fc3]"><ArrowLeft className="h-5 w-5 stroke-[2.4]" />Volver a ofertas</Link>
          <div className="min-w-0 flex-1 text-center"><h1 className="truncate text-xl font-extrabold">{editing ? "Editar oferta" : "Publicar oferta"}</h1><p className="truncate text-sm text-[#65758c]">Publica una promoción clara y fácil de comparar.</p></div>
          <div className="h-10 w-[128px]" aria-hidden="true" />
        </div>
        <form onSubmit={submit} noValidate className={presentation === "modal" ? "bg-white" : "rounded-lg border border-[#dfe8f0] bg-white p-5 sm:p-7"}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              <RequiredLabel>{"Título"}</RequiredLabel>
              <input name="title" maxLength={120} defaultValue={initialOffer?.title ?? ""} placeholder="Ej. Paquete de fotografía para eventos" className={FIELD_CLASS} />
              <FieldError>{fieldErrors.title}</FieldError>
            </label>
            <SelectMenu label={<RequiredLabel>Tipo</RequiredLabel>} value={offerType} onChange={setOfferType} options={Object.entries(OFFER_TYPES).map(([value, label]) => ({ value, label }))} />
            <div className="relative flex min-w-0 flex-col gap-1 text-xs font-medium text-[#6b7280]">
              <label htmlFor="offer-service"><RequiredLabel>Servicio</RequiredLabel></label>
              <div className="relative">
                <button
                  type="button"
                  id="offer-service"
                  aria-haspopup="listbox"
                  aria-expanded={serviceSuggestionsOpen}
                  aria-controls="offer-service-suggestions"
                  onClick={() => { setServiceInput(""); setServiceSuggestionsOpen((open) => !open); }}
                  className={`flex h-11 w-full items-center justify-between gap-3 rounded-xl border bg-white px-3 text-left text-sm font-medium outline-none transition-colors ${serviceSuggestionsOpen ? "border-[#009fd9]" : "border-[#d7e1ea] hover:border-[#b8cad9]"}`}
                >
                  <span className={selectedServiceOption ? "truncate text-[#111827]" : "truncate text-[#9ca3af]"}>
                    {selectedServiceOption?.label ?? "Selecciona un servicio"}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#7b8ba1] transition-transform ${serviceSuggestionsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                <input type="hidden" name="service_label" value={selectedServiceOption?.label ?? ""} />
                {serviceSuggestionsOpen && (
                  <div id="offer-service-suggestions" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1ea] bg-white shadow-[0_16px_38px_-24px_rgba(15,23,42,0.8)]">
                    <div className="relative border-b border-[#e6edf3] p-2">
                      <Search className="pointer-events-none absolute left-5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#7b8ba1]" aria-hidden="true" />
                      <input
                        autoFocus
                        role="combobox"
                        aria-autocomplete="list"
                        aria-expanded="true"
                        aria-controls="offer-service-options"
                        value={serviceInput}
                        onChange={(event) => setServiceInput(event.target.value)}
                        onBlur={() => window.setTimeout(() => { setServiceInput(""); setServiceSuggestionsOpen(false); }, 120)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" && visibleServiceSuggestions[0]) {
                            event.preventDefault();
                            const firstMatch = serviceOptions.find((option) => option.label === visibleServiceSuggestions[0]);
                            if (firstMatch) {
                              setSelectedServiceValue(firstMatch.value);
                              setServiceInput("");
                              setServiceSuggestionsOpen(false);
                              setFieldErrors((current) => ({ ...current, service: undefined }));
                            }
                          }
                          if (event.key === "Escape") {
                            setServiceInput("");
                            setServiceSuggestionsOpen(false);
                          }
                        }}
                        placeholder="Ejemplo: Redes e internet"
                        autoComplete="off"
                        className="h-10 w-full rounded-lg bg-[#f5f8fa] pl-10 pr-3 text-sm font-medium text-[#111827] outline-none placeholder:text-[#9ca3af] focus:bg-white focus:ring-1 focus:ring-[#009fd9]"
                      />
                    </div>
                    <div id="offer-service-options" role="listbox" className="max-h-56 overflow-y-auto py-1">
                      {serviceInput.trim().length >= 1 && visibleServiceSuggestions.length === 0 && <p className="px-3 py-3 text-xs font-medium text-[#68778d]">No encontramos ese servicio.</p>}
                      {visibleServiceSuggestions.map((label) => (
                        <button
                          key={label}
                          type="button"
                          role="option"
                          aria-selected={selectedServiceOption?.label === label}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => {
                            const option = serviceOptions.find((item) => item.label === label);
                            if (!option) return;
                            setSelectedServiceValue(option.value);
                            setServiceInput("");
                            setServiceSuggestionsOpen(false);
                            setFieldErrors((current) => ({ ...current, service: undefined }));
                          }}
                          className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm font-semibold text-[#162543] transition hover:bg-[#f1f9fc]"
                        >
                          <span>{label}</span>
                          {selectedServiceOption?.label === label && <Check className="h-4 w-4 shrink-0 text-[#009fd9]" aria-hidden="true" />}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>
              <FieldError>{fieldErrors.service}</FieldError>
            </div>
            <label className="text-sm font-semibold sm:col-span-2">
              <RequiredLabel>{"Descripción"}</RequiredLabel>
              <textarea name="description" maxLength={3000} defaultValue={initialOffer?.description ?? ""} placeholder={"Qué incluye, condiciones y cómo se entrega."} className={TEXTAREA_CLASS} />
              <FieldError>{fieldErrors.description}</FieldError>
            </label>
          </div>

          <section className="mt-6">
            <h2 className="font-bold"><RequiredLabel>{"Imágenes"}</RequiredLabel></h2>
            <p className="text-xs text-[#68778d]">Agrega de 1 a 5 fotos. La primera sera la portada.</p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {existingImageUrls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-[#d7e1ea]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setExistingImageUrls((current) => current.filter((item) => item !== url))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#162543] shadow"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {previews.map(({ file, url }) => (
                <div key={`undefined-undefined`} className="relative aspect-square overflow-hidden rounded-lg border border-[#d7e1ea]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#162543] shadow"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {existingImageUrls.length + files.length < 5 && <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-[#9bdcf2] bg-[#f2fbfe] text-center text-xs font-bold text-[#008fc3]"><span><ImagePlus className="mx-auto mb-1 h-6 w-6" />Agregar foto</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} /></label>}
            </div>
            <FieldError>{fieldErrors.images}</FieldError>
          </section>

          <div className="my-6 border-t border-[#e6edf3] pt-6"><h2 className="font-bold">Precio y vigencia</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold"><RequiredLabel>Precio actual</RequiredLabel><input name="price_now" inputMode="numeric" defaultValue={initialOffer?.price_now ?? ""} placeholder="25000" className={FIELD_CLASS} /><FieldError>{fieldErrors.price}</FieldError></label>
            <label className="text-sm font-semibold">Precio anterior <span className="font-normal text-[#9ca3af]">(opcional)</span><input name="price_before" inputMode="numeric" defaultValue={initialOffer?.price_before ?? ""} placeholder="35000" className={FIELD_CLASS} /><FieldError>{fieldErrors.priceBefore}</FieldError></label>
            <SelectMenu label="Moneda" value={currency} onChange={setCurrency} options={[{ value: "CRC", label: "Colones (CRC)" }, { value: "USD", label: "Dolares (USD)" }]} />
            <SelectMenu label="Unidad" value={priceUnit} onChange={setPriceUnit} options={Object.entries(OFFER_PRICE_UNITS).map(([value, label]) => ({ value, label }))} />
            <label className="text-sm font-semibold">Cantidad disponible <span className="font-normal text-[#9ca3af]">(opcional)</span><input name="quantity_available" inputMode="numeric" defaultValue={initialOffer?.quantity_available ?? ""} placeholder="10" className={FIELD_CLASS} /></label>
            <div className="text-sm font-semibold">
              Disponible hasta <span className="font-normal text-[#9ca3af]">(opcional)</span>
              <div className="mt-1.5"><FutureDatePicker value={validUntil} onChange={setValidUntil} /></div>
              <p className="mt-1.5 text-xs font-normal text-[#68778d]">La oferta se ocultara automaticamente despues de esta fecha.</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-sm font-semibold">{"Ubicación"} <span className="font-normal text-[#9ca3af]">(opcional)</span></span>
              <input type="hidden" name="location_label_fallback" value={initialOffer?.location_label ?? ""} />
              <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
                <SelectMenu
                  value={locationProvince}
                  onChange={(value) => { setLocationProvince(value); setLocationCanton(""); }}
                  placeholder="Provincia"
                  options={[{ value: "all_cr", label: "Todo Costa Rica" }, ...PROVINCES.map((province) => ({ value: province.id, label: province.name }))]}
                />
                <SelectMenu
                  value={locationCanton}
                  onChange={setLocationCanton}
                  disabled={!locationProvince || locationProvince === "all_cr"}
                  placeholder={locationProvince === "all_cr" ? "Todo Costa Rica" : "Toda la provincia"}
                  options={[{ value: "", label: "Toda la provincia" }, ...locationCantons.map((canton) => ({ value: canton.id, label: canton.name }))]}
                />
              </div>
            </div>
          </div>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={saving} className="mt-7 h-12 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white hover:bg-[#008fc3] disabled:cursor-not-allowed disabled:opacity-50">{saving ? (editing ? "Guardando..." : "Publicando...") : (editing ? "Guardar cambios" : "Publicar oferta")}</button>
        </form>
      </div>
    </main>
  );
}
