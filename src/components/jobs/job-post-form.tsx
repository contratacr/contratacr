"use client";

import { useMemo, useState } from "react";
import { ArrowLeft, BriefcaseBusiness, Plus, Trash2 } from "lucide-react";
import { useLocale } from "next-intl";
import { Link, useRouter } from "@/i18n/navigation";
import {
  COMMON_JOB_TITLES,
  EMPLOYMENT_TYPES,
  EXPERIENCE_LEVELS,
  SALARY_PERIODS,
  WORKPLACE_TYPES,
  type EmploymentType,
  type ExperienceLevel,
  type JobPost,
  type SalaryPeriod,
  type WorkplaceType,
} from "@/lib/jobs";
import { SelectMenu } from "@/components/ui/select-menu";
import { FutureDatePicker } from "@/components/ui/future-date-picker";
import { ToggleSwitch } from "@/components/ui/toggle-switch";
import { PROVINCES, getCantonById, getCantonsByProvince, getProvinceById } from "@/lib/data/cr-geography";
import { MAX_MONEY_AMOUNT, formatNumberForMessage, isWholeNumberInRange, parseOptionalWholeNumber } from "@/lib/forms/numeric-validation";
import { employmentTypeLabel, experienceLevelLabel, marketplaceLocale, salaryPeriodLabel, workplaceTypeLabel } from "@/lib/marketplace-copy";
import { invalidateAppData } from "@/lib/app-data-invalidation";

type FieldErrors = Partial<Record<"title" | "location" | "description" | "responsibilities" | "requirements" | "salary" | "openings" | "deadline", string>>;

const TODAY = new Date().toISOString().slice(0, 10);
const FIELD_CLASS = "mt-1.5 h-11 w-full rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm outline-none transition-colors focus:border-[#009fd9]";
const TEXTAREA_CLASS = "mt-1.5 min-h-28 w-full resize-y rounded-xl border border-[#d7e1ea] bg-white px-3 py-2.5 text-sm outline-none transition-colors focus:border-[#009fd9]";

const JOB_POST_COPY = {
  es: {
    optional: "opcional",
    position: "Puesto",
    positionPlaceholder: "Ej. Asistente contable",
    remove: "Quitar",
    titleShort: "Escribe un puesto de al menos 3 caracteres.",
    locationRequired: "Indica dónde se encuentra el empleo.",
    descriptionShort: "Describe el empleo con al menos 30 caracteres.",
    responsibilityRequired: "Agrega al menos una responsabilidad.",
    requirementRequired: "Agrega al menos un requisito.",
    salaryOrder: "El salario máximo debe ser mayor o igual al mínimo.",
    deadlinePast: "La fecha límite no puede estar en el pasado.",
    salaryRange: (maximum: string) => `Ingresa un salario entre 0 y ${maximum}.`,
    openingsRange: "Ingresa entre 1 y 100 vacantes.",
    reviewFields: "Revisa los campos marcados antes de publicar.",
    schemaCache: "La base de datos de empleos necesita actualizarse con la última migración. Inténtalo nuevamente después de recargar el esquema.",
    numericTooHigh: "Uno de los montos o cantidades es demasiado alto. Revisa el salario y las vacantes.",
    saveFailed: "No pudimos guardar el empleo. Revisa la información e inténtalo nuevamente.",
    back: "Volver",
    backToJobs: "Volver a empleos",
    editJob: "Editar empleo",
    publishJob: "Publicar empleo",
    subtitle: "Describe la oportunidad con información clara y verificable.",
    jobInformation: "Información del puesto",
    employmentType: "Tipo de empleo",
    workplaceType: "Modalidad",
    experience: "Experiencia mínima",
    duration: "Duración estimada",
    durationPlaceholder: "Ej. 3 meses, por proyecto o temporada alta",
    location: "Ubicación",
    province: "Provincia",
    canton: "Cantón",
    description: "Descripción",
    descriptionPlaceholder: "Explica el puesto, el equipo y qué hará la persona.",
    responsibilities: "Responsabilidades",
    responsibilityPlaceholder: "Ej. Preparar reportes mensuales",
    addResponsibility: "Agregar responsabilidad",
    requirements: "Requisitos",
    requirementPlaceholder: "Ej. Manejo intermedio de Excel",
    addRequirement: "Agregar requisito",
    benefits: "Beneficios",
    benefitPlaceholder: "Ej. Horario flexible",
    addBenefit: "Agregar beneficio",
    salaryAndValidity: "Salario y vigencia",
    optionalInformation: "Esta información es opcional.",
    salaryFrom: "Salario desde",
    salaryTo: "Salario hasta",
    currency: "Moneda",
    colones: "Colones (CRC)",
    dollars: "Dólares (USD)",
    salaryPeriod: "Periodo salarial",
    openings: "Vacantes",
    deadline: "Fecha límite de postulaciones",
    deadlineHelp: "Después de esta fecha ya no se recibirán postulaciones.",
    showSalary: "Mostrar el salario en la publicación",
    saving: "Guardando...",
    publishing: "Publicando...",
    saveChanges: "Guardar cambios",
  },
  en: {
    optional: "optional",
    position: "Job title",
    positionPlaceholder: "E.g. Accounting assistant",
    remove: "Remove",
    titleShort: "Enter a job title with at least 3 characters.",
    locationRequired: "Specify where the job is located.",
    descriptionShort: "Describe the job using at least 30 characters.",
    responsibilityRequired: "Add at least one responsibility.",
    requirementRequired: "Add at least one requirement.",
    salaryOrder: "The maximum salary must be greater than or equal to the minimum.",
    deadlinePast: "The application deadline cannot be in the past.",
    salaryRange: (maximum: string) => `Enter a salary between 0 and ${maximum}.`,
    openingsRange: "Enter between 1 and 100 openings.",
    reviewFields: "Review the highlighted fields before publishing.",
    schemaCache: "The jobs database needs the latest migration. Try again after the schema is reloaded.",
    numericTooHigh: "One of the amounts is too high. Review the salary and number of openings.",
    saveFailed: "We couldn't save the job. Review the information and try again.",
    back: "Back",
    backToJobs: "Back to jobs",
    editJob: "Edit job",
    publishJob: "Post a job",
    subtitle: "Describe the opportunity with clear, verifiable information.",
    jobInformation: "Job information",
    employmentType: "Employment type",
    workplaceType: "Workplace type",
    experience: "Minimum experience",
    duration: "Estimated duration",
    durationPlaceholder: "E.g. 3 months, a project, or peak season",
    location: "Location",
    province: "Province",
    canton: "Canton",
    description: "Description",
    descriptionPlaceholder: "Explain the role, the team, and what the person will do.",
    responsibilities: "Responsibilities",
    responsibilityPlaceholder: "E.g. Prepare monthly reports",
    addResponsibility: "Add responsibility",
    requirements: "Requirements",
    requirementPlaceholder: "E.g. Intermediate Excel skills",
    addRequirement: "Add requirement",
    benefits: "Benefits",
    benefitPlaceholder: "E.g. Flexible schedule",
    addBenefit: "Add benefit",
    salaryAndValidity: "Salary and availability",
    optionalInformation: "This information is optional.",
    salaryFrom: "Salary from",
    salaryTo: "Salary to",
    currency: "Currency",
    colones: "Costa Rican colones (CRC)",
    dollars: "US dollars (USD)",
    salaryPeriod: "Salary period",
    openings: "Openings",
    deadline: "Application deadline",
    deadlineHelp: "Applications will no longer be accepted after this date.",
    showSalary: "Show salary in the job post",
    saving: "Saving...",
    publishing: "Publishing...",
    saveChanges: "Save changes",
  },
} as const;

type JobPostCopy = (typeof JOB_POST_COPY)[keyof typeof JOB_POST_COPY];

function initialLocation(locationLabel?: string | null) {
  if (!locationLabel) return { province: "", canton: "" };
  const normalized = locationLabel.toLocaleLowerCase("es-CR");
  const province = PROVINCES.find((item) => normalized.includes(item.name.toLocaleLowerCase("es-CR")));
  if (!province) return { province: "", canton: "" };
  const canton = getCantonsByProvince(province.id).find((item) => normalized.includes(item.name.toLocaleLowerCase("es-CR")));
  return { province: province.id, canton: canton?.id ?? "" };
}

function RequiredLabel({ children }: { children: React.ReactNode }) {
  return <>{children} <span className="text-red-500">*</span></>;
}

function FieldError({ children }: { children?: string }) {
  return children ? <p className="mt-1.5 text-xs font-medium text-red-600">{children}</p> : null;
}

function JobTitleInput({ defaultValue, error, locale, copy }: { defaultValue?: string; error?: string; locale: "es" | "en"; copy: JobPostCopy }) {
  const [value, setValue] = useState(defaultValue ?? "");
  const suggestion = useMemo(() => {
    if (locale === "en") return "";
    const query = value.trim().toLocaleLowerCase("es-CR");
    if (query.length < 2) return "";
    const match = COMMON_JOB_TITLES.find((title) => title.toLocaleLowerCase("es-CR").startsWith(query));
    if (!match || match.toLocaleLowerCase("es-CR") === query) return "";
    return match;
  }, [locale, value]);
  const completion = suggestion ? suggestion.slice(value.length) : "";

  function acceptSuggestion() {
    if (!suggestion) return;
    setValue(suggestion);
  }

  return (
    <label className="text-sm font-semibold sm:col-span-2">
      <RequiredLabel>{copy.position}</RequiredLabel>
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
          placeholder={copy.positionPlaceholder}
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
  optionalLabel,
  removeLabel,
  error,
}: {
  title: string;
  optional?: boolean;
  values: string[];
  onChange: (values: string[]) => void;
  placeholder: string;
  addLabel: string;
  optionalLabel: string;
  removeLabel: string;
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
        {title} {optional ? <span className="font-normal text-[#9ca3af]">({optionalLabel})</span> : <span className="text-red-500">*</span>}
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
            <button type="button" onClick={() => remove(index)} aria-label={`${removeLabel} ${title.toLowerCase()}`} className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-[#64748b] transition-colors hover:bg-red-50 hover:text-red-600">
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
  const locale = marketplaceLocale(useLocale());
  const copy = JOB_POST_COPY[locale];
  const savedLocation = initialLocation(initialJob?.location_label);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [workplaceType, setWorkplaceType] = useState<string>(initialJob?.workplace_type ?? "onsite");
  const [locationProvince, setLocationProvince] = useState(savedLocation.province);
  const [locationCanton, setLocationCanton] = useState(savedLocation.canton);
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
    const salaryMin = parseOptionalWholeNumber(form.get("salary_min"));
    const salaryMax = parseOptionalWholeNumber(form.get("salary_max"));
    const openings = Number(form.get("openings") || 1);
    const nextErrors: FieldErrors = {};
    if (title.length < 3) nextErrors.title = copy.titleShort;
    if (workplaceType !== "remote" && !location) nextErrors.location = copy.locationRequired;
    if (description.length < 30) nextErrors.description = copy.descriptionShort;
    if (!cleanResponsibilities.length) nextErrors.responsibilities = copy.responsibilityRequired;
    if (!cleanRequirements.length) nextErrors.requirements = copy.requirementRequired;
    if (salaryMin != null && salaryMax != null && salaryMax < salaryMin) nextErrors.salary = copy.salaryOrder;
    if (deadline && /^\d{4}-\d{2}-\d{2}$/.test(deadline) && deadline < TODAY) nextErrors.deadline = copy.deadlinePast;
    if (!isWholeNumberInRange(salaryMin, 0, MAX_MONEY_AMOUNT) || !isWholeNumberInRange(salaryMax, 0, MAX_MONEY_AMOUNT)) nextErrors.salary = copy.salaryRange(formatNumberForMessage(MAX_MONEY_AMOUNT));
    if (!Number.isInteger(openings) || openings < 1 || openings > 100) nextErrors.openings = copy.openingsRange;
    setFieldErrors(nextErrors);
    if (Object.keys(nextErrors).length) {
      setError(copy.reviewFields);
      return;
    }

    setSaving(true);
    setError("");
    const payload = {
      id: editing ? initialJob?.id : null,
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
      openings,
      application_deadline: /^\d{4}-\d{2}-\d{2}$/.test(deadline) ? deadline : null,
      status: editing ? (initialJob?.status ?? "published") : "published",
    };
    try {
      const response = await fetch("/api/jobs/posts", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data?.id) throw new Error(typeof data?.error === "string" ? data.error : copy.saveFailed);
      invalidateAppData("jobs");
      if (presentation === "modal") {
        onSaved?.(data.id);
        setSaving(false);
        return;
      }
      const returnToPanel = backHref.includes("/dashboard/profesional");
      router.replace(`/empleos/${data.id}${returnToPanel ? "?from=panel" : ""}`);
      router.refresh();
    } catch (submitError) {
      const message = submitError instanceof Error ? submitError.message : "";
      setError(message.startsWith("No pudimos") || message.startsWith("We couldn't") ? message : copy.saveFailed);
      setSaving(false);
    }
  }

  return (
    <main className={presentation === "modal" ? "bg-white text-[#162543]" : "min-h-[calc(100vh-72px)] bg-white text-[#162543] lg:bg-[#f4f7fa] lg:px-6 lg:py-10"}>
      <header className={presentation === "modal" ? "hidden" : "sticky top-0 z-20 border-b border-[#dfe8f0] bg-white lg:hidden"}>
        <div className="relative flex min-h-[56px] items-center justify-center px-14">
          <Link href={backHref} aria-label={copy.back} className="absolute left-3 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center text-[#162543]"><ArrowLeft className="h-6 w-6 stroke-[2.4]" /></Link>
          <h1 className="truncate text-center text-[17px] font-extrabold">{editing ? copy.editJob : copy.publishJob}</h1>
        </div>
      </header>
      <div className={presentation === "modal" ? "mx-auto max-w-3xl" : "mx-auto max-w-3xl px-4 py-5 sm:px-6 lg:px-0 lg:py-0"}>
        <div className={presentation === "modal" ? "hidden" : "mb-4 hidden items-center gap-3 lg:flex"}>
          <Link href={backHref} aria-label={copy.backToJobs} className="grid h-10 w-10 place-items-center rounded-lg text-[#162543] hover:bg-white"><ArrowLeft className="h-5 w-5" /></Link>
          <div><h1 className="text-2xl font-bold">{editing ? copy.editJob : copy.publishJob}</h1><p className="text-sm text-[#65758c]">{copy.subtitle}</p></div>
        </div>
        <form onSubmit={submit} noValidate className={presentation === "modal" ? "bg-white" : "rounded-lg border border-[#dfe8f0] bg-white p-5 sm:p-7"}>
          <div className="mb-6 flex items-center gap-3 border-b border-[#e6edf3] pb-5"><span className="grid h-10 w-10 place-items-center rounded-lg bg-[#eaf7fc] text-[#009fd9]"><BriefcaseBusiness className="h-5 w-5" /></span><h2 className="font-bold">{copy.jobInformation}</h2></div>
          <div className="grid gap-5 sm:grid-cols-2">
            <JobTitleInput defaultValue={initialJob?.title ?? ""} error={fieldErrors.title} locale={locale} copy={copy} />
            <SelectMenu label={<RequiredLabel>{copy.employmentType}</RequiredLabel>} value={employmentType} onChange={setEmploymentType} options={(Object.keys(EMPLOYMENT_TYPES) as EmploymentType[]).map((value) => ({ value, label: employmentTypeLabel(value, locale) }))} />
            <SelectMenu label={<RequiredLabel>{copy.workplaceType}</RequiredLabel>} value={workplaceType} onChange={setWorkplaceType} options={(Object.keys(WORKPLACE_TYPES) as WorkplaceType[]).map((value) => ({ value, label: workplaceTypeLabel(value, locale) }))} />
            <SelectMenu label={<RequiredLabel>{copy.experience}</RequiredLabel>} value={experienceLevel} onChange={setExperienceLevel} options={(Object.keys(EXPERIENCE_LEVELS) as ExperienceLevel[]).map((value) => ({ value, label: experienceLevelLabel(value, locale) }))} />
            {showsDurationField && (
              <label className="text-sm font-semibold sm:col-span-2">
                {copy.duration} <span className="font-normal text-[#9ca3af]">({copy.optional})</span>
                <input name="duration_label" maxLength={80} defaultValue={initialJob?.duration_label ?? ""} placeholder={copy.durationPlaceholder} className={FIELD_CLASS} />
              </label>
            )}
            {workplaceType !== "remote" && (
              <div className="sm:col-span-2">
                <span className="text-sm font-semibold"><RequiredLabel>{copy.location}</RequiredLabel></span>
                <div className="mt-1.5 grid gap-3 sm:grid-cols-2">
                  <SelectMenu
                    value={locationProvince}
                    onChange={(value) => { setLocationProvince(value); setLocationCanton(""); }}
                    placeholder={copy.province}
                    options={PROVINCES.map((province) => ({ value: province.id, label: province.name }))}
                  />
                  <SelectMenu
                    value={locationCanton}
                    onChange={setLocationCanton}
                    disabled={!locationProvince}
                    placeholder={copy.canton}
                    options={locationCantons.map((canton) => ({ value: canton.id, label: canton.name }))}
                  />
                </div>
                <FieldError>{fieldErrors.location}</FieldError>
              </div>
            )}
            <label className="text-sm font-semibold sm:col-span-2"><RequiredLabel>{copy.description}</RequiredLabel><textarea name="description" maxLength={5000} defaultValue={initialJob?.description ?? ""} placeholder={copy.descriptionPlaceholder} className={TEXTAREA_CLASS} /><FieldError>{fieldErrors.description}</FieldError></label>
            <EditableList title={copy.responsibilities} values={responsibilities} onChange={setResponsibilities} placeholder={copy.responsibilityPlaceholder} addLabel={copy.addResponsibility} optionalLabel={copy.optional} removeLabel={copy.remove} error={fieldErrors.responsibilities} />
            <EditableList title={copy.requirements} values={requirements} onChange={setRequirements} placeholder={copy.requirementPlaceholder} addLabel={copy.addRequirement} optionalLabel={copy.optional} removeLabel={copy.remove} error={fieldErrors.requirements} />
            <EditableList title={copy.benefits} optional values={benefits} onChange={setBenefits} placeholder={copy.benefitPlaceholder} addLabel={copy.addBenefit} optionalLabel={copy.optional} removeLabel={copy.remove} />
          </div>

          <div className="my-6 border-t border-[#e6edf3] pt-6"><h2 className="font-bold">{copy.salaryAndValidity}</h2><p className="mt-1 text-xs text-[#68778d]">{copy.optionalInformation}</p></div>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="text-sm font-semibold">{copy.salaryFrom} <span className="font-normal text-[#9ca3af]">({copy.optional})</span><input name="salary_min" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialJob?.salary_min ?? ""} placeholder="450000" className={FIELD_CLASS} /></label>
            <label className="text-sm font-semibold">{copy.salaryTo} <span className="font-normal text-[#9ca3af]">({copy.optional})</span><input name="salary_max" inputMode="numeric" maxLength={String(MAX_MONEY_AMOUNT).length} defaultValue={initialJob?.salary_max ?? ""} placeholder="650000" className={FIELD_CLASS} /><FieldError>{fieldErrors.salary}</FieldError></label>
            <SelectMenu label={copy.currency} value={currency} onChange={setCurrency} options={[{ value: "CRC", label: copy.colones }, { value: "USD", label: copy.dollars }]} />
            <SelectMenu label={copy.salaryPeriod} value={salaryPeriod} onChange={setSalaryPeriod} options={(Object.keys(SALARY_PERIODS) as SalaryPeriod[]).map((value) => ({ value, label: salaryPeriodLabel(value, locale) }))} />
            <label className="text-sm font-semibold">{copy.openings} <span className="font-normal text-[#9ca3af]">({copy.optional})</span><input name="openings" type="number" min={1} max={100} defaultValue={initialJob?.openings ?? 1} className={FIELD_CLASS} /><FieldError>{fieldErrors.openings}</FieldError></label>
            <div className="text-sm font-semibold">
              {copy.deadline} <span className="font-normal text-[#9ca3af]">({copy.optional})</span>
              <div className="mt-1.5"><FutureDatePicker value={deadline} onChange={setDeadline} /></div>
              <p className="mt-1.5 text-xs font-normal text-[#68778d]">{copy.deadlineHelp}</p>
              <FieldError>{fieldErrors.deadline}</FieldError>
            </div>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={showSalary}
            onClick={() => setShowSalary((current) => !current)}
            className="mt-5 flex w-full items-center justify-between gap-4 py-1 text-left text-sm font-semibold text-[#111827] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#009FD9]/35"
          >
            <span>{copy.showSalary}</span>
            <ToggleSwitch checked={showSalary} />
          </button>
          {error && <p role="alert" className="mt-5 rounded-lg bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">{error}</p>}
          <button disabled={saving} className="mt-7 h-12 w-full rounded-lg bg-[#009fd9] text-sm font-bold text-white hover:bg-[#008fc3] disabled:opacity-60">{saving ? (editing ? copy.saving : copy.publishing) : (editing ? copy.saveChanges : copy.publishJob)}</button>
        </form>
      </div>
    </main>
  );
}
