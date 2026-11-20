import { z } from "zod";
import type { CvEntry } from "./model";
import type { Carta, CvDocumento, Idioma } from "./documento";
import { textoPlano, sinVineta } from "./texto-rico";

/**
 * LA IA DEL CURRÍCULUM Y DE LA CARTA (Workers AI, 20-nov-2026).
 *
 * Lo que la gente hace hoy es pegarle la oferta a un chat y pedirle «hazme un
 * CV para este puesto»: sale bonito y con datos inventados. Aquí la IA solo
 * REESCRIBE lo que la persona ya escribió, para el puesto que pegó:
 *  - Nunca agrega empresas, cargos, fechas, títulos, certificaciones ni cifras.
 *    Se le pide en el prompt Y se comprueba en el código (`hechosNuevos`): una
 *    sugerencia con un número o un nombre propio que no está en el CV se
 *    descarta, no se muestra.
 *  - Si le falta un dato, PREGUNTA («¿Cuántos clientes atendías por día?») en
 *    lugar de rellenarlo.
 *  - Nada se aplica sin que la persona lo acepte, sugerencia por sugerencia.
 * Al modelo solo va el contenido profesional: nunca el nombre, el correo, el
 * teléfono, la dirección ni la firma.
 *
 * Este archivo no habla con el modelo: arma lo que se le manda y valida lo que
 * vuelve. Así se prueba sin red (tests/e2e/cv-documento.spec.ts).
 */

/** Las secciones con logros que la IA puede reescribir. */
export const SECCIONES_IA = ["experiencia", "proyectos", "voluntariado"] as const;
export type SeccionIa = (typeof SECCIONES_IA)[number];

export type EntradaIa = { id: string; titulo: string; organizacion: string; periodo: string; logros: string[] };
/** El CV tal como lo ve el modelo: sin datos de contacto. */
export type CvParaIa = {
  idioma: Idioma;
  titular: string;
  resumen: string;
  entradas: EntradaIa[];
  habilidades: string[];
  otras: string[]; // habilidades del perfil que hoy no salen en el CV
  educacion: string[];
  certificaciones: string[];
  idiomas: string[];
};

export const MAX_OFERTA = 6000;
const MAX_LOGRO = 300;
const MAX_LOGROS = 6;

const lineasDe = (descripcion: string) => descripcion.split("\n").map((l) => textoPlano(sinVineta(l.trim()))).filter(Boolean);
const visibles = (l: CvEntry[] | undefined) => (l ?? []).map((e, i) => ({ e, i })).filter(({ e }) => !e.hidden && e.title.trim());

export function cvParaIa(cv: CvDocumento): CvParaIa {
  const entradas: EntradaIa[] = [];
  for (const s of SECCIONES_IA) {
    for (const { e, i } of visibles(cv[s])) {
      entradas.push({ id: `${s}:${i}`, titulo: e.title.trim(), organizacion: e.organization.trim(), periodo: e.period.trim(), logros: lineasDe(e.description).slice(0, 8) });
    }
  }
  return {
    idioma: cv.idioma,
    titular: cv.titular.trim(),
    resumen: textoPlano(cv.resumen.replace(/\n+/g, " ")).trim(),
    entradas,
    habilidades: cv.habilidades.slice(0, 15),
    otras: cv.sugeridas.filter((s) => !cv.habilidades.includes(s)).slice(0, 25),
    educacion: visibles(cv.educacion).map(({ e }) => [e.title, e.organization, e.period].filter((x) => x.trim()).join(", ")),
    certificaciones: cv.certificaciones.slice(0, 10),
    idiomas: cv.idiomas.slice(0, 6),
  };
}

/** Todo lo que la persona escribió, para comprobar que la IA no agregó nada. */
export function textoFuente(f: CvParaIa): string {
  return [
    f.titular, f.resumen, ...f.habilidades, ...f.otras, ...f.educacion, ...f.certificaciones, ...f.idiomas,
    ...f.entradas.flatMap((e) => [e.titulo, e.organizacion, e.periodo, ...e.logros]),
  ].join("\n");
}

// ── LOS HECHOS NUEVOS ──────────────────────────────────────────────────────
const sinTildes = (t: string) => t.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
const PALABRAS_NUMERO: Record<string, number> = {
  dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9, diez: 10, once: 11, doce: 12, quince: 15, veinte: 20,
  treinta: 30, cuarenta: 40, cincuenta: 50, cien: 100, ciento: 100, cientos: 100, mil: 1000, miles: 1000,
  two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15, twenty: 20,
  thirty: 30, forty: 40, fifty: 50, hundred: 100, hundreds: 100, thousand: 1000, thousands: 1000,
};
/** Las cifras de un texto, en dígitos o en palabras («cinco años» = 5). */
export function cifras(texto: string): Set<string> {
  const out = new Set<string>();
  // Pegadas a letras («B1», «C1», «4x4») son códigos: se revisan como nombres.
  for (const m of texto.matchAll(/(?<![\p{L}\d])\d+(?:[.,]\d+)*(?![\p{L}\d])/gu)) {
    const n = m[0];
    out.add(n.replace(",", "."));
    out.add(n.replace(/[.,](?=\d{3}\b)/g, "")); // 1.200 = 1200
  }
  for (const w of sinTildes(texto).match(/\p{L}+/gu) ?? []) if (w in PALABRAS_NUMERO) out.add(String(PALABRAS_NUMERO[w]));
  return out;
}
/** Palabras que van con mayúscula sin ser nombres propios. */
const COMUNES = new Set(["i", "i'm", "i've", "i'd", "i'll"]);
/**
 * Los nombres propios y siglas de un texto (empresas, programas, títulos):
 * palabras con mayúscula que no empiezan una oración, y siglas en cualquier
 * lugar. «Atendí clientes en Walmart» → Walmart.
 */
export function nombresPropios(texto: string): string[] {
  const out: string[] = [];
  for (const linea of texto.split("\n")) {
    const tokens = [...linea.matchAll(/[\p{L}\p{N}][\p{L}\p{N}&+#'.-]*/gu)];
    tokens.forEach((t, i) => {
      const w = t[0].replace(/[.'-]+$/, "");
      if (!/^\p{Lu}/u.test(w) || COMUNES.has(w.toLowerCase())) return;
      const antes = linea.slice(0, t.index).trimEnd();
      const iniciaOracion = i === 0 || /[.!?:;•\-–(\[]$/.test(antes);
      const sigla = w.length >= 2 && w === w.toUpperCase() && /\p{Lu}.*\p{Lu}/u.test(w);
      if (!iniciaOracion || sigla) out.push(w);
    });
  }
  return out;
}
/**
 * Lo que una sugerencia afirma y no está en lo que la persona escribió (ni en
 * `permitido`: la oferta y los datos de la carta, cuando corresponde). Vacío =
 * se puede mostrar.
 */
export function hechosNuevos(sugerencia: string, fuente: string, permitido = ""): string[] {
  const base = sinTildes(`${fuente}\n${permitido}`);
  const numerosBase = cifras(fuente);
  const nuevos: string[] = [];
  for (const n of cifras(sugerencia)) if (!numerosBase.has(n)) nuevos.push(n);
  for (const p of nombresPropios(sugerencia)) {
    const w = sinTildes(p);
    if (!new RegExp(`(^|[^\\p{L}\\p{N}])${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}($|[^\\p{L}\\p{N}])`, "u").test(base)) nuevos.push(p);
  }
  return [...new Set(nuevos)];
}

// ── LO QUE SE LE PIDE AL MODELO ───────────────────────────────────────────
const VOZ: Record<Idioma, string> = {
  es: "Escribe en español neutro de Costa Rica, en primera persona y sin voseo ni tuteo (\"Instalé\", \"Atendí\"). No sabes el género de la persona: evita adjetivos con género sobre ella (\"especializado\", \"experto\"); usa formas neutras (\"con especialidad en\", \"experiencia en\"). Los logros, en pretérito y primera persona (\"Instalé\", nunca \"Instaló\"); el resumen, sin tercera persona (nunca \"Posee\", \"Cuenta con\" ni \"Es\"). Sin emojis ni signos de exclamación.",
  en: "Write in clear US English, first person without pronouns in bullets (\"Installed\", \"Served\"). No emojis or exclamation marks.",
};
const REGLAS = `REGLAS QUE NO SE ROMPEN:
1. Usa SOLO los hechos del CV que te paso. No agregues empresas, cargos, fechas, títulos, cursos, certificaciones, herramientas, idiomas ni cifras que no estén escritos ahí. Tampoco le atribuyas resultados que el CV no dice ("reduciendo fallas", "ahorrando costos", "garantizando calidad").
2. No conviertas un requisito de la oferta en experiencia de la persona. Si la oferta pide algo que el CV no muestra, no lo afirmes: ponlo como pregunta.
3. Si un logro mejoraría con un dato que falta (cuántos, cuánto, con qué resultado), NO lo inventes: escribe una pregunta corta para la persona.
4. Reescribe para que se note lo que pide el puesto: verbo de acción al inicio, concreto, una línea por logro, sin relleno ("proactivo", "apasionado", "responsable de").
5. Nunca escribas preguntas dentro de los textos del CV o de la carta: las preguntas van solo donde se piden.
6. Responde SOLO con el JSON pedido, sin texto antes ni después.`;

export function promptAdaptar(f: CvParaIa, oferta: string): { system: string; user: string } {
  return {
    system: `Eres un editor de currículums para el mercado laboral de Costa Rica. Adaptas un CV real a una oferta de empleo sin inventar nada.\n${VOZ[f.idioma]}\n${REGLAS}\n
Devuelve este JSON:
{"titular": "titular del CV adaptado al puesto, máximo 8 palabras, sin inventar cargos",
 "resumen": "resumen profesional de 2 a 3 oraciones (máximo 450 caracteres) que conecte la experiencia real con el puesto",
 "entradas": [{"id": "el mismo id de la entrada", "logros": ["logros reescritos, los más relevantes para el puesto primero, máximo 5"]}],
 "habilidades": ["de 6 a 10, elegidas SOLO de 'habilidades' y 'otras', las más relevantes para el puesto primero"],
 "preguntas": ["hasta 5 preguntas cortas, dirigidas a la persona tratándola de usted (nunca tú ni vos) y entre signos de pregunta (\"¿Tiene licencia B1?\", \"¿Cuántos tableros instalaba por mes?\"), sobre datos que faltan y harían más fuerte el CV para este puesto"]}
Incluye en "entradas" solo las que cambiaste. No cambies títulos, organizaciones ni fechas.`,
    user: `CV (JSON):\n${JSON.stringify(f)}\n\nOFERTA DE EMPLEO:\n${oferta.slice(0, MAX_OFERTA)}`,
  };
}

export function promptMejorar(texto: string, tipo: "resumen" | "logros", idioma: Idioma, contexto: string): { system: string; user: string } {
  const que = tipo === "resumen"
    ? "un resumen profesional de 2 a 3 oraciones (máximo 450 caracteres)"
    : "una lista de logros, uno por línea (separados con \\n), con el mismo número de logros o menos";
  return {
    system: `Eres un editor de currículums. Mejoras la redacción sin cambiar los hechos.\n${VOZ[idioma]}\n${REGLAS}\n
Devuelve este JSON: {"opciones": ["3 versiones distintas de ${que}: una más concisa, una más orientada a resultados y una más formal"]}`,
    user: `CONTEXTO: ${contexto}\n\nTEXTO ORIGINAL:\n${texto}`,
  };
}

export type DatosCarta = { puesto: string; empresa: string; destinatario: string };
export function promptCarta(f: CvParaIa, oferta: string, d: DatosCarta): { system: string; user: string } {
  return {
    system: `Escribes cartas de presentación breves y concretas para postular a un empleo en Costa Rica.\n${VOZ[f.idioma]} En la carta sí se trata de usted a quien la lee.\n${REGLAS}
7. Sobre la empresa usa solo lo que dice la oferta. Si la oferta no dice nada concreto de la empresa, escribe [algo concreto de la empresa que le atraiga] entre corchetes para que la persona lo complete.\n
Devuelve este JSON (cada campo es un párrafo, sin saludo ni despedida):
{"apertura": "1 oración: a qué puesto postula y dónde",
 "porQueEncajo": "2 a 3 oraciones con los 2 logros o experiencias del CV más relevantes para lo que pide la oferta",
 "porQueLaEmpresa": "1 a 2 oraciones sobre por qué esta empresa, con lo que dice la oferta",
 "cierre": "1 oración que pida una entrevista, sin servilismo"}`,
    user: `CV (JSON):\n${JSON.stringify(f)}\n\nPUESTO: ${d.puesto || "(el de la oferta)"}\nEMPRESA: ${d.empresa || "(la de la oferta)"}\nQUIEN LA RECIBE: ${d.destinatario || "(no se sabe)"}\n\nOFERTA DE EMPLEO:\n${oferta.slice(0, MAX_OFERTA)}`,
  };
}

// ── LO QUE VUELVE ─────────────────────────────────────────────────────────
const texto = (max: number) => z.string().transform((s) => s.replace(/\s+/g, " ").trim().slice(0, max));
const lista = (max: number, largo: number) => z.array(z.string()).transform((l) => l.map((s) => s.replace(/^[\s•\-–*]+/, "").replace(/\s+/g, " ").trim()).filter(Boolean).slice(0, max).map((s) => s.slice(0, largo)));

export const RespuestaAdaptar = z.object({
  titular: texto(80).optional().default(""),
  resumen: texto(600).optional().default(""),
  entradas: z.array(z.object({ id: z.string(), logros: lista(MAX_LOGROS, MAX_LOGRO) })).optional().default([]),
  habilidades: lista(10, 80).optional().default([]),
  preguntas: lista(5, 160).optional().default([]),
});
export const RespuestaMejorar = z.object({ opciones: z.array(z.string()).min(1) });
export const RespuestaCarta = z.object({
  apertura: texto(500), porQueEncajo: texto(900), porQueLaEmpresa: texto(600), cierre: texto(400),
});

/** El JSON de la respuesta del modelo, aunque venga con texto o ```json alrededor. */
export function leerJson(contenido: unknown): unknown {
  if (contenido && typeof contenido === "object") return contenido;
  if (typeof contenido !== "string") return null;
  const limpio = contenido.replace(/```(?:json)?/gi, "").trim();
  const inicio = limpio.indexOf("{"), fin = limpio.lastIndexOf("}");
  if (inicio < 0 || fin <= inicio) return null;
  try { return JSON.parse(limpio.slice(inicio, fin + 1)); } catch { return null; }
}

/**
 * «Instaló tableros» → «Instalé tableros». El modelo a veces se pasa a la
 * tercera persona; en el primer verbo de un logro se corrige solo (-ó → -é,
 * -ió → -í). Lo demás de la línea no se toca.
 */
export function enPrimeraPersona(linea: string, idioma: Idioma): string {
  if (idioma !== "es") return linea;
  return linea.replace(/^(\p{L}{2,}?)(yó|ió|ó)(?=[\s,]|$)/u, (_, raiz: string, fin: string) => raiz + (fin === "ó" ? "é" : "í"));
}

/**
 * LAS PREGUNTAS A LA PERSONA, DE USTED (19-nov-2026). La app trata de usted en
 * toda la interfaz; si el modelo se escapa al tú o al vos («¿Tienes…?»,
 * «¿Cuántos clientes atendiste?», «tenés»), se corrige lo frecuente. Solo las
 * preguntas: lo que va en el CV o la carta sigue en primera persona.
 */
const USTED_IRREGULAR: Record<string, string> = {
  tienes: "tiene", tenés: "tiene", puedes: "puede", podés: "puede", quieres: "quiere", querés: "quiere",
  sabes: "sabe", sabés: "sabe", eres: "es", sos: "es", estás: "está", has: "ha", haces: "hace", hacés: "hace",
  hiciste: "hizo", tuviste: "tuvo", estuviste: "estuvo", pudiste: "pudo", fuiste: "fue", dijiste: "dijo",
  supiste: "supo", condujiste: "condujo", trajiste: "trajo", diste: "dio", viste: "vio", obtuviste: "obtuvo",
  tenías: "tenía", hacías: "hacía", atendías: "atendía", sabías: "sabía", podías: "podía",
  tu: "su", tus: "sus", te: "le", ti: "usted", contigo: "con usted", tuyo: "suyo", tuya: "suya",
};
// Presente de tú o vos en -as/-es de verbos comunes en un CV («¿Manejas…?», «¿Hablás…?»).
// Sin los que también son sustantivos («cuentas», «programas», «cocinas»).
const USTED_PRESENTE = /^(manej|habl|trabaj|conoc|domin|us|lleg|ofrec|atiend|instal|vend|conduc|enseñ|super|coordin|realiz|repar|diseñ|administr|aplic|limpi|hac)(as|es|ás|és)$/i;
// «-iste» que no es pretérito de tú: «existe», «consiste», «triste»…
const NO_PRETERITO = /(xiste|siste|triste|chiste|alpiste)$/;
export function preguntaDeUsted(pregunta: string, idioma: Idioma): string {
  if (idioma !== "es") return pregunta;
  return pregunta.replace(/\b(c)uentas con\b/gi, (_, c: string) => `${c}uenta con`).replace(/\p{L}+/gu, (palabra) => {
    const min = palabra.toLowerCase();
    const mayuscula = palabra[0] !== min[0];
    const conMayuscula = (t: string) => (mayuscula ? t.charAt(0).toUpperCase() + t.slice(1) : t);
    if (USTED_IRREGULAR[min]) return conMayuscula(USTED_IRREGULAR[min]);
    if (min.length > 5 && min.endsWith("aste")) return conMayuscula(min.slice(0, -4) + "ó");
    if (min.length > 5 && min.endsWith("iste") && !NO_PRETERITO.test(min)) return conMayuscula(min.slice(0, -4) + "ió");
    if (min.length > 6 && min.endsWith("abas")) return conMayuscula(min.slice(0, -1));
    const m = USTED_PRESENTE.exec(min);
    if (m) return conMayuscula(m[1] + m[2].replace("á", "a").replace("é", "e").slice(0, -1));
    return palabra;
  });
}

/** Una pregunta metida en el texto del CV o de la carta no se publica. */
const tienePregunta = (t: string) => /[¿?]/.test(t);
/**
 * Quita las oraciones que afirman algo nuevo (o preguntan) y deja las demás:
 * un párrafo bueno con una oración inventada se salva. `null` si no queda nada.
 */
export function sinOracionesInventadas(texto: string, inventa: (oracion: string) => boolean): { texto: string | null; quitadas: number } {
  const oraciones = texto.split(/(?<=[.!?…])\s+/).map((o) => o.trim()).filter(Boolean);
  const buenas = oraciones.filter((o) => !tienePregunta(o) && !inventa(o));
  const quitadas = oraciones.length - buenas.length;
  return { texto: buenas.length ? buenas.join(" ") : null, quitadas };
}

/** Una sugerencia para aceptar o descartar. */
export type Sugerencia =
  | { tipo: "titular"; antes: string; despues: string }
  | { tipo: "resumen"; antes: string; despues: string }
  | { tipo: "logros"; id: string; titulo: string; antes: string[]; despues: string[] }
  | { tipo: "habilidades"; antes: string[]; despues: string[] };
export type Adaptacion = { sugerencias: Sugerencia[]; preguntas: string[]; descartadas: number };

const igual = (a: string, b: string) => sinTildes(a).replace(/\W+/g, "") === sinTildes(b).replace(/\W+/g, "");

/**
 * De la respuesta del modelo, solo lo que se puede mostrar: lo que cambia
 * algo y no agrega hechos. `descartadas` cuenta lo que se tiró por inventar.
 */
export function validarAdaptacion(crudo: unknown, f: CvParaIa): Adaptacion | null {
  const r = RespuestaAdaptar.safeParse(crudo);
  if (!r.success) return null;
  const fuente = textoFuente(f);
  const sugerencias: Sugerencia[] = [];
  let descartadas = 0;
  const limpio = (t: string) => (hechosNuevos(t, fuente).length || tienePregunta(t) ? (descartadas++, false) : true);

  if (r.data.titular && !igual(r.data.titular, f.titular) && limpio(r.data.titular)) sugerencias.push({ tipo: "titular", antes: f.titular, despues: r.data.titular });
  if (r.data.resumen) {
    const { texto: resumen, quitadas } = sinOracionesInventadas(r.data.resumen, (o) => hechosNuevos(o, fuente).length > 0);
    descartadas += quitadas;
    if (resumen && !igual(resumen, f.resumen)) sugerencias.push({ tipo: "resumen", antes: f.resumen, despues: resumen });
  }

  const vistas = new Set<string>();
  for (const e of r.data.entradas) {
    const original = f.entradas.find((x) => x.id === e.id);
    if (!original || vistas.has(e.id) || !e.logros.length) continue;
    vistas.add(e.id);
    // Cada logro se revisa por separado: uno inventado no tumba los demás.
    // Las cifras, solo las de esa misma entrada: un "40" de otro trabajo no se
    // muda. Los nombres, también los de sus habilidades y certificaciones.
    const propia = [original.titulo, original.organizacion, original.periodo, ...original.logros].join("\n");
    const vocabulario = [f.titular, ...f.habilidades, ...f.otras, ...f.certificaciones, ...f.idiomas].join("\n");
    const despues = e.logros.map((l) => enPrimeraPersona(l, f.idioma)).filter((l) => {
      if (tienePregunta(l)) { descartadas++; return false; }
      const nuevos = hechosNuevos(l, propia, vocabulario).filter((n) => !/^\d/.test(n) || !cifras(vocabulario).has(n) || cifras(propia).has(n));
      if (nuevos.length) { descartadas++; return false; }
      return true;
    });
    if (!despues.length || (despues.length === original.logros.length && despues.every((l, i) => igual(l, original.logros[i] ?? "")))) continue;
    sugerencias.push({ tipo: "logros", id: e.id, titulo: [original.titulo, original.organizacion].filter(Boolean).join(" — "), antes: original.logros, despues });
  }

  // Las habilidades solo se eligen y ordenan de las que la persona ya tiene.
  const disponibles = [...f.habilidades, ...f.otras];
  const elegidas = [...new Set(r.data.habilidades.map((h) => disponibles.find((d) => igual(d, h))).filter((h): h is string => !!h))];
  if (r.data.habilidades.length > elegidas.length) descartadas += r.data.habilidades.length - elegidas.length;
  if (elegidas.length >= 3 && elegidas.join("|") !== f.habilidades.join("|")) sugerencias.push({ tipo: "habilidades", antes: f.habilidades, despues: elegidas });

  return { sugerencias, preguntas: r.data.preguntas.map((q) => preguntaDeUsted(q, f.idioma)), descartadas };
}

export function validarMejora(crudo: unknown, original: string, contexto: string, tipo: "resumen" | "logros", idioma: Idioma = "es"): { opciones: string[]; descartadas: number } | null {
  const r = RespuestaMejorar.safeParse(crudo);
  if (!r.success) return null;
  let descartadas = 0;
  const fuente = `${original}\n${contexto}`;
  const opciones = r.data.opciones
    .map((o) => (tipo === "logros"
      ? o.split(/\n|(?:^|\s)[•]\s/).map((l) => enPrimeraPersona(l.replace(/^[\s•\-–*\d.)]+/, "").trim(), idioma)).filter(Boolean).slice(0, MAX_LOGROS).join("\n")
      : o.replace(/\s+/g, " ").trim().slice(0, 600)))
    .filter((o) => o && !igual(o, original))
    .filter((o) => (hechosNuevos(o, fuente).length || tienePregunta(o) ? (descartadas++, false) : true));
  return { opciones: [...new Set(opciones)].slice(0, 3), descartadas };
}

export type CartaIa = Pick<Carta, "apertura" | "porQueEncajo" | "porQueLaEmpresa" | "cierre">;
/**
 * Los párrafos de la carta. Sobre la empresa se permite lo que dice la oferta
 * (y el puesto, la empresa y quien la recibe); las cifras, solo las del CV. Un
 * párrafo que inventa se reemplaza por uno entre [corchetes], que el aviso de
 * «completar» ya señala.
 */
export function validarCarta(crudo: unknown, f: CvParaIa, oferta: string, d: DatosCarta): { carta: CartaIa; descartadas: number } | null {
  const r = RespuestaCarta.safeParse(crudo);
  if (!r.success) return null;
  const fuente = textoFuente(f);
  const permitido = [oferta, d.puesto, d.empresa, d.destinatario].join("\n");
  const en = f.idioma === "en";
  const relleno: CartaIa = en
    ? { apertura: `[Which position you are applying for${d.empresa ? ` at ${d.empresa}` : ""}.]`, porQueEncajo: "[Two achievements from your resume that match what the job asks for.]", porQueLaEmpresa: "[Something specific about the company and how you would contribute.]", cierre: "[Ask for an interview.]" }
    : { apertura: `[A qué puesto postula${d.empresa ? ` en ${d.empresa}` : ""}.]`, porQueEncajo: "[Dos logros de su CV que respondan a lo que pide la oferta.]", porQueLaEmpresa: "[Algo concreto de la empresa y cómo aportaría.]", cierre: "[Pida una entrevista.]" };
  let descartadas = 0;
  const carta = {} as CartaIa;
  for (const k of ["apertura", "porQueEncajo", "porQueLaEmpresa", "cierre"] as const) {
    // Lo que se afirma de la PERSONA (por qué encaja, el cierre) lleva solo
    // cifras del CV: "5 años" de la oferta no son suyos. Al hablar del PUESTO o
    // de la empresa (apertura, por qué la empresa) valen también las de la
    // oferta ("hotel 4 estrellas"). Los nombres, contra el CV, la oferta y la carta.
    const numerosCv = cifras(fuente);
    const numeros = k === "apertura" || k === "porQueLaEmpresa" ? new Set([...numerosCv, ...cifras(permitido)]) : numerosCv;
    const inventa = (o: string) => [...cifras(o)].some((n) => !numeros.has(n))
      || hechosNuevos(o.replace(/(?<![\p{L}\d])\d+(?:[.,]\d+)*(?![\p{L}\d])/gu, ""), fuente, permitido).length > 0;
    const { texto: t, quitadas } = sinOracionesInventadas(r.data[k], inventa);
    descartadas += quitadas;
    carta[k] = t ?? relleno[k];
  }
  return { carta, descartadas };
}

/** Aplica las sugerencias aceptadas sobre una copia del CV. */
export function aplicarSugerencias(cv: CvDocumento, aceptadas: Sugerencia[]): CvDocumento {
  const copia: CvDocumento = JSON.parse(JSON.stringify(cv));
  for (const s of aceptadas) {
    if (s.tipo === "titular") copia.titular = s.despues;
    else if (s.tipo === "resumen") copia.resumen = s.despues;
    else if (s.tipo === "habilidades") {
      copia.habilidades = s.despues;
      copia.sugeridas = [...new Set([...copia.sugeridas, ...s.antes.filter((h) => !s.despues.includes(h))])];
    } else {
      const [seccion, indice] = s.id.split(":") as [SeccionIa, string];
      const lista = copia[seccion];
      const e = lista?.[Number(indice)];
      if (e) lista![Number(indice)] = { ...e, description: s.despues.join("\n") };
    }
  }
  return copia;
}

// ── MODELO, LÍMITES Y COSTO ───────────────────────────────────────────────
/** El modelo de Workers AI, elegido con scripts/cv-ai-eval.mjs (ver el informe en ese archivo). */
// 20-nov-2026, 10 casos de Costa Rica, mismo prompt para los tres:
//   deepseek-v4.1-flash: el mejor español (primera persona, concreto, buenas
//     preguntas), +15 puntos de palabras clave, ~11 s, ~US$0,004 por CV + carta.
//   gpt-oss-120b: se pasaba a tercera persona e inventaba más (11 descartes).
//   llama-3.3-70b: más barato y rápido, pero casi solo reordenaba y rellenaba la carta.
export const MODELO_IA_CV = "@cf/deepseek-ai/deepseek-v4.1-flash-1017";
/** Por cuenta y por día. */
export const LIMITE_DIARIO = { adaptar: 10, mejorar: 30, carta: 10 } as const;
export type AccionIa = keyof typeof LIMITE_DIARIO;
