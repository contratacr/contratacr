"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PhoneInput } from "@/components/ui/phone-input";
import { UnsavedChangesGuard } from "@/components/dashboard/unsaved-changes-guard";
import { cn } from "@/lib/utils";
import { BARRA_ACCION_FIJA, useBarraAccionFija } from "@/components/ui/acciones-al-pie";
import { useHairlineOnScroll } from "@/components/util/use-hairline-on-scroll";
import { ArrowLeft, Check, ChevronDown, ImagePlus, Search, X } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import { OFFER_PRICE_UNITS, OFFER_TYPES, sanitizeOfferImages, type ProfessionalOffer } from "@/lib/offers";
import { SelectMenu, type SelectMenuOption } from "@/components/ui/select-menu";
import { FutureDatePicker } from "@/components/ui/future-date-picker";
import { PROVINCES, getCantonById, getCantonsByProvince, getProvinceById } from "@/lib/data/cr-geography";
import { crTodayISO } from "@/lib/time-cr";
import { MAX_MONEY_AMOUNT, MAX_OFFER_QUANTITY, formatNumberForMessage, isWholeNumberInRange, parseOptionalWholeNumber } from "@/lib/forms/numeric-validation";
import { marketplaceLocale, offerPriceUnitLabel, offerTypeLabel } from "@/lib/marketplace-copy";
import {
  getImageUploadPreparationErrorCode,
  prepareImageForUpload,
  uploadPhotoFormDataWithRetry,
} from "@/lib/client-image-upload";
import { IMAGE_ACCEPT } from "@/lib/upload-validation";
import { invalidateAppData } from "@/lib/app-data-invalidation";
import { Button } from "@/components/ui/button";
import { CABECERA_BOTON, CABECERA_FILA_CENTRADA, CABECERA_GLIFO, CABECERA_TITULO } from "@/components/layout/cabecera";

type OfferFormProps = {
  professionalId: string;
  serviceOptions: SelectMenuOption[];
  backHref?: string;
  initialOffer?: Partial<ProfessionalOffer> | null;
  presentation?: "page" | "modal";
  onSaved?: (id: string) => void;
  /** Salida explícita cuando el formulario vive en una ventana. */
  onCancel?: () => void;
};

type FieldErrors = Partial<Record<"title" | "service" | "description" | "images" | "price" | "priceBefore" | "quantity" | "whatsapp", string>>;

const TODAY = crTodayISO();
const FIELD_CLASS = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]";
const TEXTAREA_CLASS = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#009fd9]";

const OFFER_FORM_COPY = {
  es: {
    back: "Volver",
    backToOffers: "Volver a promociones",
    editTitle: "Editar promoción",
    publishTitle: "Publicar promoción",
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
    pareceEmpleo: "Esto parece una vacante, no una promoción. Las promociones son de lo que vos hacés; si estás buscando a alguien para contratar, va en Empleos, donde la gente se postula y te llega el currículum.",
    pareceEmpleoCta: "Publicarlo como empleo",
    images: "Imágenes",
    imageHelp: "Agrega de 1 a 5 fotos. La primera será la portada.",
    addPhoto: "Agregar foto",
    priceAndValidity: "Precio y vigencia",
    currentPrice: "Precio actual",
    previousPrice: "Precio anterior",
    negotiable: "Precio a consultar",
    negotiableHelp: "La promoción sale sin precio y la gente te escribe para preguntarlo.",
    optional: "opcional",
    currency: "Moneda",
    colones: "Colones (CRC)",
    dollars: "Dólares (USD)",
    unit: "Unidad",
    quantity: "Cantidad disponible",
    moreOptions: "Más opciones (moneda, unidad, cantidad)",
    availableUntil: "Disponible hasta",
    availabilityHelp: "La promoción se ocultará automáticamente después de esta fecha.",
    location: "Ubicación",
    province: "Provincia",
    allCostaRica: "Todo Costa Rica",
    wholeProvince: "Toda la provincia",
    wholeProvinceOf: (province: string) => `Toda la provincia de ${province}`,
    saving: "Guardando...",
    publishing: "Publicando...",
    save: "Guardar cambios",
    cancel: "Cancelar",
    publish: "Publicar promoción",
    uploadFailed: "No pudimos subir una imagen.",
    uploadTooLarge: "La imagen es demasiado grande y no pudimos optimizarla. Prueba con otra foto.",
    uploadUnsupported: "Ese formato de imagen no es compatible. Usa JPG, PNG, WEBP, HEIC, HEIF o GIF.",
    titleError: "Escribe un título de al menos 3 caracteres.",
    serviceError: "Selecciona un servicio de ContrataCR de las sugerencias.",
    descriptionError: "Describe la promoción con al menos 20 caracteres.",
    imagesError: "Agrega al menos una imagen de la promoción.",
    priceError: "Ingresa el precio o marca «Precio a consultar».",
    previousPriceError: "El precio anterior debe ser mayor o igual al actual.",
    priceRangeError: (maximum: string) => `Ingresa un precio entre 1 y ${maximum}.`,
    previousPriceRangeError: (maximum: string) => `Ingresa un precio anterior de hasta ${maximum}.`,
    quantityRangeError: (maximum: string) => `Ingresa una cantidad entre 1 y ${maximum}.`,
    dateError: "La fecha de vigencia no puede estar en el pasado.",
    reviewError: "Revisa los campos marcados antes de publicar.",
    databaseUnavailable: "La base de datos de promociones todavía no está habilitada.",
    numericError: "Uno de los precios o cantidades es demasiado alto. Revisa los valores ingresados.",
    saveError: "No pudimos guardar la promoción. Revisa la información e inténtalo nuevamente.",
    publishError: "No pudimos publicar la promoción.",
    whatsapp: "WhatsApp", whatsappHelp: "Es por donde te van a escribir. Viene el de tu cuenta; podés cambiarlo para esta promoción.",
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
    pareceEmpleo: "This looks like a job opening, not an offer. Offers are promotions of what you do; if you are looking to hire someone, it belongs in Jobs, where people apply and you get their résumé.",
    pareceEmpleoCta: "Post it as a job",
    images: "Images",
    imageHelp: "Add 1 to 5 photos. The first one will be the cover.",
    addPhoto: "Add photo",
    priceAndValidity: "Price and availability",
    currentPrice: "Current price",
    previousPrice: "Previous price",
    negotiable: "Price on request",
    negotiableHelp: "The promotion shows no price and people message you to ask.",
    optional: "optional",
    currency: "Currency",
    colones: "Costa Rican colones (CRC)",
    dollars: "US dollars (USD)",
    unit: "Unit",
    quantity: "Available quantity",
    moreOptions: "More options (currency, unit, quantity)",
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
    cancel: "Cancel",
    publish: "Post offer",
    uploadFailed: "We could not upload an image.",
    uploadTooLarge: "The image is too large and could not be optimized. Try another photo.",
    uploadUnsupported: "That image format is not supported. Use JPG, PNG, WEBP, HEIC, HEIF, or GIF.",
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
    whatsapp: "WhatsApp", whatsappHelp: "This is where people will write to you. Your account number is filled in; you can change it for this promotion.",
  },
} as const;

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <span>{children} <span className="text-red-500">*</span></span>;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p data-campo-con-error="" role="alert" className="mt-1.5 text-xs font-medium text-red-600">{children}</p> : null;
}

// En producción aparecieron dos vacantes publicadas como ofertas —«Operario en
// techos» y «Ocupo un excelente barbero para mi salón»—. Una oferta es una
// promoción de lo que uno hace; un empleo es una plaza que uno busca llenar.
// Estas señales, de a dos, delatan una vacante: se avisa y se manda a la puerta
// correcta, sin bloquear. Mismo criterio que ya usa Publicar proyecto.
const SENALES_DE_VACANTE: RegExp[] = [
  /\b(?:ocupo|necesito|necesitamos|busco|buscamos|se\s+necesita|se\s+busca|requiero|requerimos|solicito|solicitamos)\b/i,
  /\b(?:operari[oa]|ayudante|pe[óo]n|asistente|colaborador|emplead[oa]|personal|vacante|plaza|puesto|contratar|contrataci[óo]n)\b/i,
  /\b(?:salario|sueldo|pago\s+(?:quincenal|semanal|mensual)|por\s+hora|jornada|medio\s+tiempo|tiempo\s+completo|horario\s+de)\b/i,
  /\b(?:requisitos|experiencia\s+comprobable|con\s+experiencia|enviar\s+curr[íi]culum|curr[íi]culum|hoja\s+de\s+vida|cv\b)\b/i,
];

/** Dos señales, no una: «necesito» o «con experiencia» también aparecen en una
 *  promoción legítima. */
export function pareceVacante(texto: string): boolean {
  const limpio = (texto ?? "").trim();
  if (limpio.length < 12) return false;
  return SENALES_DE_VACANTE.filter((senal) => senal.test(limpio)).length >= 2;
}

export function OfferForm({ professionalId, serviceOptions, backHref = "/ofertas", initialOffer = null, presentation = "page", onSaved, onCancel }: OfferFormProps) {
  const { sentinelaRef, cabeceraRef, conLinea } = useHairlineOnScroll();
  const locale = marketplaceLocale(useLocale());
  const copy = OFFER_FORM_COPY[locale];
  const localeCode = locale === "en" ? "en-US" : "es-CR";
  const editing = Boolean(initialOffer?.id);
  const router = useRouter();
  useBarraAccionFija();
  const [saving, setSaving] = useState(false);
  // El WhatsApp de ESTA promoción: viene el de la cuenta y se puede cambiar.
  const [whatsapp, setWhatsapp] = useState<string>(initialOffer?.contact_whatsapp ?? "");
  useEffect(() => {
    if (initialOffer?.contact_whatsapp) return;
    let vivo = true;
    void createClient().from("professionals").select("whatsapp").eq("id", professionalId).maybeSingle().then(({ data }) => {
      const guardado = String((data as { whatsapp?: string | null } | null)?.whatsapp ?? "").trim();
      if (vivo && guardado) queueMicrotask(() => setWhatsapp(guardado));
    });
    return () => { vivo = false; };
  }, [initialOffer?.contact_whatsapp, professionalId]);
  // El formulario se referencia para llevar la vista al primer campo señalado,
  // y recuerda si hay algo escrito para avisar antes de salir sin publicar.
  const formRef = useRef<HTMLFormElement>(null);
  const [conCambios, setConCambios] = useState(false);
  const [textoEscrito, setTextoEscrito] = useState(`${initialOffer?.title ?? ""} ${initialOffer?.description ?? ""}`);
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
  // «Precio a consultar»: sin número. Antes el precio era obligatorio con
  // mínimo 1 y la mitad de las promociones de producción decían «₡1».
  const [sinPrecio, setSinPrecio] = useState<boolean>(Boolean(initialOffer && initialOffer.price_now == null));
  const [priceUnit, setPriceUnit] = useState<string>(initialOffer?.price_unit ?? "total");
  const [validUntil, setValidUntil] = useState(initialOffer?.valid_until ?? "");
  const [locationProvince, setLocationProvince] = useState("");
  const [locationCanton, setLocationCanton] = useState("");
  const [existingImageUrls, setExistingImageUrls] = useState<string[]>(Array.isArray(initialOffer?.image_urls) ? initialOffer.image_urls : []);
  // Todos sus servicios se ven al abrir: antes el panel salía vacío hasta
  // escribir una letra, y el profesional no sabía qué podía elegir.
  const serviceLabels = useMemo(() => serviceOptions
    .map((option) => option.label)
    .filter((label, index, list) => label && list.findIndex((item) => item.toLocaleLowerCase(localeCode) === label.toLocaleLowerCase(localeCode)) === index),
  [localeCode, serviceOptions]);
  const visibleServiceSuggestions = useMemo(() => {
    const needle = serviceInput.trim().toLocaleLowerCase(localeCode);
    if (!needle) return serviceLabels;
    return serviceLabels.filter((label) => label.toLocaleLowerCase(localeCode).includes(needle));
  }, [localeCode, serviceInput, serviceLabels]);
  const selectedServiceOption = useMemo(() => {
    return serviceOptions.find((option) => option.value === selectedServiceValue) ?? null;
  }, [selectedServiceValue, serviceOptions]);


  const previews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  useEffect(() => () => previews.forEach((preview) => URL.revokeObjectURL(preview.url)), [previews]);
  const locationCantons = getCantonsByProvince(locationProvince);

  function addFiles(nextFiles: FileList | null) {
    // Copy the selection now: the input's FileList is live, and it is emptied
    // the moment the input value is reset below — before React runs the
    // deferred state updater. Reading it lazily attached nothing.
    const picked = nextFiles ? Array.from(nextFiles) : [];
    if (!picked.length) return;
    setFiles((current) => {
      const remaining = Math.max(0, 5 - existingImageUrls.length - current.length);
      return [...current, ...picked.slice(0, remaining)];
    });
    setFieldErrors((current) => ({ ...current, images: undefined }));
  }

  async function uploadImages() {
    const urls: string[] = [];
    const uploadedFiles = new Set<File>();
    const preserveCompletedUploads = () => {
      if (!urls.length) return;
      setExistingImageUrls((current) => sanitizeOfferImages([...current, ...urls]));
      setFiles((current) => current.filter((file) => !uploadedFiles.has(file)));
    };
    for (const file of files) {
      try {
        // Mobile camera photos commonly exceed the request-body limit. Resize and
        // normalize them before the request, matching the profile/gallery flow.
        const preparedFile = await prepareImageForUpload(file, { maxDimension: 1600 });
        const body = new FormData();
        body.append("file", preparedFile);
        body.append("type", "portfolio");
        const response = await uploadPhotoFormDataWithRetry(body);
        if (!response.ok || !response.data.url) {
          const serverMessage = response.data.error ?? "";
          if (/supera el límite|too large/i.test(serverMessage)) throw new Error(copy.uploadTooLarge);
          if (/formato no permitido|not supported/i.test(serverMessage)) throw new Error(copy.uploadUnsupported);
          throw new Error(copy.uploadFailed);
        }
        urls.push(response.data.url);
        uploadedFiles.add(file);
      } catch (uploadError) {
        // Do not upload successful files again when a later image fails or the
        // user retries publishing; that also prevents avoidable rate limiting.
        preserveCompletedUploads();
        const code = getImageUploadPreparationErrorCode(uploadError);
        if (code === "too_large") throw new Error(copy.uploadTooLarge);
        if (code === "unsupported") throw new Error(copy.uploadUnsupported);
        throw uploadError instanceof Error ? uploadError : new Error(copy.uploadFailed);
      }
    }
    preserveCompletedUploads();
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
    if (!sinPrecio) {
      if (currentPrice <= 0) nextErrors.price = copy.priceError;
      if (beforePrice > 0 && beforePrice < currentPrice) nextErrors.priceBefore = copy.previousPriceError;
      if (!isWholeNumberInRange(currentPrice, 1, MAX_MONEY_AMOUNT)) nextErrors.price = copy.priceRangeError(formatNumberForMessage(MAX_MONEY_AMOUNT));
      if (!isWholeNumberInRange(beforePrice || null, 1, MAX_MONEY_AMOUNT)) nextErrors.priceBefore = copy.previousPriceRangeError(formatNumberForMessage(MAX_MONEY_AMOUNT));
    }
    if (!isWholeNumberInRange(quantityAvailable, 1, MAX_OFFER_QUANTITY)) nextErrors.quantity = copy.quantityRangeError(formatNumberForMessage(MAX_OFFER_QUANTITY));
    if (validUntil && /^\d{4}-\d{2}-\d{2}$/.test(validUntil) && validUntil < TODAY) {
      setError(copy.dateError);
      return;
    }
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      // Llevar la vista al primer campo señalado.
      requestAnimationFrame(() => {
        formRef.current?.querySelector("[data-campo-con-error]")?.scrollIntoView({ behavior: "smooth", block: "center" });
      });
    }
    if (Object.keys(nextErrors).length > 0) {
      setError(copy.reviewError);
      return;
    }

    setSaving(true);
    setError("");
    try {
      const imageUrls = sanitizeOfferImages([...existingImageUrls, ...(await uploadImages())]);
      const payload = {
        id: editing ? initialOffer?.id : null,
        professional_id: professionalId,
        service_category_id: selectedService!.value,
        title,
        description,
        offer_type: offerType,
        service_label: selectedService!.label,
        image_urls: imageUrls,
        price_now: sinPrecio ? null : currentPrice,
        price_before: sinPrecio ? null : beforePrice || null,
        currency,
        price_unit: priceUnit,
        location_label: locationLabel || null,
        valid_until: /^\d{4}-\d{2}-\d{2}$/.test(validUntil) ? validUntil : null,
        quantity_available: quantityAvailable,
        contact_whatsapp: whatsapp.trim() || null,
        status: editing ? (initialOffer?.status ?? "published") : "published",
      };
      const response = await fetch("/api/offers", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) {
        // Lo que dice el servidor es lo que hay que corregir («Indica la
        // ubicación…»): se muestra tal cual. Antes se tapaba con un mensaje
        // genérico si no empezaba con «No pudimos».
        const delServidor = new Error(typeof data?.error === "string" ? data.error : copy.saveError);
        (delServidor as Error & { delServidor?: boolean }).delServidor = typeof data?.error === "string";
        throw delServidor;
      }
      invalidateAppData("offers");
      if (presentation === "modal") {
        onSaved?.(data.id);
        setSaving(false);
        return;
      }
      const returnToPanel = backHref.includes("/dashboard/profesional");
      setConCambios(false);
      router.replace(`/ofertas/${data.id}${returnToPanel ? "?from=panel" : ""}`);
      router.refresh();
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      const knownUploadError = [copy.uploadFailed, copy.uploadTooLarge, copy.uploadUnsupported].some((known) => known === message);
      setError(knownUploadError || (err as { delServidor?: boolean } | null)?.delServidor || message.startsWith("No pudimos") || message.startsWith("We could not") ? message : copy.publishError);
      setSaving(false);
    }
  }

  return (
    <main className={presentation === "modal" ? "bg-[#f4f7fa] text-[#162543]" : "min-h-[calc(100vh-72px)] bg-[#f4f7fa] text-[#162543] lg:px-6 lg:py-8"}>
      {presentation !== "modal" && <div ref={sentinelaRef} aria-hidden className="h-px lg:hidden" />}
      <header ref={cabeceraRef} className={presentation === "modal" ? "hidden" : cn("sticky top-0 z-20 border-b bg-white transition-colors duration-200 lg:hidden", conLinea ? "border-[#e5e7eb]" : "border-transparent")}>
        <div className={CABECERA_FILA_CENTRADA}>
          <Link href={backHref} aria-label={copy.back} className={cn("absolute left-4 top-1/2 -translate-y-1/2", CABECERA_BOTON)}><ArrowLeft className={cn(CABECERA_GLIFO, "stroke-[2.4]")} /></Link>
          <h1 className={cn(CABECERA_TITULO, "text-center")}>{editing ? copy.editTitle : copy.publishTitle}</h1>
        </div>
      </header>
      <div className={presentation === "modal" ? "mx-auto max-w-3xl px-4 py-5" : "mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-0 lg:py-0"}>
        <div className={presentation === "modal" ? "hidden" : "mb-4 hidden items-center justify-between gap-4 rounded-lg border border-[#dfe8f0] bg-white px-4 py-3 shadow-sm lg:flex"}>
          <Link href={backHref} aria-label={copy.backToOffers} className="inline-flex h-10 items-center gap-2 rounded-lg px-2 text-sm font-extrabold text-[#162543] transition hover:bg-[#f1f9fc] hover:text-[#008fc3]"><ArrowLeft className="h-5 w-5 stroke-[2.4]" />{copy.backToOffers}</Link>
          <div className="min-w-0 flex-1 text-center"><h1 className="truncate text-xl font-extrabold">{editing ? copy.editTitle : copy.publishTitle}</h1><p className="truncate text-sm text-[#65758c]">{copy.subtitle}</p></div>
          <div className="h-10 w-[128px]" aria-hidden="true" />
        </div>
        <form
          ref={formRef}
          onSubmit={submit}
          onInput={() => {
            setConCambios(true);
            const datos = formRef.current ? new FormData(formRef.current) : null;
            setTextoEscrito(`${datos?.get("title") ?? ""} ${datos?.get("description") ?? ""}`);
          }}
          onChange={() => setConCambios(true)}
          noValidate
          className="max-sm:pb-24"
        >
          <div className="rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
          <div className="grid gap-5 sm:grid-cols-2">
            <label className="text-sm font-medium text-[#374151] sm:col-span-2">
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
                  <span className={selectedServiceOption ? "truncate text-[#162543]" : "truncate text-[#68778d]"}>
                    {selectedServiceOption?.label ?? copy.selectService}
                  </span>
                  <ChevronDown className={`h-4 w-4 shrink-0 text-[#7b8ba1] transition-transform ${serviceSuggestionsOpen ? "rotate-180" : ""}`} aria-hidden="true" />
                </button>
                <input type="hidden" name="service_label" value={selectedServiceOption?.label ?? ""} />
                {serviceSuggestionsOpen && (
                  <div id="offer-service-suggestions" className="absolute left-0 right-0 top-[calc(100%+6px)] z-30 overflow-hidden rounded-xl border border-[#d7e1ea] bg-white shadow-[0_16px_38px_-24px_rgba(15,23,42,0.8)]">
                    {serviceLabels.length > 6 && (
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
                        placeholder={copy.servicePlaceholder}
                        autoComplete="off"
                        className="h-10 w-full rounded-lg bg-[#f5f8fa] pl-10 pr-3 text-sm font-medium text-[#162543] outline-none placeholder:text-[#68778d] focus:bg-white focus:ring-1 focus:ring-[#009fd9]"
                      />
                    </div>
                    )}
                    {(
                      <div id="offer-service-options" role="listbox" className="max-h-64 overflow-y-auto py-1">
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
            <div className="sm:col-span-2">
              <PhoneInput label={<RequiredLabel>{copy.whatsapp}</RequiredLabel>} value={whatsapp} onChange={setWhatsapp} error={fieldErrors.whatsapp} />
              <p className="mt-1.5 text-xs text-[#68778d]">{copy.whatsappHelp}</p>
            </div>
            <label className="text-sm font-medium text-[#374151] sm:col-span-2">
              <RequiredLabel>{copy.description}</RequiredLabel>
              <textarea name="description" maxLength={3000} defaultValue={initialOffer?.description ?? ""} placeholder={copy.descriptionPlaceholder} className={TEXTAREA_CLASS} />
              <FieldError>{fieldErrors.description}</FieldError>
              {pareceVacante(textoEscrito) && (
                <div role="status" className="mt-2.5 flex flex-col gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-3 text-[13px] font-normal leading-relaxed text-[#92400e]">
                  <p className="font-medium">{copy.pareceEmpleo}</p>
                  <Link
                    href="/empleos/publicar"
                    className="inline-flex h-9 w-fit items-center rounded-full bg-[#b45309] px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[#92400e]"
                  >
                    {copy.pareceEmpleoCta}
                  </Link>
                </div>
              )}
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
              {existingImageUrls.length + files.length < 5 && <label className="grid aspect-square cursor-pointer place-items-center rounded-lg border border-dashed border-[#9bdcf2] bg-[#f2fbfe] text-center text-xs font-bold text-[#008fc3]"><span><ImagePlus className="mx-auto mb-1 h-6 w-6" />{copy.addPhoto}</span><input type="file" accept={IMAGE_ACCEPT} multiple className="sr-only" onChange={(event) => { addFiles(event.target.files); event.currentTarget.value = ""; }} /></label>}
            </div>
            <FieldError>{fieldErrors.images}</FieldError>
          </section>

          <div className="my-6 border-t border-[#e6edf3] pt-6"><h2 className="font-bold">{copy.priceAndValidity}</h2></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex items-start gap-3 rounded-lg border border-[#e6edf3] px-4 py-3 sm:col-span-2">
              <input type="checkbox" name="sin_precio" checked={sinPrecio} onChange={(event) => { setSinPrecio(event.target.checked); setFieldErrors((current) => ({ ...current, price: undefined, priceBefore: undefined })); }} className="mt-0.5 h-4 w-4 shrink-0 accent-[#009fd9]" />
              <span className="text-sm"><span className="font-semibold text-[#162543]">{copy.negotiable}</span><span className="block text-[13px] text-[#68778d]">{copy.negotiableHelp}</span></span>
            </label>
            {!sinPrecio && (<>
            <label className="text-sm font-medium text-[#374151]"><RequiredLabel>{copy.currentPrice}</RequiredLabel><input name="price_now" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialOffer?.price_now ?? ""} placeholder="25000" className={FIELD_CLASS} /><FieldError>{fieldErrors.price}</FieldError></label>
            <label className="text-sm font-medium text-[#374151]">{copy.previousPrice} <span className="font-normal text-[#68778d]">({copy.optional})</span><input name="price_before" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialOffer?.price_before ?? ""} placeholder="35000" className={FIELD_CLASS} /><FieldError>{fieldErrors.priceBefore}</FieldError></label>
            </>)}
            {/* Casi toda oferta es en colones, sin unidad especial ni cupo: esos tres
                campos se pliegan para que el formulario se lea en una pasada. */}
            <details className="rounded-lg border border-[#e6edf3] px-4 py-3 sm:col-span-2" open={Boolean(initialOffer && (initialOffer.currency === "USD" || initialOffer.quantity_available))}>
              <summary className="cursor-pointer text-sm font-semibold text-[#162543]">{copy.moreOptions}</summary>
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <SelectMenu label={copy.currency} value={currency} onChange={setCurrency} options={[{ value: "CRC", label: copy.colones }, { value: "USD", label: copy.dollars }]} />
                <SelectMenu label={copy.unit} value={priceUnit} onChange={setPriceUnit} options={Object.keys(OFFER_PRICE_UNITS).map((value) => ({ value, label: offerPriceUnitLabel(value as keyof typeof OFFER_PRICE_UNITS, locale) }))} />
                <label className="text-sm font-medium text-[#374151]">{copy.quantity} <span className="font-normal text-[#68778d]">({copy.optional})</span><input name="quantity_available" inputMode="numeric" maxLength={7} defaultValue={initialOffer?.quantity_available ?? ""} placeholder="10" className={FIELD_CLASS} /><FieldError>{fieldErrors.quantity}</FieldError></label>
              </div>
            </details>
            <div className="text-sm font-semibold">
              {copy.availableUntil} <span className="font-normal text-[#68778d]">({copy.optional})</span>
              <div className="mt-1.5"><FutureDatePicker value={validUntil} onChange={setValidUntil} /></div>
              <p className="mt-1.5 text-xs font-normal text-[#68778d]">{copy.availabilityHelp}</p>
            </div>
            <div className="sm:col-span-2">
              <span className="text-sm font-semibold">{copy.location} <span className="font-normal text-[#68778d]">({copy.optional})</span></span>
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
          </div>
          <div className={cn(
            // El pie es una barra: tiene que llegar a los bordes. Dentro de una
            // ventana hay que descontar DOS rellenos (el del cuerpo y el de la
            // columna del formulario); si solo se descuenta uno queda una franja
            // gris a cada lado.
            BARRA_ACCION_FIJA,
            "z-20 max-sm:fixed max-sm:inset-x-0 max-sm:bottom-0 sm:sticky sm:bottom-0 sm:-mx-4 sm:mt-5 sm:flex sm:justify-end sm:px-6 sm:pb-4",
            presentation === "modal" ? "sm:-mx-10" : "sm:-mx-6",
          )}>
            {/* En una ventana, la salida acompaña a la acción: cerrar un
                formulario largo sin querer cuesta caro. En la página propia no
                hace falta —la vuelta atrás ya está arriba. */}
            {presentation === "modal" && onCancel && (
              <Button type="button" variant="outline" size="lg" onClick={onCancel} className="hidden sm:inline-flex sm:px-6">
                {copy.cancel}
              </Button>
            )}
            <div>
              <Button type="submit" size="lg" loading={saving} className="w-full sm:w-auto sm:px-8">{editing ? copy.save : copy.publish}</Button>
            </div>
          </div>
        </form>
        <UnsavedChangesGuard dirty={conCambios && !saving} />
      </div>
    </main>
  );
}
