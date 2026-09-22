"use client";

import { PantallaDeExito } from "@/components/ui/pantalla-de-exito";
import { useEffect, useRef, useState, type RefObject } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { CategorySearch } from "@/components/ui/category-search";
import { SelectMenu } from "@/components/ui/select-menu";
import { AlertCircle, ArrowLeft, X } from "lucide-react";
import { PROVINCES } from "@/lib/data/cr-geography";
import { PhoneInput, isPhoneComplete } from "@/components/ui/phone-input";
import { createClient } from "@/lib/supabase/client";
import { getCategoryLabel } from "@/lib/data/categories";
import { useLocale } from "next-intl";
import { lockBodyScroll } from "@/lib/body-scroll-lock";
import { useSombrasDeBorde } from "@/components/ui/modal";
import { useAuth } from "@/hooks/use-auth";
import { Link } from "@/i18n/navigation";
import { BARRA_ACCION_BASE } from "@/components/ui/acciones-al-pie";
import { cn } from "@/lib/utils";

const PROJECT_DESCRIPTION_MAX_LENGTH = 300;
const LAST_ZONE_KEY = "ccr:last-request-zone";

type ProjectErrorField = "category" | "description" | "phone";

// En producción, los primeros "proyectos" fueron profesionales ofreciendo sus
// servicios. Estas señales, de a dos, delatan un anuncio: se avisa y se manda
// a la puerta correcta (oferta o registro profesional), sin bloquear.
const SENALES_DE_ANUNCIO: RegExp[] = [
  /\b(?:ofrezco|ofrecemos|brindo|brindamos|realizo|realizamos|elaboro|elaboramos|confecciono|vendo|hago|hacemos|dise[ñn]amos)\b/i,
  /\bcreo\s+(?!que\b)/i,
  /\b(?:necesit[áa]s|buscas|busc[áa]s|quer[ée]s|requer[íi]s|ten[ée]s)\b/i,
  /\b(?:cont[áa]ctame|contactame|escr[íi]beme|escribime|ll[áa]mame|llamame|consultas?\s+al|inbox|mi whatsapp)\b/i,
  /\b(?:mis servicios|mi servicio|a tu gusto|a su gusto|presupuesto sin compromiso|a domicilio|precios accesibles|entrega r[áa]pida)\b/i,
  /\b(?:a[ñn]os de experiencia|calidad garantizada|100%|satisfacci[óo]n garantizada)\b/i,
];

/** Dos señales, no una: cualquiera suelta también aparece en pedidos reales. */
export function pareceAnuncioDeServicio(texto: string): boolean {
  const limpio = (texto ?? "").trim();
  if (limpio.length < 25) return false;
  return SENALES_DE_ANUNCIO.filter((r) => r.test(limpio)).length >= 2;
}

// Publicar una solicitud: el cliente elige el servicio, cuenta qué hay que hacer y
// publica. La zona se recuerda de la última vez. Sin título (lo arma el servidor),
// sin presupuesto, sin plazo, sin cédula ni teléfono: el cliente es quien escribe
// después por WhatsApp al profesional que le responda.
/**
 * El MISMO formulario sirve para publicar y para corregir. Empleos y
 * promociones se editan siempre y un proyecto no se editaba nunca: un dato mal
 * escrito obligaba a cancelar y volver a publicar, perdiendo la fecha y a quien
 * ya lo estaba mirando. Editando no se pregunta el teléfono —ya está en la
 * cuenta— ni se vuelve a avisar a nadie: solo cambia lo que el cliente escribió.
 */
export type ProyectoParaEditar = {
  id: string;
  categoryId: string;
  description: string;
  provinciaId: string;
  cantonId: string;
};

export function PublishProjectModal({ onClose, onSuccess, editar }: {
  onClose: () => void;
  onSuccess?: () => void;
  editar?: ProyectoParaEditar;
}) {
  const base = editar;
  const t = useTranslations("publicarProyecto");
  const locale = useLocale();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const yaEsProfesional = user?.user_metadata?.is_provider === true;
  const initialCategoryId = searchParams.get("categoria") || "";

  const [form, setForm] = useState({
    categoryId: base?.categoryId || initialCategoryId,
    description: base?.description || "",
    provinciaId: base?.provinciaId || searchParams.get("provincia") || "",
    cantonId: base?.cantonId || searchParams.get("canton") || "",
  });
  const [telefono, setTelefono] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ProjectErrorField | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [published, setPublished] = useState<{ notifiedCount: number; service: string } | null>(null);
  // Esta ventana se dibuja a mano, no con `Modal`, así que nunca recibía la
  // marca que enciende la sombra del pie: era la franja de referencia del
  // sistema y la única que no la tenía en ninguna pantalla.
  const cuerpo = useRef<HTMLDivElement>(null);
  const sombras = useSombrasDeBorde(cuerpo);
  const categoryFieldRef = useRef<HTMLDivElement>(null);
  const descriptionFieldRef = useRef<HTMLDivElement>(null);

  // El teléfono solo se pregunta cuando la cuenta no tiene ninguno. Con
  // WhatsApp como única vía de respuesta, un proyecto sin número es un proyecto
  // que nadie puede contestar.
  useEffect(() => {
    if (!user) return;
    let vivo = true;
    void createClient()
      .rpc("get_my_profile")
      .then(({ data }) => {
        if (!vivo) return;
        const guardado = String((data as { phone?: string | null } | null)?.phone ?? "").trim();
        queueMicrotask(() => {
          if (!vivo) return;
          if (guardado) setTelefono(guardado);
        });
      });
    return () => { vivo = false; };
  }, [user]);

  // La zona se recuerda entre solicitudes: casi siempre es la misma casa.
  useEffect(() => {
    if (form.provinciaId || editar) return;
    try {
      const raw = window.localStorage.getItem(LAST_ZONE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as { provinciaId?: string; cantonId?: string };
      if (saved?.provinciaId) {
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setForm((f) => ({ ...f, provinciaId: saved.provinciaId ?? "", cantonId: saved.cantonId ?? "" }));
      }
    } catch { /* sin zona guardada */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function reportError(message: string, field: ProjectErrorField, ref: RefObject<HTMLDivElement | null>) {
    setError(message);
    setErrorField(field);
    requestAnimationFrame(() => {
      ref.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      ref.current?.querySelector<HTMLElement>("input:not(:disabled), textarea:not(:disabled)")?.focus({ preventScroll: true });
    });
  }

  const selectedProvincia = PROVINCES.find((p) => p.id === form.provinciaId);
  const cantons = selectedProvincia?.cantons ?? [];

  function update(field: keyof typeof form, value: string) {
    const nextValue = field === "description" ? value.slice(0, PROJECT_DESCRIPTION_MAX_LENGTH) : value;
    setForm((f) => ({ ...f, [field]: nextValue, ...(field === "provinciaId" ? { cantonId: "" } : {}) }));
    if (errorField === field) {
      setError(null);
      setErrorField(null);
    }
  }

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
    setErrorField(null);
    if (!form.categoryId) { reportError(t("errCategory"), "category", categoryFieldRef); return; }
    if (!form.description.trim()) { reportError(t("errDescription"), "description", descriptionFieldRef); return; }

    // Editando no se vuelve a pedir el número: el proyecto ya tiene el suyo.
    if (!editar && !isPhoneComplete(telefono)) {
      setErrorField("phone");
      setError(t("errPhone"));
      return;
    }
    setSubmitting(true);
    try {
      if (editar) {
        const res = await fetch("/api/projects", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editar.id,
            action: "edit",
            categoryId: form.categoryId,
            description: form.description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH),
            provinciaId: form.provinciaId || null,
            cantonId: form.cantonId || null,
          }),
        });
        const datos = await res.json().catch(() => ({}));
        if (!res.ok) { setError(datos.error ?? t("errPublish")); return; }
        onSuccess?.();
        onClose();
        return;
      }
      const res = await fetch("/api/projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: form.description.trim().slice(0, PROJECT_DESCRIPTION_MAX_LENGTH),
          categoryId: form.categoryId,
          provinciaId: form.provinciaId || null,
          cantonId: form.cantonId || null,
          phone: telefono.trim() || null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error ?? t("errPublish"));
        return;
      }
      try {
        window.localStorage.setItem(LAST_ZONE_KEY, JSON.stringify({ provinciaId: form.provinciaId, cantonId: form.cantonId }));
      } catch { /* sin almacenamiento */ }
      onSuccess?.();
      setPublished({
        notifiedCount: typeof data.notifiedCount === "number" ? data.notifiedCount : 0,
        service: getCategoryLabel(form.categoryId, locale),
      });
    } catch {
      setError(t("errUnexpected"));
    } finally {
      setSubmitting(false);
    }
  }

  const fieldLabel = "mb-1.5 block text-[15px] font-semibold text-[#162543]";
  // La misma marca que en Empleos y Promociones: asterisco rojo en lo
  // obligatorio, «(opcional)» en lo que no lo es. Aquí no había ninguna de las
  // dos y había que adivinar.
  const obligatorio = <span className="text-red-500"> *</span>;

  return (
    <div className="app-modal-screen fixed inset-0 z-[100] flex items-stretch justify-center sm:items-center sm:p-4">
      <div className="absolute inset-0 hidden bg-black/50 backdrop-blur-sm sm:block" onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="publish-project-title"
        data-ccr-hay-mas={sombras.abajo ? "" : undefined}
        className="app-fullscreen-modal relative z-10 flex h-[var(--app-visual-viewport-height)] min-h-0 w-full max-h-[var(--app-visual-viewport-height)] flex-col overflow-hidden bg-white shadow-none sm:h-auto sm:max-h-[90vh] sm:max-w-2xl sm:rounded-2xl sm:shadow-2xl"
      >
        {/* La cabecera tambien enciende: el enganche ya media las dos orillas
            y aqui solo se estaba usando la de abajo. */}
        <div className={cn("relative flex shrink-0 items-center justify-center gap-3 border-b border-[#e5e7eb] px-14 py-4 transition-shadow sm:items-start sm:justify-between sm:px-6", sombras.arriba && "shadow-[0_8px_12px_-6px_rgba(15,23,42,0.18)]")}>
          {/* Solo el título: la línea de apoyo repetía lo que el propio
              formulario ya promete y robaba alto en el teléfono. */}
          <div className="min-w-0 text-center sm:text-left">
            <h2 id="publish-project-title" className="text-lg font-bold text-[#162543]">{editar ? t("editTitle") : t("title")}</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("dismiss")}
            className="absolute left-4 top-1/2 flex h-10 w-10 -translate-y-1/2 shrink-0 items-center justify-center rounded-xl text-[#162543] transition-colors hover:bg-[#eef5f9] sm:static sm:h-8 sm:w-8 sm:translate-y-0 sm:rounded-lg"
          >
            <ArrowLeft className="h-5 w-5 sm:hidden" />
            <X className="hidden h-5 w-5 sm:block" />
          </button>
        </div>

        <form noValidate onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col sm:flex-none">
          {published ? (
            <PantallaDeExito titulo={t("successTitle")} className="min-h-0 flex-1">
              <p className="max-w-[22rem] text-[15px] font-medium leading-relaxed text-[#162543]">
                {t("successNotified", { count: published.notifiedCount, service: published.service })}
              </p>
              <p className="max-w-[22rem] text-sm leading-relaxed text-[#6b7280]">{t("successNext")}</p>
            </PantallaDeExito>
          ) : (
            <div ref={cuerpo} className="flex min-h-0 flex-1 flex-col overflow-y-auto overscroll-contain bg-[#f4f7fa] px-4 py-5 sm:max-h-[calc(90vh-145px)] sm:flex-none">
              <div className="flex flex-col gap-6 rounded-2xl border border-[#e5e7eb] bg-white p-5 shadow-sm">
                <div ref={categoryFieldRef}>
                  <label className={fieldLabel}>{t("category")}{obligatorio}</label>
                  <CategorySearch
                    value={form.categoryId}
                    onChange={(id) => update("categoryId", id)}
                    placeholder={t("categoryPlaceholder")}
                    error={errorField === "category" ? error ?? undefined : undefined}
                  />
                </div>

                <div ref={descriptionFieldRef}>
                  <label className={fieldLabel}>{t("description")}{obligatorio}</label>
                  <textarea
                    className="min-h-[132px] w-full resize-none break-words rounded-xl border border-[#e5e7eb] bg-white px-4 py-3 text-[15px] text-[#162543] placeholder:text-[#68778d] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9] aria-[invalid=true]:border-red-400"
                    placeholder={t("descriptionPlaceholder")}
                    value={form.description}
                    onChange={(e) => update("description", e.target.value)}
                    maxLength={PROJECT_DESCRIPTION_MAX_LENGTH}
                    required
                    aria-invalid={errorField === "description"}
                  />
                  {form.description.length >= PROJECT_DESCRIPTION_MAX_LENGTH && (
                    <p className="mt-1 text-xs text-[#b45309]">{t("charLimit", { max: PROJECT_DESCRIPTION_MAX_LENGTH })}</p>
                  )}
                  {pareceAnuncioDeServicio(form.description) && (
                    <div role="status" className="mt-2.5 flex flex-col gap-2 rounded-xl border border-[#fde68a] bg-[#fffbeb] px-3.5 py-3 text-[13px] leading-relaxed text-[#92400e]">
                      <p className="font-medium">{t("avisoAnuncio")}</p>
                      <Link
                        href={yaEsProfesional ? "/ofertas/publicar" : "/registro/profesional"}
                        className="inline-flex h-9 w-fit items-center rounded-full bg-[#b45309] px-3.5 text-[13px] font-bold text-white transition-colors hover:bg-[#92400e]"
                      >
                        {yaEsProfesional ? t("avisoAnuncioCta") : t("avisoAnuncioCtaNew")}
                      </Link>
                    </div>
                  )}
                </div>

                <div>
                  <label className={fieldLabel}>
                    {t("zone")} <span className="font-normal text-[#68778d]">{t("optional")}</span>
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <SelectMenu
                      value={form.provinciaId}
                      onChange={(v) => update("provinciaId", v)}
                      options={[{ value: "", label: t("allF") }, ...PROVINCES.map((p) => ({ value: p.id, label: p.name }))]}
                    />
                    <SelectMenu
                      value={form.cantonId}
                      onChange={(v) => update("cantonId", v)}
                      disabled={!form.provinciaId}
                      options={[{ value: "", label: t("allM") }, ...cantons.map((c) => ({ value: c.id, label: c.name }))]}
                    />
                  </div>
                  <p className="mt-1.5 text-xs text-[#68778d]">{t("zoneHelp")}</p>
                </div>

                {/* Publicar un proyecto ES pedir que lo contacten: preguntarlo
                    con una casilla era hacer elegir algo que ya se eligió. Se
                    dice llano, y si la cuenta no tiene teléfono se pide aquí,
                    porque sin número no hay por dónde responder. */}
                {/* El WhatsApp SIEMPRE a la vista, con el de la cuenta puesto y
                    editable: escondido, la persona no sabía a cuál número le
                    iban a escribir, y cambiarlo para un proyecto puntual era
                    imposible sin ir al perfil. */}
                {/* Editando no se pregunta: el proyecto ya salió con su número
                    y cambiarlo aquí sería cambiar a dónde escriben quienes ya
                    lo vieron. Para eso está el perfil. */}
                {!editar && <div>
                  <PhoneInput
                    label={t("phoneLabel")}
                    value={telefono}
                    onChange={setTelefono}
                    error={errorField === "phone" ? (error ?? undefined) : undefined}
                    required
                  />
                  <p className="mt-1.5 text-xs text-[#68778d]">{t("phoneHelp")}</p>
                </div>}
              </div>
            </div>
          )}

          {error && !published && errorField !== "category" && (
            <div className="shrink-0 border-t border-[#eef2f6] bg-white px-5 pt-3 sm:px-6">
              <div role="alert" aria-live="assertive" data-testid="project-form-error" className="flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm font-semibold leading-5 text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <span>{error}</span>
              </div>
            </div>
          )}

          {/* La MISMA franja que el resto del app: la medida vive en
              BARRA_ACCION_BASE, no escrita otra vez aquí. Esta pantalla es la
              referencia, así que si cambia, cambian todas juntas. */}
          <div className={cn(BARRA_ACCION_BASE, "flex shrink-0 gap-3 sm:justify-end sm:px-6 sm:pb-4", error && !published && "ccr-sin-linea border-t-0")}>
            {!published && (
              <Button type="button" variant="outline" size="lg" onClick={onClose} className="hidden sm:inline-flex sm:px-6">
                {t("cancel")}
              </Button>
            )}
            {/* Publicada la solicitud, el paso útil es ver dónde va a llegar la
                respuesta: el botón principal lleva a Mis proyectos y "Listo"
                pasa a ser la salida secundaria. Antes la única salida era
                cerrar, y el proyecto recién creado quedaba sin rastro. */}
            {published ? (
              // En el teléfono no caben lado a lado sin partir el rótulo en dos
              // renglones: se apilan con el principal arriba.
              <div className="flex w-full flex-col-reverse gap-3 sm:flex-row sm:justify-end">
                {/* Alto y ancho explícitos: con `flex-1` dentro de una columna el
                    alto se colapsaba al del texto, y como uno es botón y el otro
                    enlace, salían de tamaños distintos. */}
                <Button type="button" variant="outline" size="lg" onClick={onClose} className="h-12 w-full sm:w-auto sm:px-6">
                  {t("close")}
                </Button>
                <Button asChild size="lg" className="h-12 w-full sm:w-auto sm:px-8">
                  <Link href="/dashboard/profesional?tab=sent_projects" onClick={onClose}>
                    <span className="truncate">{t("successGoToProjects")}</span>
                  </Link>
                </Button>
              </div>
            ) : (
              // En computadora, a su tamaño y a la derecha, como Publicar empleo
              // y Publicar promoción; en el teléfono, a todo el ancho.
              <Button type="submit" size="lg" className="flex-1 sm:flex-none sm:px-8" loading={submitting} disabled={submitting}>
                {editar
                  ? (submitting ? t("editSaving") : t("editSave"))
                  : (submitting ? t("publishing") : t("publish"))}
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
