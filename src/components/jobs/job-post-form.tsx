"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Plus, Trash2 } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { createClient } from "@/lib/supabase/client";
import { COMMON_JOB_TITLES, EMPLOYMENT_TYPES, EXPERIENCE_LEVELS, SALARY_PERIODS, WORKPLACE_TYPES, type JobPost } from "@/lib/jobs";
import { SelectMenu } from "@/components/ui/select-menu";
import { FutureDatePicker } from "@/components/ui/future-date-picker";
import { PROVINCES, getCantonById, getCantonsByProvince, getProvinceById } from "@/lib/data/cr-geography";

type FieldErrors = Partial<Record<"title" | "location" | "description" | "responsibilities" | "requirements" | "salary" | "deadline", string>>;

const TODAY = new Date().toISOString().slice(0, 10);
const FIELD_CLASS = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]";
const TEXTAREA_CLASS = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#009fd9]";

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <>{children} <span className="text-red-500">*</span></>;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-xs font-medium text-red-600">{children}</p> : null;
}

function JobTitleInput({ defaultValue, error }: { defaultValue?: string; error?: string }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const suggestion = useMemo(() => {
    const query = value.trim().toLocaleLowerCase("es-CR");
    if (query.length < 2) return "";
    const match = COMMON_JOB_TITLES.find((title) => title.toLocaleLowerCase("es-CR").startsWith(query));
    if (!match || match.toLocaleLowerCase("es-CR") === query) return "";
    return match;
  }, [value]);
  const completion = suggestion ? suggestion.slice(value.length) : "";

  function acceptSuggestion() {
    if (!suggestion) return;
    setValue(suggestion);
  }

  return (
    <label className="text-sm font-semibold sm:col-span-2">
      <RequiredLabel>Puesto</RequiredLabel>
      <div className="relative mt-1.5">
        {completion && (
          <div aria-hidden className="pointer-events-none absolute inset-0 flex h-11 items-center overflow-hidden rounded-xl border border-transparent px-3 text-sm text-[#a8b4c4]">
            <span className="invisible whitespace-pre">{value}</span>
            <span className="whitespace-pre">{completion}</span>
          </div>
        )}
        <input
          name="title"
          value={value}
          onChange={(event) => setValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Tab" && suggestion) {
              event.preventDefault();
              acceptSuggestion();
            }
          }}
          maxLength={120}
          autoComplete="organization-title"
          placeholder="Ej. Asistente contable"
          className={FIELD_CLASS.replace("mt-1.5 ", "")}
        />
      </div>
      <FieldError>{error}</FieldError>
    </label>
  );
}

function EditableList({
  title,
  optional = false,
  values,
  onChange,
  placeholder,
  addLabel,
  error,
}: {
  title: string;
  optional?: boolean;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  error?: string;
}) {
  function update(index: number, value: string) {
    onChange(values.map((item, itemIndex) => itemIndex === index ? value : item));
  }

  function remove(index: number) {
    const next = values.filter((_, itemIndex) => itemIndex !== index);
    onChange(next.length || optional ? next : [""]);
  }

  return (
    <div className="sm:col-span-2">
      <p className="text-sm font-semibold">
        {title} {optional ? <span className="font-normal text-[#9ca3af]">(opcional)</span> : <span className="text-red-500">*</span>}
      </p>
      <div className="mt-2 space-y-2">
        {values.map((value, index) => (
          <div key={index} className="flex items-center gap-2">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#eef7fb] text-xs font-extrabold text-[#008fc3]">
              {index + 1}
            </span>
            <input
              value={value}
              onChange={(event) => update(index, event.target.value)}
              maxLength={180}
              placeholder={placeholder}
              aria-label={`${title} ${index + 1}`}
              className="h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]"
            />
            <button type="button" onClick={() => remove(index)} aria-label={`Quitar ${title.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#64748b] transition-colors hover:bg-red-50 hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button type="button" onClick={() => onChange([...values, ""])} className="mt-2 inline-flex h-10 items-center gap-2 rounded-xl px-2 text-sm font-bold text-[#008fc3] hover:bg-[#f2fbfe]">
        <Plus className="h-4 w-4" /> {addLabel}
      </button>
      <FieldError>{error}</FieldError>
    </div>
  );
}

type JobPostFormInitial = Partial<Pick<JobPost, "id" | "title" | "description" | "responsibilities" | "requirements" | "benefits" | "duration_label" | "employment_type" | "experience_level" | "workplace_type" | "location_label" | "salary_min" | "salary_max" | "salary_period" | "currency" | "show_salary" | "openings" | "application_deadline" | "status">>;

export function JobPostForm({ professionalId, backHref = "/empleos", initialJob = null, presentation = "page", onSaved }: { professionalId: string; backHref?: string; initialJob?: JobPostFormInitial | null; presentation?: "page" | "modal"; onSaved?: (id: string) => void }) {
  const editing = Boolean(initialJob?.id);
  const router = useRouter();
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [workplaceType, setWorkplaceType] = useState<string>(initialJob?.workplace_type ?? "onsite");
  const [locationProvince, setLocationProvince] = useState("");
  const [locationCanton, setLocationCanton] = useState("");
  const [employmentType, setEmploymentType] = useState<string>(initialJob?.employment_type ?? "full_time");
  const [experienceLevel, setExperienceLevel] = useState<string>(initialJob?.experience_level ?? "any");
  const [currency, setCurrency] = useState<string>(initialJob?.currency ?? "CRC");
  const [salaryPeriod, setSalaryPeriod] = useState<string>(initialJob?.salary_period ?? "monthly");
  const [deadline, setDeadline] = useState(initialJob?.application_deadline ?? "");
  const [responsibilities, setResponsibilities] = useState<string[]>(Array.isArray(initialJob?.responsibilities) && initialJob.responsibilities.length ? initialJob.responsibilities : [""]);
  const [requirements, setRequirements] = useState<string[]>(Array.isArray(initialJob?.requirements) && initialJob.requirements.length ? initialJob.requirements : [""]);
  const [benefits, setBenefits] = useState<string[]>(Array.isArray(initialJob?.benefits) ? initialJob.benefits : []);
  const [showSalary, setShowSalary] = useState(initialJob?.show_salary ?? true);
  const locationCantons = getCantonsByProvince(locationProvince);
  const showsDurationField = employmentType === "contract" || employmentType === "temporary" || employmentType === "internship";

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const title = String(form.get("title") || "").trim();
    const description = String(form.get("description") || "").trim();
    const durationLabel = String(form.get("duration_label") || "").trim().slice(0, 80);
    const selectedLocationProvince = getProvinceById(locationProvince);
    const selectedLocationCanton = getCantonById(locationCanton);
    const location = selectedLocationProvince && selectedLocationCanton ? `${selectedLocationCanton.name}, ${selectedLocationProvince.name}` : "";
    const cleanResponsibilities = responsibilities.map((item) => item.trim()).filter(Boolean);
    const cleanRequirements = requirements.map((item) => item.trim()).filter(Boolean);
    const cleanBenefits = benefits.map((item) => item.trim()).filter(Boolean);
    const salaryMinRaw = String(form.get("salary_min") || "").replace(/\D/gu, "");
    const salaryMaxRaw = String(form.get("salary_max") || "").replace(/\D/gu, "");
    const salaryMin = salaryMinRaw ? Number(salaryMinRaw) : null;
    const salaryMax = salaryMaxRaw ? Number(salaryMaxRaw) : null;
    const nextErrors: FieldErrors = {};
    if (title.length < 3) nextErrors.title = "Escribe un puesto de al menos 3 caracteres.";
    if (workplaceType !== "remote" && !location) nextErrors.location = "Indica dónde se encuentra el empleo.";
    if (description.length < 30) nextErrors.description = "Describe el empleo con al menos 30 caracteres.";
    if (!cleanResponsibilities.length) nextErrors.responsibilities = "Agrega al menos una responsabilidad.";
    if (!cleanRequirements.length) nextErrors.requirements = "Agrega al menos un requisito.";
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) nextErrors.salary = "El salario máximo debe ser mayor o igual al mínimo.";
    if (deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < TODAY) nextErrors.deadline = "La fecha límite no puede estar en el pasado.";
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError("Revisa los campos marcados antes de publicar.");
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      employer_id: professionalId,
      service_category_id: null,
      title,
      description,
      responsibilities: cleanResponsibilities,
      requirements: cleanRequirements,
      benefits: cleanBenefits,
      duration_label: showsDurationField && durationLabel ? durationLabel : null,
      employment_type: employmentType,
      experience_level: experienceLevel,
      workplace_type: workplaceType,
      location_label: workplaceType === "remote" ? null : location,
      salary_min: salaryMin,
      salary_max: salaryMax,
      salary_period: salaryPeriod,
      currency,
      show_salary: Boolean(showSalary && (salaryMin != null || salaryMax != null)),
      openings: Math.max(1, Number(form.get("openings") || 1)),
      application_deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      status: editing ? (initialJob?.status ?? "published") : "published",
    };
    const request = editing && initialJob?.id
      ? createClient().from("job_posts").update(payload).eq("id", initialJob.id).eq("employer_id", professionalId).select("id").single()
      : createClient().from("job_posts").insert(payload).select("id").single();
    const { data, error: insertError } = await request;
    if (insertError) {
      setError(insertError.message.includes("schema cache")
        ? "La base de datos de empleos necesita actualizarse con la última migración. Inténtalo nuevamente después de recargar el schema."
        : `No pudimos publicar el empleo: ${insertError.message}`);
      setSaving(false);
      return;
    }
    if (presentation === "modal") {
      onSaved?.(data.id);
      setSaving(false);
      return;
    }
    const returnToPanel = backHref.includes("/dashboard/profesional");
    router.replace(`/empleos/${data.id}${returnToPanel ? "?from=panel" : ""}`);
    router.refresh();
  }

  return (
    <main className={presentation === "modal" ? "bg-white text-[#162543]" : "min-h-[calc(100vh-72px)] bg-white text-[#162543] lg:bg-[#f4f7fa] lg:px-6 lg:py-10"}>
      <header className={presentation === "modal" ? "hidden" : "sticky top-0 z-20 border-b border-[#dfe8f0] bg-white lg:hidden"}>
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href={backHref} aria-label="Volver" className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543]"><ArrowLeft className="h-6 w-6 stroke-[2.4]" /></Link>
          <h1 className="truncate text-center text-[17px] font-extrabold">{editing ? "Editar empleo" : "Publicar empleo"}</h1>
        </div>
      </header>
      <div className={presentation === "modal" ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-0 lg:py-0"}>
        <div className={presentation === "modal" ? "hidden" : "mb-4 hidden items-center gap-3 lg:flex"}>
          <Link href={backHref} aria-label="Volver a empleos" className="grid h-10 w-10 place-items-center rounded-lg text-[#162543] hover:bg-white"><ArrowLeft className="h-5 w-5" /></Link>
          <div><h1 className="text-2xl font-bold">{editing ? "Editar empleo" : "Publicar empleo"}</h1><p className="text-sm text-[#65758c]">Describe la oportunidad con información clara y verificable.</p></div>
        </div>
        <form onSubmit={submit} noValidate className={presentation === "modal" ? "bg-white" : "rounded-lg border border-[#dfe8f0] bg-white p-5 sm:p-7"}>
          <div className="mb-6 flex items-center gap-3 border-b border-[#e6edf3] pb-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#eaf7fc] text-[#009fd9]"><BriefcaseBusiness className="h-5 w-5" /></span><h2 className="font-bold">Información del puesto</h2></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <JobTitleInput defaultValue={initialJob?.title ?? ""} error={fieldErrors.title} />
            <SelectMenu label={<RequiredLabel>Tipo de empleo</RequiredLabel>} value={employmentType} onChange={setEmploymentType} options={Object.entries(EMPLOYMENT_TYPES).map(([value, label]) => ({ value, label }))} />
            <SelectMenu label={<RequiredLabel>Modalidad</RequiredLabel>} value={workplaceType} onChange={setWorkplaceType} options={Object.entries(WORKPLACE_TYPES).map(([value, label]) => ({ value, label }))} />
            <SelectMenu label={<RequiredLabel>Experiencia mínima</RequiredLabel>} value={experienceLevel} onChange={setExperienceLevel} options={Object.entries(EXPERIENCE_LEVELS).map(([value, label]) => ({ value, label }))} />
            {showsDurationField && (
              <label className="text-sm font-semibold sm:col-span-2">
                Duración estimada <span className="font-normal text-[#9ca3af]">(opcional)</span>
                <input name="duration_label" maxLength={80} defaultValue={initialJob?.duration_label ?? ""} placeholder="Ej. 3 meses, por proyecto o temporada alta" className={FIELD_CLASS} />
              </label>
            )}
            {workplaceType !== "remote" && (
              <div className="sm:col-span-2">
                <span className="text-sm font-semibold"><RequiredLabel>Ubicación</RequiredLabel></span>
                <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
                  <SelectMenu
                    value={locationProvince}
                    onChange={(value) => { setLocationProvince(value); setLocationCanton(""); }}
                    placeholder="Provincia"
                    options={PROVINCES.map((province) => ({ value: province.id, label: province.name }))}
                  />
                  <SelectMenu
                    value={locationCanton}
                    onChange={setLocationCanton}
                    disabled={!locationProvince}
                    placeholder="Cantón"
                    options={locationCantons.map((canton) => ({ value: canton.id, label: canton.name }))}
                  />
                </div>
                <FieldError>{fieldErrors.location}</FieldError>
              </div>
            )}
            <label className="text-sm font-semibold sm:col-span-2"><RequiredLabel>Descripción</RequiredLabel><textarea name="description" maxLength={5000} defaultValue={initialJob?.description ?? ""} placeholder="Explica el puesto, el equipo y qué hará la persona." className={TEXTAREA_CLASS} /><FieldError>{fieldErrors.description}</FieldError></label>
            <EditableList title="Responsabilidades" values={responsibilities} onChange={setResponsibilities} placeholder="Ej. Preparar reportes mensuales" addLabel="Agregar responsabilidad" error={fieldErrors.responsibilities} />
            <EditableList title="Requisitos" values={requirements} onChange={setRequirements} placeholder="Ej. Manejo intermedio de Excel" addLabel="Agregar requisito" error={fieldErrors.requirements} />
            <EditableList title="Beneficios" optional values={benefits} onChange={setBenefits} placeholder="Ej. Horario flexible" addLabel="Agregar beneficio" />
          </div>

          <div className="my-6 border-t border-[#e6edf3] pt-6"><h2 className="font-bold">Salario y vigencia</h2><p className="mt-1 text-xs text-[#68778d]">Esta información es opcional.</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">Salario desde <span className="font-normal text-[#9ca3af]">(opcional)</span><input name="salary_min" inputMode="numeric" defaultValue={initialJob?.salary_min ?? ""} placeholder="450000" className={FIELD_CLASS} /></label>
            <label className="text-sm font-semibold">Salario hasta <span className="font-normal text-[#9ca3af]">(opcional)</span><input name="salary_max" inputMode="numeric" defaultValue={initialJob?.salary_max ?? ""} placeholder="650000" className={FIELD_CLASS} /><FieldError>{fieldErrors.salary}</FieldError></label>
            <SelectMenu label="Moneda" value={currency} onChange={setCurrency} options={[{ value: "CRC", label: "Colones (CRC)" }, { value: "USD", label: "Dólares (USD)" }]} />
            <SelectMenu label="Periodo salarial" value={salaryPeriod} onChange={setSalaryPeriod} options={Object.entries(SALARY_PERIODS).map(([value, label]) => ({ value, label }))} />
            <label className="text-sm font-semibold">Vacantes <span className="font-normal text-[#9ca3af]">(opcional)</span><input name="openings" type="number" min={1} max={100} defaultValue={initialJob?.openings ?? 1} className={FIELD_CLASS} /></label>
            <div className="text-sm font-semibold">
              Fecha límite de postulaciones <span className="font-normal text-[#9ca3af]">(opcional)</span>
              <div className="mt-1.5"><FutureDatePicker value={deadline} onChange={setDeadline} /></div>
              <p className="mt-1.5 text-xs font-normal text-[#68778d]">Después de esta fecha ya no se recibirán postulaciones.</p>
              <FieldError>{fieldErrors.deadline}</FieldError>
            </div>
          </div>
          <label className="mt-5 flex cursor-pointer items-center gap-3 text-sm font-semibold text-[#111827]">
            <input
              type="checkbox"
              checked={showSalary}
              onChange={(event) => setShowSalary(event.target.checked)}
              className="h-5 w-5 rounded-[4px] border-[#b8c5d3] bg-white text-[#009FD9] focus:ring-[#009FD9]"
            />
            <span>Mostrar el salario en la publicación</span>
          </label>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={saving} className="mt-7 h-12 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white hover:bg-[#008fc3] disabled:opacity-60">{saving ? (editing ? "Guardando..." : "Publicando...") : (editing ? "Guardar cambios" : "Publicar empleo")}</button>
        </form>
      </div>
    </main>
  );
}

