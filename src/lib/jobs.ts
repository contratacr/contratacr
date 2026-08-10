export const EMPLOYMENT_TYPES = {
  full_time: "Tiempo completo",
  part_time: "Medio tiempo",
  contract: "Por contrato",
  temporary: "Temporal",
  internship: "Pasantía",
} as const;

export const WORKPLACE_TYPES = {
  onsite: "Presencial",
  hybrid: "Híbrido",
  remote: "Remoto",
} as const;

export const EXPERIENCE_LEVELS = {
  any: "Sin experiencia requerida",
  one_plus: "1+ año de experiencia",
  two_plus: "2+ años de experiencia",
  three_plus: "3+ años de experiencia",
  five_plus: "5+ años de experiencia",
} as const;

export const SALARY_PERIODS = {
  hourly: "por hora",
  biweekly: "por quincena",
  monthly: "por mes",
  annual: "por año",
  project: "por proyecto",
} as const;

export type EmploymentType = keyof typeof EMPLOYMENT_TYPES;
export type WorkplaceType = keyof typeof WORKPLACE_TYPES;
export type ExperienceLevel = keyof typeof EXPERIENCE_LEVELS;
export type SalaryPeriod = keyof typeof SALARY_PERIODS;

export const COMMON_JOB_TITLES = [
  "Asistente administrativo",
  "Asistente contable",
  "Auxiliar contable",
  "Contador",
  "Desarrollador web",
  "Diseñador gráfico",
  "Electricista",
  "Ejecutivo de ventas",
  "Jardinero",
  "Mecánico",
  "Plomero",
  "Recepcionista",
  "Técnico de mantenimiento",
] as const;

const JOB_SEARCH_ALIASES: Record<string, string[]> = {
  administracion: ["administrativo", "administrativa", "asistente", "oficina", "recepcionista"],
  contabilidad: ["contador", "contadora", "contable", "auxiliar contable", "asistente contable", "finanzas"],
  desarrollo: ["desarrollador", "desarrolladora", "programador", "programadora", "software", "web"],
  electricidad: ["electricista", "electrico", "electrica", "mantenimiento electrico"],
  mecanica: ["mecanico", "mecanica", "automotriz", "taller"],
  plomeria: ["plomero", "plomera", "fontanero", "fontanera", "tuberias"],
  ventas: ["vendedor", "vendedora", "ejecutivo de ventas", "asesor comercial", "comercial"],
};

export function normalizeJobSearch(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-CR")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function jobMatchesSearch(query: string, values: Array<string | null | undefined>) {
  const normalized = normalizeJobSearch(query);
  if (!normalized) return true;
  const searchable = normalizeJobSearch(values.filter(Boolean).join(" "));
  if (searchable.includes(normalized)) return true;

  return normalized.split(" ").filter((term) => term.length > 1).every((term) => {
    if (searchable.includes(term)) return true;
    return Object.entries(JOB_SEARCH_ALIASES).some(([family, aliases]) => {
      const familyTerms = [family, ...aliases].map(normalizeJobSearch);
      return familyTerms.some((alias) => alias.includes(term) || term.includes(alias))
        && familyTerms.some((alias) => searchable.includes(alias));
    });
  });
}

export type JobPost = {
  id: string;
  employer_id: string;
  service_category_id?: string | null;
  duration_label?: string | null;
  experience_level: ExperienceLevel;
  title: string;
  description: string;
  responsibilities: string[];
  requirements: string[];
  benefits: string[];
  employment_type: EmploymentType;
  workplace_type: WorkplaceType;
  provincia_id: string | null;
  canton_id: string | null;
  location_label: string | null;
  salary_min: number | null;
  salary_max: number | null;
  salary_period: SalaryPeriod;
  currency: "CRC" | "USD";
  show_salary: boolean;
  openings: number;
  application_deadline: string | null;
  status: "draft" | "published" | "paused" | "closed";
  created_at: string;
  employer_name?: string;
  employer_slug?: string | null;
  employer_avatar_url?: string | null;
  application_count?: number;
};

export function formatJobSalary(job: Pick<JobPost, "salary_min" | "salary_max" | "salary_period" | "currency" | "show_salary">, locale = "es") {
  if (!job.show_salary || (job.salary_min == null && job.salary_max == null)) return locale === "en" ? "Salary negotiable" : "Salario a convenir";
  const symbol = job.currency === "USD" ? "$" : "\u20a1";
  const format = (value: number) => `${symbol}${new Intl.NumberFormat(locale === "en" ? "en-US" : "es-CR").format(value)}`;
  const range = job.salary_min != null && job.salary_max != null
    ? `${format(job.salary_min)} - ${format(job.salary_max)}`
    : job.salary_min != null
      ? `${locale === "en" ? "From" : "Desde"} ${format(job.salary_min)}`
      : `${locale === "en" ? "Up to" : "Hasta"} ${format(job.salary_max!)}`;
  const period = locale === "en"
    ? { hourly: "per hour", biweekly: "every two weeks", monthly: "per month", annual: "per year", project: "per project" }[job.salary_period]
    : SALARY_PERIODS[job.salary_period];
  return `${range} ${period}`;
}

export function splitJobLines(value: string) {
  return value.split(/\r?\n/u).map((line) => line.trim()).filter(Boolean).slice(0, 20);
}
