import { normalizeCv, sameCvEntry, type CvEntry } from "./model";
import { parseCvDates } from "./dates";

/**
 * GENERADOR DE CV Y CARTA DE PRESENTACIÓN (panel → «Mi CV»).
 *
 * Un CV que lea bien un filtro automático (ATS) y una persona (13-nov-2026):
 *  - Una sola columna, títulos estándar, sin tablas, íconos ni gráficos.
 *  - El contacto va en el CUERPO del documento: muchos ATS no leen el
 *    encabezado ni el pie de página.
 *  - Fechas iguales en todo el documento (MM/AAAA – Actualidad) y lo más
 *    reciente primero.
 *  - El PDF lleva texto de verdad (seleccionable), nunca una imagen.
 * Nada aquí promete «pasar los filtros»: asegura un formato legible por ellos
 * y señala lo que suele hacer que un CV se descarte.
 *
 * El idioma del DOCUMENTO es aparte del de la app: cambia títulos, fechas y
 * las frases de la plantilla; lo que la persona escribió no se traduce solo.
 */

export type Idioma = "es" | "en";
export type Plantilla = "clasica" | "moderna";

export type CvDocumento = {
  idioma: Idioma;
  plantilla: Plantilla;
  nombre: string;
  titular: string; // «Electricista residencial», «Desarrollador web»
  correo: string;
  telefono: string;
  ubicacion: string;
  enlace: string; // perfil de ContrataCR, portafolio o LinkedIn
  resumen: string;
  experiencia: CvEntry[];
  educacion: CvEntry[];
  habilidades: string[]; // las que salen en el CV: de 6 a 10
  sugeridas: string[]; // el resto del perfil, para sumar con un toque
  idiomas: string[];
  certificaciones: string[];
};

export type Carta = {
  destinatario: string; // «Equipo de selección» si no se sabe
  empresa: string;
  puesto: string;
  apertura: string;
  porQueEncajo: string;
  porQueLaEmpresa: string;
  cierre: string;
};

export const LIMITES = { resumen: 600, carta: 2200, entradas: 12, habilidades: 10, porDefecto: 8, sugeridas: 30 };

export const TITULOS: Record<Idioma, Record<"resumen" | "experiencia" | "educacion" | "habilidades" | "idiomas" | "certificaciones" | "contacto", string>> = {
  es: { resumen: "Perfil profesional", experiencia: "Experiencia", educacion: "Educación", habilidades: "Habilidades", idiomas: "Idiomas", certificaciones: "Certificaciones", contacto: "Contacto" },
  en: { resumen: "Professional summary", experiencia: "Experience", educacion: "Education", habilidades: "Skills", idiomas: "Languages", certificaciones: "Certifications", contacto: "Contact" },
};

/** «03/2021 – Actualidad»: el formato que los ATS leen sin dudas, igual en todo el CV. */
export function fechasAts(periodo: string, idioma: Idioma): string {
  const d = parseCvDates(periodo);
  if (!d || !d.startYear) return periodo.trim();
  const parte = (anio: string, mes: string) => anio ? `${mes ? mes.padStart(2, "0") + "/" : ""}${anio}` : "";
  const fin = d.current ? (idioma === "en" ? "Present" : "Actualidad") : parte(d.endYear, d.endMonth);
  return [parte(d.startYear, d.startMonth), fin].filter(Boolean).join(" – ");
}

/** Para ordenar: lo actual y lo más reciente primero. */
function clave(periodo: string): number {
  const d = parseCvDates(periodo);
  if (!d || !d.startYear) return 0;
  if (d.current) return 999_999;
  const anio = Number(d.endYear || d.startYear), mes = Number(d.endMonth || d.startMonth || 0);
  return anio * 12 + mes;
}
export const masRecientePrimero = (entradas: CvEntry[]) => [...entradas].sort((a, b) => clave(b.period) - clave(a.period));

export type DatosDelPerfil = {
  nombre?: string | null;
  correo?: string | null;
  telefono?: string | null;
  ubicacion?: string | null;
  enlace?: string | null;
  bio?: string | null;
  servicios?: string[];
  aniosExperiencia?: number | null;
  cv?: unknown;
  idiomas?: string[];
  certificaciones?: { name: string; institution?: string; year?: string }[];
};

/**
 * ¿Título o certificación? En el perfil, «Certificaciones» guarda de todo:
 * «Ingeniero de Software · ULACIT» es un TÍTULO y va en Educación (como ya lo
 * muestra el perfil público). Solo queda en Certificaciones lo que suena a
 * certificado, curso corto o licencia.
 */
const ES_CERTIFICACION = /\b(certific|certified|curso|course|licencia|license|taller|workshop|seminario|istqb|aws|azure|scrum|pmp|itil|cisco|ccna|google|microsoft|oracle|comptia|toefl|ielts|rcp|cpr|primeros auxilios|first aid|manipulaci[oó]n de alimentos|alturas)\b/i;
const ES_TITULO = /\b(bachiller|bachelor|licenciatura|licenciad|ingenier|maestr[ií]a|master|m[aá]ster|doctorado|phd|t[eé]cnico|diplomado|universidad|university|colegio|school|grado|degree)\b/i;
export function esCertificacion(nombre: string, institucion = ""): boolean {
  const texto = `${nombre} ${institucion}`;
  return ES_CERTIFICACION.test(texto) && !ES_TITULO.test(nombre);
}

const plano = (t: string) => t.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim();
const unicas = (lista: string[]) => [...new Map(lista.map((h) => h.trim()).filter(Boolean).map((h) => [plano(h), h])).values()];

/** Lo que ya está en el perfil, listo para editar. Nada se inventa. */
/**
 * SUMAR LO QUE SE LEYÓ DE UN CV EN ARCHIVO (PDF o Word). No borra nada de lo
 * que la persona ya tiene: agrega las entradas que faltan, separa los
 * certificados de los títulos y completa las habilidades hasta las esenciales;
 * el resto queda como sugerencia para sumar con un toque.
 */
export function sumarDesdeArchivo(actual: CvDocumento, leido: unknown): { cv: CvDocumento; agregadas: number } {
  const cv = normalizeCv(leido);
  const nuevas = (base: CvEntry[], extra: CvEntry[]) => extra.filter((e, i) => e.title.trim() && !base.some((x) => sameCvEntry(x, e)) && !extra.slice(0, i).some((x) => sameCvEntry(x, e)));
  const experiencia = nuevas(actual.experiencia, cv.experience);
  const estudios = cv.education.filter((e) => !esCertificacion(e.title, e.organization));
  const educacion = nuevas(actual.educacion, estudios);
  const certificaciones = cv.education.filter((e) => esCertificacion(e.title, e.organization))
    .map((e) => [e.title.trim(), e.organization.trim(), e.period.trim()].filter(Boolean).join(" · "))
    .filter((c) => !actual.certificaciones.some((x) => plano(x) === plano(c)));
  const yaEstan = new Set([...actual.habilidades, ...actual.sugeridas].map(plano));
  const habilidadesNuevas = unicas(cv.skills).filter((h) => !yaEstan.has(plano(h)));
  const espacio = Math.max(0, LIMITES.porDefecto - actual.habilidades.length);
  const todasExp = masRecientePrimero([...actual.experiencia, ...experiencia]).slice(0, LIMITES.entradas);
  return {
    cv: {
      ...actual,
      titular: actual.titular.trim() || todasExp[0]?.title || "",
      experiencia: todasExp,
      educacion: masRecientePrimero([...actual.educacion, ...educacion]).slice(0, LIMITES.entradas),
      certificaciones: [...actual.certificaciones, ...certificaciones],
      habilidades: [...actual.habilidades, ...habilidadesNuevas.slice(0, espacio)],
      sugeridas: unicas([...habilidadesNuevas.slice(espacio), ...actual.sugeridas]).slice(0, LIMITES.sugeridas),
    },
    agregadas: experiencia.length + educacion.length + certificaciones.length + habilidadesNuevas.length,
  };
}

export function prellenar(datos: DatosDelPerfil, idioma: Idioma): CvDocumento {
  const cv = normalizeCv(datos.cv);
  const servicios = (datos.servicios ?? []).map((s) => s.trim()).filter(Boolean);
  const certs = (datos.certificaciones ?? []).filter((c) => c.name?.trim());
  const comoEstudio = certs.filter((c) => !esCertificacion(c.name, c.institution))
    .map((c): CvEntry => ({ title: c.name.trim(), organization: c.institution?.trim() ?? "", period: c.year?.trim() ?? "", description: "" }));
  const educacion = [...cv.education, ...comoEstudio.filter((e, i) => !cv.education.some((x) => sameCvEntry(x, e)) && !comoEstudio.slice(0, i).some((x) => sameCvEntry(x, e)))];
  const certificaciones = certs.filter((c) => esCertificacion(c.name, c.institution))
    .map((c) => [c.name.trim(), c.institution?.trim(), c.year?.trim()].filter(Boolean).join(" · "));
  // Habilidades: de 6 a 10, las primeras de su propio CV. Los nombres de los
  // servicios («Desarrollo web») no son habilidades: quedan como sugerencia.
  const propias = unicas(cv.skills);
  const habilidades = propias.slice(0, LIMITES.porDefecto);
  const sugeridas = unicas([...propias.slice(LIMITES.porDefecto), ...servicios]).filter((s) => !habilidades.some((h) => plano(h) === plano(s))).slice(0, LIMITES.sugeridas);
  return {
    idioma,
    plantilla: "clasica",
    nombre: datos.nombre?.trim() ?? "",
    titular: cv.experience.length ? masRecientePrimero(cv.experience)[0].title : servicios[0] ?? "",
    correo: datos.correo?.trim() ?? "",
    telefono: datos.telefono?.trim() ?? "",
    ubicacion: datos.ubicacion?.trim() ?? "",
    enlace: datos.enlace?.trim() ?? "",
    resumen: (datos.bio ?? "").trim().slice(0, LIMITES.resumen),
    experiencia: masRecientePrimero(cv.experience).slice(0, LIMITES.entradas),
    educacion: masRecientePrimero(educacion).slice(0, LIMITES.entradas),
    habilidades: habilidades.length ? habilidades : servicios.slice(0, 4),
    sugeridas: habilidades.length ? sugeridas : sugeridas.filter((s) => !servicios.slice(0, 4).includes(s)),
    idiomas: (datos.idiomas ?? []).filter(Boolean),
    certificaciones,
  };
}

/** Desde una vacante: suben primero las habilidades que pide, hasta el tope. */
export function ajustarAVacante(cv: CvDocumento, vacante: string): CvDocumento {
  const texto = plano(vacante);
  if (!texto.trim()) return cv;
  // Palabra completa: «Java» no debe calzar dentro de «JavaScript».
  const pide = (h: string) => new RegExp(`(^|[^\\p{L}\\p{N}+#])${plano(h).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}+#])`, "u").test(texto);
  const todas = [...cv.habilidades, ...cv.sugeridas];
  const elegidas = unicas([...todas.filter(pide), ...cv.habilidades]).slice(0, LIMITES.habilidades);
  return { ...cv, habilidades: elegidas, sugeridas: unicas(todas).filter((h) => !elegidas.some((e) => plano(e) === plano(h))) };
}

export function cartaInicial(cv: CvDocumento, vacante: { puesto?: string; empresa?: string } = {}): Carta {
  const en = cv.idioma === "en";
  const puesto = vacante.puesto?.trim() || cv.titular;
  const empresa = vacante.empresa?.trim() ?? "";
  const logro = cv.experiencia[0];
  return {
    destinatario: en ? "Hiring team" : "Equipo de selección",
    empresa,
    puesto,
    apertura: en
      ? `I am writing to apply for the ${puesto || "[position]"} position${empresa ? ` at ${empresa}` : ""}.`
      : `Les escribo para postularme al puesto de ${puesto || "[puesto]"}${empresa ? ` en ${empresa}` : ""}.`,
    porQueEncajo: logro
      ? (en
        ? `In my role as ${logro.title}${logro.organization ? ` at ${logro.organization}` : ""}, I [main achievement, ideally with a number]. ${cv.habilidades.slice(0, 3).length ? `My strengths include ${cv.habilidades.slice(0, 3).join(", ")}.` : ""}`
        : `Como ${logro.title}${logro.organization ? ` en ${logro.organization}` : ""}, [tu logro principal, idealmente con un número]. ${cv.habilidades.slice(0, 3).length ? `Mis fortalezas incluyen ${cv.habilidades.slice(0, 3).join(", ")}.` : ""}`).trim()
      : (en ? "[Two or three achievements that show you can do this job, ideally with numbers.]" : "[Dos o tres logros que muestren que podés hacer este trabajo, idealmente con números.]"),
    porQueLaEmpresa: en
      ? `[Why this company: something specific about what they do and how you would contribute.]`
      : `[Por qué esta empresa: algo concreto de lo que hacen y cómo aportarías.]`,
    cierre: en
      ? "I would welcome the chance to talk about how I can help your team. Thank you for your time."
      : "Me encantaría conversar sobre cómo puedo aportar a su equipo. Muchas gracias por su tiempo.",
  };
}

// ── REVISIÓN ── lo que suele hacer que un CV se descarte, dicho en simple.
export type Aviso = { id: string; nivel: "falta" | "mejora"; texto: Record<Idioma, string> };

const VERBOS = /^(?:[•\-–]\s*)?(instal|lider|dirig|gestion|coordin|desarroll|dise[nñ]|implement|cre[eé]|logr|aument|reduj|mejor|atend|repar|constru|vend|capacit|organic|supervis|administr|optimic|negoci|plane|install|led|manag|coordinat|develop|design|implement|creat|achiev|increas|reduc|improv|serv|repair|built|sold|train|organiz|supervis|administer|optimiz|negotiat|plann|integrat|defin|expand|set ?up|partner|migrat|automat|launch|deliver|defin[ií]|integr[eé]|ampli[eé]|automatic[eé]|migr[eé]|lanc[eé])/i;
const PLACEHOLDER = /\[[^\]]+\]/;

export function revisarCv(cv: CvDocumento): Aviso[] {
  const avisos: Aviso[] = [];
  const add = (id: string, nivel: Aviso["nivel"], es: string, en: string) => avisos.push({ id, nivel, texto: { es, en } });
  if (!cv.nombre.trim()) add("nombre", "falta", "Falta tu nombre completo.", "Your full name is missing.");
  if (!cv.correo.trim() && !cv.telefono.trim()) add("contacto", "falta", "Agregá un correo o un teléfono para que te puedan llamar.", "Add an email or phone so they can reach you.");
  if (cv.correo && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cv.correo.trim())) add("correo", "falta", "El correo no parece válido.", "The email doesn't look valid.");
  if (!cv.titular.trim()) add("titular", "mejora", "Poné un título corto arriba (por ejemplo \"Electricista residencial\"): es lo primero que lee el reclutador.", "Add a short headline (for example \"Residential electrician\"): it is the first thing a recruiter reads.");
  if (cv.resumen.trim().length < 80) add("resumen", "mejora", "Escribí un perfil profesional de 2 o 3 líneas: qué hacés, cuánta experiencia tenés y en qué sos fuerte.", "Write a 2–3 line summary: what you do, how much experience you have and what you're strong at.");
  if (!cv.experiencia.length) add("experiencia", "falta", "Agregá al menos una experiencia, aunque sea por cuenta propia.", "Add at least one job, even if self-employed.");
  const sinDescripcion = cv.experiencia.filter((e) => !e.description.trim());
  if (sinDescripcion.length) add("logros", "mejora", `${sinDescripcion.length === 1 ? "Una experiencia no tiene" : `${sinDescripcion.length} experiencias no tienen`} logros: contá en 2 o 3 viñetas qué hiciste.`, `${sinDescripcion.length === 1 ? "One job has" : `${sinDescripcion.length} jobs have`} no achievements: add 2–3 bullet points.`);
  const descripciones = cv.experiencia.map((e) => e.description).join("\n");
  // «Liderazgo: Definí…» también empieza con un verbo: la etiqueta corta del
  // principio no cuenta.
  const sinEtiqueta = (l: string) => l.trim().replace(/^[•\-–]\s*/, "").replace(/^[^:]{1,40}:\s*/, "");
  if (descripciones.trim() && !descripciones.split("\n").some((l) => VERBOS.test(sinEtiqueta(l)))) add("verbos", "mejora", "Empezá cada logro con un verbo de acción: Instalé, Lideré, Reduje…", "Start each achievement with an action verb: Installed, Led, Reduced…");
  if (descripciones.trim() && !/\d/.test(descripciones)) add("numeros", "mejora", "Agregá números a tus logros (30 clientes, 15 %, 2 años): hacen el CV más creíble.", "Add numbers to your achievements (30 clients, 15%, 2 years): they make your CV more credible.");
  if (cv.experiencia.some((e) => !parseCvDates(e.period)?.startYear)) add("fechas", "mejora", "Poné fecha de inicio (mes y año) en cada experiencia.", "Add a start date (month and year) to every job.");
  if (cv.habilidades.length < 4) add("habilidades", "mejora", "Agregá al menos 4 habilidades: los filtros buscan esas palabras.", "Add at least 4 skills: screening filters look for those words.");
  if (cv.habilidades.length > LIMITES.habilidades) add("demasiadas", "mejora", `Dejá ${LIMITES.habilidades} habilidades como máximo, las que más pide el puesto: una lista larga se lee como relleno.`, `Keep ${LIMITES.habilidades} skills at most, the ones the job asks for: a long list reads as filler.`);
  // Unos 2.900 caracteres por página carta con esta plantilla.
  if (cvComoTexto(cv).length > 5800) add("largo", "mejora", "Pasa de unas 2 páginas: dejá solo lo más relevante para el puesto.", "It runs past about 2 pages: keep only what matters most for the job.");
  if ([cv.resumen, ...cv.experiencia.map((e) => e.description)].some((t) => PLACEHOLDER.test(t))) add("corchetes", "falta", "Quedó texto entre [corchetes] por completar.", "There is [bracketed] text left to fill in.");
  return avisos;
}

export function revisarCarta(carta: Carta): Aviso[] {
  const avisos: Aviso[] = [];
  const cuerpo = [carta.apertura, carta.porQueEncajo, carta.porQueLaEmpresa, carta.cierre].join(" ");
  if (PLACEHOLDER.test(cuerpo)) avisos.push({ id: "corchetes", nivel: "falta", texto: { es: "Completá lo que está entre [corchetes] antes de enviarla.", en: "Fill in the [bracketed] text before sending it." } });
  if (!carta.puesto.trim()) avisos.push({ id: "puesto", nivel: "falta", texto: { es: "Indicá a qué puesto te postulás.", en: "Say which position you are applying for." } });
  const palabras = cuerpo.trim().split(/\s+/).filter(Boolean).length;
  if (palabras > 400) avisos.push({ id: "larga", nivel: "mejora", texto: { es: "Está larga: una carta de presentación se lee mejor con menos de 400 palabras.", en: "It's long: a cover letter reads best under 400 words." } });
  return avisos;
}

/** Palabras de la vacante que aparecen (o no) en el CV: lo que miran los filtros. */
const VACIAS = new Set("para con por los las una unos unas del que como sus este esta entre sobre desde hasta tener experiencia trabajo puesto empresa and the for with you your our are will have from this that years work job".split(" "));
const norm = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
export function palabrasClave(vacante: string, cv: CvDocumento): { estan: string[]; faltan: string[] } {
  const texto = norm([cv.titular, cv.resumen, ...cv.habilidades, ...cv.experiencia.flatMap((e) => [e.title, e.description]), ...cv.certificaciones].join(" "));
  const vistas = new Map<string, string>();
  for (const palabra of vacante.split(/[^\p{L}\p{N}+#.]+/u)) {
    const limpia = palabra.replace(/^[.]+|[.]+$/g, "");
    const n = norm(limpia);
    if (n.length < 4 || VACIAS.has(n) || /^\d+$/.test(n)) continue;
    if (!vistas.has(n)) vistas.set(n, limpia);
  }
  const estan: string[] = [], faltan: string[] = [];
  for (const [n, original] of vistas) (texto.includes(n) ? estan : faltan).push(original);
  return { estan: estan.slice(0, 20), faltan: faltan.slice(0, 20) };
}

// ── TEXTO ── el mismo contenido que el PDF, para pegar en un formulario.
export function cvComoTexto(cv: CvDocumento): string {
  const t = TITULOS[cv.idioma];
  const contacto = [cv.correo, cv.telefono, cv.ubicacion, cv.enlace].filter((v) => v.trim()).join(" | ");
  const bloque = (titulo: string, lineas: string[]) => lineas.length ? [`${titulo.toUpperCase()}`, ...lineas, ""] : [];
  const entrada = (e: CvEntry) => [
    [e.title, e.organization].filter(Boolean).join(" — ") + (e.period ? ` (${fechasAts(e.period, cv.idioma)})` : ""),
    ...e.description.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => `- ${l.replace(/^[•\-–]\s*/, "")}`),
  ];
  return [
    cv.nombre, cv.titular, contacto, "",
    ...bloque(t.resumen, cv.resumen.trim() ? [cv.resumen.trim()] : []),
    ...bloque(t.experiencia, cv.experiencia.flatMap(entrada)),
    ...bloque(t.educacion, cv.educacion.flatMap(entrada)),
    ...bloque(t.certificaciones, cv.certificaciones),
    ...bloque(t.habilidades, cv.habilidades.length ? [cv.habilidades.join(", ")] : []),
    ...bloque(t.idiomas, cv.idiomas.length ? [cv.idiomas.join(", ")] : []),
  ].filter((l, i, a) => !(l === "" && a[i - 1] === "")).join("\n").trim();
}

// «Estimado equipo de selección», en minúscula a media frase; un nombre propio queda igual.
function saludo(destinatario: string, en: boolean) {
  const d = destinatario.trim() || (en ? "Hiring team" : "Equipo de selección");
  return /^(equipo de selecci[oó]n|hiring team)$/i.test(d) ? d.charAt(0).toLowerCase() + d.slice(1) : d;
}

/** Desde la fecha hasta la firma: lo mismo en el PDF y en el texto copiado. */
export function cuerpoDeLaCarta(cv: CvDocumento, carta: Carta, hoy = new Date()): string {
  const en = cv.idioma === "en";
  const fecha = hoy.toLocaleDateString(en ? "en-US" : "es-CR", { day: "numeric", month: "long", year: "numeric" });
  return [
    fecha, "",
    // El bloque del destinatario solo cuando hay empresa: sin ella repetía el saludo.
    carta.empresa.trim() ? [carta.destinatario, carta.empresa].filter((v) => v.trim()).join("\n") : "", "",
    `${en ? "Dear" : "Estimado"} ${saludo(carta.destinatario, en)}:`, "",
    carta.apertura.trim(), "", carta.porQueEncajo.trim(), "", carta.porQueLaEmpresa.trim(), "", carta.cierre.trim(), "",
    en ? "Sincerely," : "Saludos cordiales,", cv.nombre,
  ].filter((l, i, a) => !(l === "" && (i === 0 || a[i - 1] === ""))).join("\n").trim();
}

export function cartaComoTexto(cv: CvDocumento, carta: Carta, hoy = new Date()): string {
  const contacto = [cv.correo, cv.telefono, cv.ubicacion].filter((v) => v.trim()).join(" | ");
  return [cv.nombre, contacto, "", cuerpoDeLaCarta(cv, carta, hoy)].filter((l) => l !== undefined).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** «Ana-Mora-CV.pdf»: un nombre de archivo que el reclutador encuentra. */
export function nombreDeArchivo(nombre: string, tipo: "CV" | "Carta", idioma: Idioma) {
  const base = nombre.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^A-Za-z0-9]+/g, "-").replace(/^-|-$/g, "") || (idioma === "en" ? "Resume" : "CV");
  const sufijo = tipo === "CV" ? (idioma === "en" ? "Resume" : "CV") : (idioma === "en" ? "Cover-Letter" : "Carta-de-presentacion");
  return `${base}-${sufijo}.pdf`;
}
