#!/usr/bin/env node
/**
 * EVALUACIÓN DE MODELOS PARA LA IA DEL CV (20-nov-2026).
 *
 * Corre 10 casos reales de Costa Rica (CV + oferta) contra los modelos de
 * Workers AI y mide, con el MISMO código que usa la app (src/lib/cv/ia.ts):
 *  - JSON válido a la primera;
 *  - sugerencias descartadas por inventar (cifras o nombres que no están en el CV);
 *  - cobertura de palabras clave de la oferta antes y después de aplicar todo;
 *  - carta válida y párrafos reemplazados por inventar;
 *  - tiempo y neuronas (costo).
 * Imprime además dos salidas por modelo para leerlas.
 *
 * Uso:  node scripts/cv-ai-eval.mjs [--modelos a,b,c] [--casos 3] [--url http://127.0.0.1:8799]
 * Sin --url levanta un Worker temporal (solo con el binding AI) con
 * `npx wrangler dev`, usando la sesión de wrangler ya iniciada. No lee .env ni
 * imprime credenciales. Cada llamada gasta neuronas reales (centavos).
 */
import { build } from "esbuild";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const MODELOS = arg("modelos", "@cf/openai/gpt-oss-120b,@cf/deepseek-ai/deepseek-v4.1-flash-1017,@cf/meta/llama-3.3-70b-instruct-fp8-fast").split(",");
const N_CASOS = Number(arg("casos", "10"));
const NEURONA_USD = 0.011 / 1000;

// ── El código de la app, empaquetado ──
const salida = await build({
  stdin: { contents: `export * from "./src/lib/cv/ia.ts"; export { palabrasClave } from "./src/lib/cv/documento.ts";`, loader: "ts", resolveDir: root },
  bundle: true, write: false, format: "esm", platform: "node",
  alias: { "@": path.join(root, "src") },
});
const ia = await import(`data:text/javascript;base64,${Buffer.from(salida.outputFiles[0].text).toString("base64")}`);

// ── Los casos ──
const e = (title, organization, period, description) => ({ title, organization, period, description });
const cv = (o) => ({ idioma: "es", plantilla: "clasica", nombre: "Persona de prueba", correo: "", telefono: "", ubicacion: "", enlace: "", educacion: [], idiomas: ["Español"], certificaciones: [], sugeridas: [], ...o });
const CASOS = [
  { id: "electricista", cv: cv({ titular: "Electricista residencial", resumen: "Electricista con 8 años de experiencia en instalaciones y reparaciones para hogares y comercios.", experiencia: [e("Electricista", "Por cuenta propia", "01/2019 – Actualidad", "Instalé el sistema eléctrico de 40 casas\nReparé tableros y breakers\nAtendí emergencias los fines de semana"), e("Técnica electricista", "Eléctrica Sur", "02/2015 – 12/2018", "Instalé tableros en edificios de oficinas de hasta 6 pisos\nCapacité a 5 aprendices en normas de seguridad")], educacion: [e("Técnico en Electricidad", "INA", "2014", "")], habilidades: ["Tableros eléctricos", "Domótica", "Cableado estructurado", "Iluminación LED"], sugeridas: ["Paneles solares", "Lectura de planos", "Mantenimiento preventivo"] }),
    oferta: "Hotel Atenas busca Electricista de mantenimiento. Requisitos: técnico del INA, 5 años de experiencia, mantenimiento preventivo y correctivo de sistemas eléctricos, lectura de planos, disponibilidad para turnos rotativos, licencia B1. Ofrecemos estabilidad y alimentación." },
  { id: "mesero", cv: cv({ titular: "Salonero", resumen: "Salonero con experiencia en restaurantes de playa y servicio a turistas.", experiencia: [e("Salonero", "Restaurante La Ola", "03/2021 – Actualidad", "Atendía unas 12 mesas por turno\nRecomendaba platos y vinos\nCobraba y cerraba caja al final del turno"), e("Ayudante de cocina", "Soda Doña Rosa", "01/2019 – 02/2021", "Preparaba ensaladas y bocas\nLimpieza de la cocina")], habilidades: ["Servicio al cliente", "Manejo de caja", "Inglés conversacional"], idiomas: ["Español", "Inglés intermedio"], certificaciones: ["Carné de manipulación de alimentos"] }),
    oferta: "Se busca Mesero/a para hotel 4 estrellas en Tamarindo. Inglés intermedio-avanzado, experiencia mínima 2 años en restaurante, carné de manipulación de alimentos al día, conocimiento de vinos y coctelería, trabajo bajo presión, disponibilidad fines de semana." },
  { id: "cajera", cv: cv({ titular: "Cajera", resumen: "Cajera con experiencia en supermercado, rápida y ordenada con el dinero.", experiencia: [e("Cajera", "Supermercado El Ahorro", "06/2020 – Actualidad", "Cobraba a clientes en caja\nHacía cierres de caja sin faltantes\nAyudaba a acomodar producto")], educacion: [e("Bachillerato", "Liceo de Heredia", "2019", "")], habilidades: ["Manejo de efectivo", "Atención al cliente", "Datáfono"] }),
    oferta: "Farmacia Fischel contrata Cajero(a). Requisitos: bachillerato, experiencia en manejo de efectivo y datáfono, servicio al cliente, conocimientos básicos de Excel, horario rotativo. Deseable experiencia en farmacia." },
  { id: "desarrollador", cv: cv({ idioma: "en", titular: "Web developer", resumen: "Web developer building internal tools and e-commerce sites with React and Node.", experiencia: [e("Frontend developer", "Avantica", "05/2022 – Present", "Built React dashboards for a logistics client\nCut page load time by 35% by splitting bundles\nReviewed pull requests for a team of 4"), e("Junior developer", "Freelance", "01/2021 – 04/2022", "Built 6 WordPress sites for small businesses")], educacion: [e("Ingeniería en Sistemas", "Universidad Fidélitas", "2021", "")], habilidades: ["React", "TypeScript", "Node.js", "Git", "CSS"], sugeridas: ["Next.js", "PostgreSQL", "Jest"], idiomas: ["Spanish (native)", "English (B2)"] }),
    oferta: "Gorilla Logic is hiring a Mid Frontend Engineer (remote from Costa Rica). Requirements: 3+ years with React and TypeScript, experience with Next.js, testing with Jest or Testing Library, performance optimization, Agile/Scrum, B2+ English. Nice to have: GraphQL, AWS." },
  { id: "enfermera", cv: cv({ titular: "Enfermera general", resumen: "Enfermera licenciada con experiencia en hospitalización y atención de adultos mayores.", experiencia: [e("Enfermera", "Hospital San Juan de Dios", "02/2020 – Actualidad", "Atendía pacientes de medicina interna\nAplicaba tratamientos y llevaba el control de signos vitales\nApoyé la vacunación durante la pandemia"), e("Cuidadora", "Hogar de ancianos Santa Ana", "01/2018 – 01/2020", "Cuidado diario de 10 adultos mayores")], educacion: [e("Licenciatura en Enfermería", "UCR", "2019", "")], habilidades: ["Signos vitales", "Administración de medicamentos", "Curaciones"], certificaciones: ["Incorporada al Colegio de Enfermeras", "BLS"] }),
    oferta: "Clínica Bíblica requiere Enfermera(o) para área de emergencias. Requisitos: licenciatura en enfermería, incorporado al Colegio, BLS y ACLS vigentes, 2 años de experiencia hospitalaria, manejo del expediente digital, trabajo en equipo." },
  { id: "chofer", cv: cv({ titular: "Chofer", resumen: "Chofer con licencia B2 y C1, responsable y puntual.", experiencia: [e("Chofer repartidor", "Distribuidora Central", "04/2017 – Actualidad", "Repartía mercadería en la GAM\nCargaba y descargaba el camión\nLlevaba las facturas de cada entrega")], habilidades: ["Manejo defensivo", "Rutas de la GAM", "Licencia C1"], certificaciones: ["Licencia B2", "Licencia C1"] }),
    oferta: "Empresa de logística busca Chofer con licencia C1 o C2 para rutas en Guanacaste. 3 años de experiencia, manejo de documentos de entrega, uso de GPS y app de rutas, buen récord de manejo, disponibilidad para pernoctar." },
  { id: "contadora", cv: cv({ titular: "Contadora", resumen: "Contadora con experiencia en pymes y declaraciones ante Hacienda.", experiencia: [e("Asistente contable", "Despacho Rojas & Asociados", "01/2021 – Actualidad", "Llevaba la contabilidad de 15 pymes\nPreparaba declaraciones de IVA y renta en ATV\nHacía conciliaciones bancarias mensuales")], educacion: [e("Bachillerato en Contaduría", "UNA", "2020", "")], habilidades: ["NIIF", "ATV", "Conciliaciones bancarias", "Excel"], sugeridas: ["SAP", "Planillas CCSS"] }),
    oferta: "Contador(a) para empresa comercial en Heredia. Requisitos: bachiller en contaduría, incorporado al Colegio de Contadores, NIIF, manejo de TRIBU-CR y ATV, Excel avanzado, planillas CCSS e INS, cierres mensuales. Deseable SAP Business One." },
  { id: "recepcionista", cv: cv({ titular: "Recepcionista bilingüe", resumen: "Recepcionista con inglés avanzado y experiencia en oficinas y hoteles.", experiencia: [e("Recepcionista", "Hotel Boutique Sabana", "07/2022 – Actualidad", "Hacía check-in y check-out de huéspedes\nRespondía correos y reservas en inglés\nResolvía quejas de huéspedes"), e("Recepcionista", "Bufete Méndez", "01/2020 – 06/2022", "Atendía llamadas y agenda de 3 abogados")], habilidades: ["Opera PMS", "Inglés avanzado", "Atención al cliente", "Microsoft Office"], idiomas: ["Español", "Inglés avanzado (C1)"] }),
    oferta: "Recepcionista bilingüe para oficina corporativa en Escazú. Inglés C1, manejo de agenda ejecutiva, central telefónica, recepción de visitas, Microsoft Office, excelente presentación personal. Experiencia mínima 2 años." },
  { id: "soldador", cv: cv({ titular: "Soldador", resumen: "Soldador con experiencia en estructuras metálicas y portones.", experiencia: [e("Soldador", "Taller Metálicas Brenes", "03/2016 – Actualidad", "Soldaba estructuras para techos y mezzanines\nFabricaba portones y verjas a la medida\nLeía planos simples")], educacion: [e("Soldadura", "INA", "2015", "")], habilidades: ["Soldadura MIG", "Soldadura eléctrica", "Corte con oxiacetileno"] }),
    oferta: "Se necesita Soldador calificado para planta industrial en Cartago. Soldadura MIG y TIG en acero inoxidable, lectura de planos, certificación del INA, uso de equipo de protección, 3 años de experiencia." },
  { id: "maestra", cv: cv({ titular: "Docente de primaria", resumen: "Maestra de primaria con experiencia en escuelas públicas y tutorías.", experiencia: [e("Docente de I y II ciclo", "Escuela República de Chile", "02/2018 – Actualidad", "Daba clases a grupos de 28 estudiantes\nPreparaba planeamientos según el programa del MEP\nOrganizaba la feria científica de la escuela"), e("Tutora", "Por cuenta propia", "01/2016 – 12/2017", "Tutorías de matemáticas y español")], educacion: [e("Licenciatura en Educación Primaria", "UNED", "2017", "")], habilidades: ["Planeamiento didáctico", "Evaluación", "Adecuaciones curriculares"] }),
    oferta: "Colegio privado bilingüe busca Maestra de primaria para segundo grado. Licenciatura en educación primaria, inglés intermedio, experiencia con adecuaciones curriculares, uso de plataformas virtuales (Google Classroom), metodologías activas." },
].slice(0, N_CASOS);

// ── El Worker temporal ──
let url = arg("url", "");
let hijo = null;
let carpeta = null;
if (!url) {
  carpeta = mkdtempSync(path.join(tmpdir(), "ccr-cv-ai-eval-"));
  writeFileSync(path.join(carpeta, "wrangler.jsonc"), JSON.stringify({ name: "ccr-cv-ai-eval-local", main: "index.js", compatibility_date: "2026-11-01", ai: { binding: "AI" } }));
  writeFileSync(path.join(carpeta, "index.js"), `export default { async fetch(req, env) { const { model, body } = await req.json(); try { return Response.json({ ok: true, out: await env.AI.run(model, body) }); } catch (e) { return Response.json({ ok: false, error: String(e?.message || e) }, { status: 500 }); } } };`);
  hijo = spawn("npx", ["wrangler", "dev", "--port", "8798", "--ip", "127.0.0.1"], { cwd: carpeta, stdio: ["ignore", "pipe", "pipe"] });
  await new Promise((ok, mal) => {
    const t = setTimeout(() => mal(new Error("wrangler dev no arrancó en 90 s (¿sesión de wrangler iniciada?)")), 90_000);
    hijo.stdout.on("data", (d) => { if (/Ready on/.test(String(d))) { clearTimeout(t); ok(); } });
  });
  url = "http://127.0.0.1:8798";
}
const cerrar = () => { if (hijo) hijo.kill("SIGTERM"); if (carpeta) rmSync(carpeta, { recursive: true, force: true }); };
process.on("exit", cerrar);

async function llamar(modelo, { system, user }, maxTokens) {
  const t = Date.now();
  const res = await fetch(url, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ model: modelo, body: { messages: [{ role: "system", content: system }, { role: "user", content: user }], max_tokens: maxTokens, temperature: 0.3, response_format: { type: "json_object" } } }) });
  const d = await res.json();
  const out = d.out ?? {};
  const contenido = out.choices?.[0]?.message?.content ?? out.response ?? null;
  return { ms: Date.now() - t, json: ia.leerJson(contenido), neuronas: Number(out.usage?.neurons) || 0, tokens: out.usage ?? {}, error: d.error };
}

const filas = [];
const muestras = {};
for (const modelo of MODELOS) {
  const m = { modelo, casos: 0, jsonOk: 0, sugerencias: 0, descartadas: 0, preguntas: 0, cobAntes: 0, cobDespues: 0, cartaOk: 0, cartaDescartadas: 0, ms: 0, neuronasAdaptar: 0, neuronasCarta: 0 };
  muestras[modelo] = [];
  for (const caso of CASOS) {
    const f = ia.cvParaIa(caso.cv);
    const a = await llamar(modelo, ia.promptAdaptar(f, caso.oferta), 4000);
    const ad = ia.validarAdaptacion(a.json, f);
    m.casos++; m.ms += a.ms; m.neuronasAdaptar += a.neuronas;
    m.cobAntes += ia.palabrasClave(caso.oferta, caso.cv).puntaje;
    if (ad) {
      m.jsonOk++; m.sugerencias += ad.sugerencias.length; m.descartadas += ad.descartadas; m.preguntas += ad.preguntas.length;
      m.cobDespues += ia.palabrasClave(caso.oferta, ia.aplicarSugerencias(caso.cv, ad.sugerencias)).puntaje;
    } else {
      m.cobDespues += ia.palabrasClave(caso.oferta, caso.cv).puntaje;
      if (a.error) console.error(`  ${modelo} ${caso.id}: ${a.error.slice(0, 160)}`);
    }
    const datos = { puesto: "", empresa: "", destinatario: "" };
    const c = await llamar(modelo, ia.promptCarta(f, caso.oferta, datos), 3000);
    const ca = ia.validarCarta(c.json, f, caso.oferta, datos);
    m.neuronasCarta += c.neuronas;
    if (ca) { m.cartaOk++; m.cartaDescartadas += ca.descartadas; }
    if (muestras[modelo].length < 2 && ad) muestras[modelo].push({ caso: caso.id, ad, carta: ca?.carta });
    process.stdout.write(".");
  }
  filas.push(m);
}
process.stdout.write("\n\n");

console.log("| Modelo | JSON ok | Sugerencias | Descartadas por inventar | Preguntas | Palabras clave antes → después | Carta ok | Párrafos de carta descartados | s por CV | USD por CV + carta |");
console.log("|---|---|---|---|---|---|---|---|---|---|");
for (const m of filas) {
  const n = m.casos;
  const usd = ((m.neuronasAdaptar + m.neuronasCarta) / n) * NEURONA_USD;
  console.log(`| ${m.modelo} | ${m.jsonOk}/${n} | ${m.sugerencias} | ${m.descartadas} | ${m.preguntas} | ${Math.round(m.cobAntes / n)} % → ${Math.round(m.cobDespues / n)} % | ${m.cartaOk}/${n} | ${m.cartaDescartadas} | ${(m.ms / n / 1000).toFixed(1)} | ${usd.toFixed(4)} (${Math.round((m.neuronasAdaptar + m.neuronasCarta) / n)} neuronas) |`);
}
for (const [modelo, lista] of Object.entries(muestras)) {
  console.log(`\n===== ${modelo} =====`);
  for (const s of lista) {
    console.log(`\n--- ${s.caso}`);
    for (const x of s.ad.sugerencias) {
      if (x.tipo === "titular" || x.tipo === "resumen") console.log(`[${x.tipo}] ${x.despues}`);
      else if (x.tipo === "logros") console.log(`[logros ${x.titulo}]\n  - ${x.despues.join("\n  - ")}`);
      else console.log(`[habilidades] ${x.despues.join(", ")}`);
    }
    if (s.ad.preguntas.length) console.log(`[preguntas] ${s.ad.preguntas.join(" | ")}`);
    if (s.carta) console.log(`[carta] ${s.carta.apertura} ${s.carta.porQueEncajo} ${s.carta.porQueLaEmpresa} ${s.carta.cierre}`);
  }
}
cerrar();
process.exit(0);
