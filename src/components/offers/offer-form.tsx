"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, Check, ChevronDown, ImagePlus, Search, X } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { OFFER_PRICE_UNITS, OFFER_TYPES, sanitizeOfferImages, type ProfessionalOffer } from "@/lib/offers";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import { FutureDatePicker } from "@/components/ui/future-date-picker";
import { PROVINCES, getCantonById, getCantonsByProvince, getProvinceById } from "@/lib/data/cr-geography";
import { crTodayISO } from "@/lib/time-cr";
import { MAX_MONEY_AMOUNT, MAX_OFFER_QUANTITY, formatNumberForMessage, isNumericDatabaseRangeError, isWholeNumberInRange, parseOptionalWholeNumber } from "@/lib/forms/numeric-validation";
import { marketplaceLocale, offerPriceUnitLabel, offerTypeLabel } from "@/lib/marketplace-copy";

type OfferFormProps = {
  professionalId: string;
  serviceOptions: SelectMenuOption[];
  backHref?: string;
  initialOffer?: Partial<ProfessionalOffer> | null;
  presentation?: "page" | "modal";
  onSaved?: (id: string) => void;
};

type FieldErrors = Partial<Record<"title" | "service" | "description" | "images" | "price" | "priceBefore" | "quantity", string>>;

const TODAY = crTodayISO();
const FIELD_CLASS = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]";
const TEXTAREA_CLASS = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#009fd9]";

const OFFER_FORM_COPY = {
  es: {
    back: "Volver",
    backToOffers: "Volver a ofertas",
    editTitle: "Editar oferta",
    publishTitle: "Publicar oferta",
    subtitle: "Publica una promoción clara y fácil de comparar.",
    title: "Título",
    titlePlaceholder: "Ej. Paquete de fotografía para eventos",
    type: "Tipo",
    service: "Servicio",
    selectService: "Selecciona un servicio",
    servicePlaceholder: "Ejemplo: Redes e internet",
    serviceNotFound: "No encontramos ese servicio.",
    description: "Descripción",
    descriptionPlaceholder: "Qué incluye, condiciones y cómo se entrega.",
    images: "Imágenes",
    imageHelp: "Agrega de 1 a 5 fotos. La primera será la portada.",
    addPhoto: "Agregar foto",
    priceAndValidity: "Precio y vigencia",
    currentPrice: "Precio actual",
    previousPrice: "Precio anterior",
    optional: "opcional",
    currency: "Moneda",
    colones: "Colones (CRC)",
    dollars: "Dólares (USD)",
    unit: "Unidad",
    quantity: "Cantidad disponible",
    availableUntil: "Disponible hasta",
    availabilityHelp: "La oferta se ocultará automáticamente después de esta fecha.",
    location: "Ubicación",
    province: "Provincia",
    allCostaRica: "Todo Costa Rica",
    wholeProvince: "Toda la provincia",
    wholeProvinceOf: (province: string) => `Toda la provincia de ${province}`,
    saving: "Guardando...",
    publishing: "Publicando...",
    save: "Guardar cambios",
    publish: "Publicar oferta",
    uploadFailed: "No pudimos subir una imagen.",
    titleError: "Escribe un título de al menos 3 caracteres.",
    serviceError: "Selecciona un servicio de ContrataCR de las sugerencias.",
    descriptionError: "Describe la oferta con al menos 20 caracteres.",
    imagesError: "Agrega al menos una imagen de la oferta.",
    priceError: "Ingresa el precio actual de la oferta.",
    previousPriceError: "El precio anterior debe ser mayor o igual al actual.",
    priceRangeError: (maximum: string) => `Ingresa un precio entre 1 y ${maximum}.`,
    previousPriceRangeError: (maximum: string) => `Ingresa un precio anterior de hasta ${maximum}.`,
    quantityRangeError: (maximum: string) => `Ingresa una cantidad entre 1 y ${maximum}.`,
    dateError: "La fecha de vigencia no puede estar en el pasado.",
    reviewError: "Revisa los campos marcados antes de publicar.",
    databaseUnavailable: "La base de datos de ofertas todavía no está habilitada.",
    numericError: "Uno de los precios o cantidades es demasiado alto. Revisa los valores ingresados.",
    saveError: "No pudimos guardar la oferta. Revisa la información e inténtalo nuevamente.",
    publishError: "No pudimos publicar la oferta.",
  },
  en: {
    back: "Back",
    backToOffers: "Back to offers",
    editTitle: "Edit offer",
    publishTitle: "Post an offer",
    subtitle: "Post a clear promotion that is easy to compare.",
    title: "Title",
    titlePlaceholder: "E.g. Event photography package",
    type: "Type",
    service: "Service",
    selectService: "Select a service",
    servicePlaceholder: "Example: Networks and internet",
    serviceNotFound: "We could not find that service.",
    description: "Description",
    descriptionPlaceholder: "What it includes, conditions, and how it is delivered.",
    images: "Images",
    imageHelp: "Add 1 to 5 photos. The first one will be the cover.",
    addPhoto: "Add photo",
    priceAndValidity: "Price and availability",
    currentPrice: "Current price",
    previousPrice: "Previous price",
    optional: "optional",
    currency: "Currency",
    colones: "Costa Rican colones (CRC)",
    dollars: "US dollars (USD)",
    unit: "Unit",
    quantity: "Available quantity",
    availableUntil: "Available until",
    availabilityHelp: "The offer will be hidden automatically after this date.",
    location: "Location",
    province: "Province",
    allCostaRica: "All Costa Rica",
    wholeProvince: "Entire province",
    wholeProvinceOf: (province: string) => `Entire province of ${province}`,
    saving: "Saving...",
    publishing: "Publishing...",
    save: "Save changes",
    publish: "Post offer",
    uploadFailed: "We could not upload an image.",
    titleError: "Enter a title with at least 3 characters.",
    serviceError: "Select a ContrataCR service from the suggestions.",
    descriptionError: "Describe the offer with at least 20 characters.",
    imagesError: "Add at least one offer image.",
    priceError: "Enter the current offer price.",
    previousPriceError: "The previous price must be greater than or equal to the current price.",
    priceRangeError: (maximum: string) => `Enter a price between 1 and ${maximum}.`,
    previousPriceRangeError: (maximum: string) => `Enter a previous price up to ${maximum}.`,
    quantityRangeError: (maximum: string) => `Enter a quantity between 1 and ${maximum}.`,
    dateError: "The availability date cannot be in the past.",
    reviewError: "Review the highlighted fields before publishing.",
    databaseUnavailable: "The offers database is not enabled yet.",
    numericError: "One of the prices or quantities is too high. Review the values entered.",
    saveError: "We could not save the offer. Review the information and try again.",
    publishError: "We could not publish the offer.",
  },
} as const;

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <span>{children} <span className="text-red-500">*</span></span>;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-xs font-medium text-red-600">{children}</p> : null;
}

export function OfferForm({ professionalId, serviceOptions, backHref = "/ofertas", initialOffer = null, presentation = "page", onSaved }: OfferFormProps) {
  const locale = marketplaceLocale(useLocale());
  const copy = OFFER_FORM_COPY[locale];
  const localeCode = locale === "en" ? "en-US" : "es-CR";
  const editing = Boolean(initialOffer?.id);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<File[]>([]);
  const [offerType, setOfferType] = useState<string>(initialOffer?.offer_type ?? "service_offer");
  const initialServiceOption = serviceOptions.find((option) => option.value === initialOffer?.service_category_id);
  const initialServiceValue = initialServiceOption?.value
    ?? serviceOptions.find((option) => option.label.toLocaleLowerCase(localeCode) === initialOffer?.service_label?.toLocaleLowerCase(localeCode))?.value
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
    const needle = serviceInput.trim().toLocaleLowerCase(localeCode);
    if (needle.length < 1) return [];
    return serviceOptions
      .map((option) => option.label)
      .filter((label, index, list) => label && list.findIndex((item) => item.toLocaleLowerCase(localeCode) === label.toLocaleLowerCase(localeCode)) === index)
      .filter((label) => label.toLocaleLowerCase(localeCode).includes(needle))
      .slice(0, 6);
  }, [localeCode, serviceInput, serviceOptions]);
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
      if (!response.ok) throw new Error(json?.error || copy.uploadFailed);
      urls.push(String(json.url));
    }
    return sanitizeOfferImages(urls);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const currentPrice = parseOptionalWholeNumber(form.get("price_now")) ?? 0;
    const beforePrice = parseOptionalWholeNumber(form.get("price_before")) ?? 0;
    const quantityAvailable = parseOptionalWholeNumber(form.get("quantity_available"));
    const selectedLocationProvince = getProvinceById(locationProvince);
    const selectedLocationCanton = getCantonById(locationCanton);
    const locationLabel = locationProvince === "all_cr"
      ? copy.allCostaRica
      : selectedLocationCanton && selectedLocationProvince
        ? `${selectedLocationCanton.name}, ${selectedLocationProvince.name}`
        : selectedLocationProvince
          ? copy.wholeProvinceOf(selectedLocationProvince.name)
          : String(form.get("location_label_fallback") || "").trim();
    const nextErrors: FieldErrors = {};
    if (title.length < 3) nextErrors.title = copy.titleError;
    const selectedService = selectedServiceOption;
    if (!selectedService) nextErrors.service = copy.serviceError;
    if (description.length < 20) nextErrors.description = copy.descriptionError;
    if (files.length === 0 && existingImageUrls.length === 0) nextErrors.images = copy.imagesError;
    if (currentPrice <= 0) nextErrors.price = copy.priceError;
    if (beforePrice > 0 && beforePrice < currentPrice) nextErrors.priceBefore = copy.previousPriceError;
    if (!isWholeNumberInRange(currentPrice, 1, MAX_MONEY_AMOUNT)) nextErrors.price = copy.priceRangeError(formatNumberForMessage(MAX_MONEY_AMOUNT));
    if (!isWholeNumberInRange(beforePrice || null, 1, MAX_MONEY_AMOUNT)) nextErrors.priceBefore = copy.previousPriceRangeError(formatNumberForMessage(MAX_MONEY_AMOUNT));
    if (!isWholeNumberInRange(quantityAvailable, 1, MAX_OFFER_QUANTITY)) nextErrors.quantity = copy.quantityRangeError(formatNumberForMessage(MAX_OFFER_QUANTITY));
    if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < TODAY) {
      setError(copy.dateError);
      return;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) {
      setError(copy.reviewError);
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
        quantity_available: quantityAvailable,
        status: editing ? (initialOffer?.status ?? "published") : "published",
      };
      const request = editing && initialOffer?.id
        ? createClient().from("professional_offers").update(payload).eq("id", initialOffer.id).eq("professional_id", professionalId).select("id").single()
        : createClient().from("professional_offers").insert(payload).select("id").single();
      const { data, error: insertError } = await request;
      if (insertError) throw new Error(insertError.message.includes("schema cache")
        ? copy.databaseUnavailable
        : isNumericDatabaseRangeError(insertError.message)
          ? copy.numericError
          : copy.saveError);
      if (presentation === "modal") {
        onSaved?.(data.id);
        setSaving(false);
        return;
      }
      const returnToPanel = backHref.includes("/dashboard/profesional");
      router.replace(`/ofertas/${data.id}${returnToPanel ? "?from=panel" : ""}`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : copy.publishError);
      setSaving(false);
    }
  }

  return (
    <main className={presentation === "modal" ? "bg-white text-[#162543]" : "min-h-[calc(100vh-72px)] bg-white text-[#162543] lg:bg-[#f4f7fa] lg:px-6 lg:py-8"}>
      <header className={presentation === "modal" ? "hidden" : "sticky top-0 z-20 border-b border-[#dfe8f0] bg-white lg:hidden"}>
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href={backHref} aria-label={copy.back} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543]"><ArrowLeft className="h-6 w-6 stroke-[2.4]" /></Link>
          <h1 className="truncate text-center text-[17px] font-extrabold">{editing ? copy.editTitle : copy.publishTitle}</h1>
        </div>
      </header>
      <div className={presentation === "modal" ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-0 lg:py-0"}>
        <div className={presentation === "modal" ? "hidden" : "mb-4 hidden items-center justify-between gap-4 rounded-lg border border-[#dfe8f0] bg-white px-4 py-3 shadow-sm lg:flex"}>
          <Link href={backHref} aria-label={copy.backToOffers} className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold text-[#162543] transition hover:bg-[#f1f9fc] hover:text-[#008fc3]"><ArrowLeft className="h-5 w-5 stroke-[2.4]" />{copy.backToOffers}</Link>
          <div className="min-w-0 flex-1 text-center"><h1 className="truncate text-xl font-extrabold">{editing ? copy.editTitle : copy.publishTitle}</h1><p className="truncate text-sm text-[#65758c]">{copy.subtitle}</p></div>
          <div className="h-10 w-[128px]" aria-hidden="true" />
        </div>
        <form onSubmit={submit} noValidate className={presentation === "modal" ? "bg-white" : "rounded-lg border border-[#dfe8f0] bg-white p-5 sm:p-7"}>
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-semibold sm:col-span-2">
              <RequiredLabel>{copy.title}</RequiredLabel>
              <input name="title" maxLength={120} defaultValue={initialOffer?.title ?? ""} placeholder={copy.titlePlaceholder} className={FIELD_CLASS} />
              <FieldError>{fieldErrors.title}</FieldError>
            </label>
            <SelectMenu label={<RequiredLabel>{copy.type}</RequiredLabel>} value={offerType} onChange={setOfferType} options={Object.keys(OFFER_TYPES).map((value) => ({ value, label: offerTypeLabel(value as keyof typeof OFFER_TYPES, locale) }))} />
            <div className="relative flex min-w-0 flex-col gap-1 text-xs font-medium text-[#6b7280]">
              <label htmlFor="offer-service"><RequiredLabel>{copy.service}</RequiredLabel></label>
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
                    {selectedServiceOption?.label ?? copy.selectService}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#7b8ba1] transition-transform ${serviceSuggestionsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                <input type="hidden" name="service_label" value={selectedServiceOption?.label ?? ""} />
                {serviceSuggestionsOpen && (
                  <div id="offer-service-suggestions" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1ea] bg-white shadow-[0_16px_38px_-24px_rgba(15,23,42,0.8)]">
                    <div className={`relative p-2 ${serviceInput.trim() ? "border-b border-[#e6edf3]" : ""}`}>
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
                        placeholder={copy.servicePlaceholder}
                        autoComplete="off"
                        className="h-10 w-full rounded-lg bg-[#f5f8fa] pl-10 pr-3 text-sm font-medium text-[#111827] outline-none placeholder:text-[#9ca3af] focus:bg-white focus:ring-1 focus:ring-[#009fd9]"
                      />
                    </div>
                    {serviceInput.trim().length >= 1 && (
                      <div id="offer-service-options" role="listbox" className="max-h-56 overflow-y-auto py-1">
                        {visibleServiceSuggestions.length === 0 && <p className="px-3 py-3 text-xs font-medium text-[#68778d]">{copy.serviceNotFound}</p>}
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
                    )}
                  </div>
                )}
              </div>
              <FieldError>{fieldErrors.service}</FieldError>
            </div>
            <label className="text-sm font-semibold sm:col-span-2">
              <RequiredLabel>{copy.description}</RequiredLabel>
              <textarea name="description" maxLength={3000} defaultValue={initialOffer?.description ?? ""} placeholder={copy.descriptionPlaceholder} className={TEXTAREA_CLASS} />
              <FieldError>{fieldErrors.description}</FieldError>
            </label>
          </div>

          <section className="mt-6">
            <h2 className="font-bold"><RequiredLabel>{copy.images}</RequiredLabel></h2>
            <p className="text-xs text-[#68778d]">{copy.imageHelp}</p>
            <div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-5">
              {existingImageUrls.map((url) => (
                <div key={url} className="relative aspect-square overflow-hidden rounded-lg border border-[#d7e1ea]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setExistingImageUrls((current) => current.filter((item) => item !== url))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#162543] shadow"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {previews.map(({ file, url }) => (
                <div key={`${file.name}-${file.size}-${file.lastModified}`} className="relative aspect-square overflow-hidden rounded-lg border border-[#d7e1ea]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}<img src={url} alt="" className="h-full w-full object-cover" />
                  <button type="button" onClick={() => setFiles((current) => current.filter((item) => item !== file))} className="absolute right-1 top-1 grid h-7 w-7 place-items-center rounded-full bg-white/95 text-[#162543] shadow"><X className="h-4 w-4" /></button>
                </div>
              ))}
              {existingImageUrls.length + files.length < 5 && <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-[#9bdcf2] bg-[#f2fbfe] text-center text-xs font-bold text-[#008fc3]"><span><ImagePlus className="mx-auto mb-1 h-6 w-6" />{copy.addPhoto}</span><input type="file" accept="image/*" multiple className="sr-only" onChange={(event) => addFiles(event.target.files)} /></label>}
            </div>
            <FieldError>{fieldErrors.images}</FieldError>
          </section>

          <div className="my-6 border-t border-[#e6edf3] pt-6"><h2 className="font-bold">{copy.priceAndValidity}</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold"><RequiredLabel>{copy.currentPrice}</RequiredLabel><input name="price_now" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialOffer?.price_now ?? ""} placeholder="25000" className={FIELD_CLASS} /><FieldError>{fieldErrors.price}</FieldError></label>
            <label className="text-sm font-semibold">{copy.previousPrice} <span className="font-normal text-[#9ca3af]">({copy.optional})</span><input name="price_before" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialOffer?.price_before ?? ""} placeholder="35000" className={FIELD_CLASS} /><FieldError>{fieldErrors.priceBefore}</FieldError></label>
            <SelectMenu label={copy.currency} value={currency} onChange={setCurrency} options={[{ value: "CRC", label: copy.colones }, { value: "USD", label: copy.dollars }]} />
            <SelectMenu label={copy.unit} value={priceUnit} onChange={setPriceUnit} options={Object.keys(OFFER_PRICE_UNITS).map((value) => ({ value, label: offerPriceUnitLabel(value as keyof typeof OFFER_PRICE_UNITS, locale) }))} />
            <label className="text-sm font-semibold">{copy.quantity} <span className="font-normal text-[#9ca3af]">({copy.optional})</span><input name="quantity_available" inputMode="numeric" maxLength={7} defaultValue={initialOffer?.quantity_available ?? ""} placeholder="10" className={FIELD_CLASS} /><FieldError>{fieldErrors.quantity}</FieldError></label>
            <div className="text-sm font-semibold">
              {copy.availableUntil} <span className="font-normal text-[#9ca3af]">({copy.optional})</span>
              <div className="mt-1.5"><FutureDatePicker value={validUntil} onChange={setValidUntil} /></div>
              <p className="mt-1.5 text-xs font-normal text-[#68778d]">{copy.availabilityHelp}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-sm font-semibold">{copy.location} <span className="font-normal text-[#9ca3af]">({copy.optional})</span></span>
              <input type="hidden" name="location_label_fallback" value={initialOffer?.location_label ?? ""} />
              <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
                <SelectMenu
                  value={locationProvince}
                  onChange={(value) => { setLocationProvince(value); setLocationCanton(""); }}
                  placeholder={copy.province}
                  options={[{ value: "all_cr", label: copy.allCostaRica }, ...PROVINCES.map((province) => ({ value: province.id, label: province.name }))]}
                />
                <SelectMenu
                  value={locationCanton}
                  onChange={setLocationCanton}
                  disabled={!locationProvince || locationProvince === "all_cr"}
                  placeholder={locationProvince === "all_cr" ? copy.allCostaRica : copy.wholeProvince}
                  options={[{ value: "", label: copy.wholeProvince }, ...locationCantons.map((canton) => ({ value: canton.id, label: canton.name }))]}
                />
              </div>
            </div>
          </div>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={saving} className="mt-7 h-12 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white hover:bg-[#008fc3] disabled:cursor-not-allowed disabled:opacity-50">{saving ? (editing ? copy.saving : copy.publishing) : (editing ? copy.save : copy.publish)}</button>
        </form>
      </div>
    </main>
  );
}
