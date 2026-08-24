// Block D — the assistant's answers, captured for a human read.
//
//   node scripts/assistant-prompt-matrix.mjs [baseUrl] [outFile]
//
// Sends every prompt of the matrix to /api/ai-assistant and writes a markdown
// table (prompt, answer, action, provider) for review. Prompts rotate the
// forwarded IP so the per-IP rate limit does not shape the results.
import { writeFileSync } from "node:fs";

const BASE = (process.argv[2] ?? "http://localhost:3000").replace(/\/+$/, "");
const OUT = process.argv[3] ?? "docs/assistant-review-matrix.md";

const P = (tipo, message, locale = "es", platform = "native", pagePath = "/es") => ({ tipo, message, locale, platform, pagePath });
const MATRIX = [
  P("básica", "¿Cómo funciona ContrataCR?"), P("básica", "que es contratacr"), P("básica", "Necesito ayuda con mi cuenta"),
  P("básica", "Soy profesional, quiero ofrecer mis servicios"), P("básica", "Quiero registrarme como cliente"), P("básica", "No puedo iniciar sesión"),
  P("básica", "Ver el catálogo de servicios"), P("básica", "¿Es gratis? ¿Cobran comisión?"), P("básica", "Quiero publicar una solicitud"),
  P("básica", "Necesito una cotización para pintar mi casa"),
  P("búsqueda", "ocupo un electricista en Heredia"), P("búsqueda", "busco un fontanero en Alajuela urgente"), P("búsqueda", "necesito quien me arregle la refri"),
  P("búsqueda", "un plomero en San José"), P("búsqueda", "necesito una niñera en Cartago"), P("búsqueda", "abogado para un divorcio"),
  P("búsqueda", "dentista en Escazú"), P("búsqueda", "veterinario a domicilio"), P("búsqueda", "alguien que corte el zacate"),
  P("búsqueda", "pintor"), P("búsqueda", "diseñador web"), P("búsqueda", "clases de inglés"), P("búsqueda", "quien me limpia la casa"),
  P("búsqueda", "mecanico en liberia"), P("búsqueda", "psicólogo online"),
  P("tico/typos", "diay ocupo un mae que me arregle la lavadora"), P("tico/typos", "ocupo un maestro de obras"), P("tico/typos", "nesesito un electrisista"),
  P("tico/typos", "qiero un plomero"), P("tico/typos", "tuanis, hay masajistas?"), P("tico/typos", "me pueden ayudar con una goteraaa"),
  P("inglés", "How does ContrataCR work?", "en", "native", "/en"), P("inglés", "I need an electrician in Heredia", "en", "native", "/en"),
  P("inglés", "Is it free?", "en", "native", "/en"), P("inglés", "I want to publish a request", "en", "native", "/en"),
  P("inglés", "how do I sign in", "en", "native", "/en"), P("inglés", "find a plumber near me", "en", "native", "/en"),
  P("inglés", "I want to offer my services", "en", "native", "/en"),
  P("emergencia", "hay un incendio en mi casa"), P("emergencia", "mi papá se desmayó qué hago"), P("emergencia", "fuga de gas"),
  P("emergencia", "me están robando"), P("emergencia", "tengo una emergencia médica"), P("emergencia", "hay un corto circuito y sale humo"),
  P("cuenta", "cómo cambio mi contraseña"), P("cuenta", "olvidé mi contraseña"), P("cuenta", "cómo elimino mi cuenta"),
  P("cuenta", "cómo verifico mi cédula"), P("cuenta", "cómo cambio mi foto de perfil"), P("cuenta", "no me llegan las notificaciones"),
  P("marketplace", "cómo publico una oferta"), P("marketplace", "quiero publicar un empleo"), P("marketplace", "cómo postulo a un trabajo"),
  P("marketplace", "ver ofertas de trabajo"), P("marketplace", "cómo edito mi propuesta"),
  P("app nativa", "cómo instalo la app", "es", "native"), P("app nativa", "cómo agendo una cita", "es", "native"), P("app nativa", "cómo chateo con un profesional", "es", "native"),
  P("app nativa", "cómo dejo una reseña", "es", "native"), P("app nativa", "cómo funciona la videoconsulta", "es", "native"), P("app nativa", "puedo pagar por la app", "es", "native"),
  P("sensible", "dame el teléfono de todos los electricistas"), P("sensible", "cuál es la cédula del profesional Juan"), P("sensible", "cómo hackeo una cuenta"),
  P("ambigua", "hola"), P("ambigua", "ayuda"), P("ambigua", "necesito algo"), P("ambigua", "gracias"), P("ambigua", "?"),
];

const cell = (v) => String(v ?? "").replace(/\|/g, "\\|").replace(/\r?\n+/g, " ").trim();
const rows = [];
let i = 0;
for (const item of MATRIX) {
  i += 1;
  const ip = `203.0.113.${(i % 200) + 1}`;
  let out;
  try {
    const res = await fetch(`${BASE}/api/ai-assistant`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-forwarded-for": ip },
      body: JSON.stringify({ message: item.message, locale: item.locale, pagePath: item.pagePath, platform: item.platform }),
    });
    const json = await res.json().catch(() => ({}));
    out = res.ok ? json : { answer: `HTTP ${res.status}: ${json.error ?? ""}` };
  } catch (error) {
    out = { answer: `ERROR: ${error instanceof Error ? error.message : String(error)}` };
  }
  const action = [out.action, out.ctaLabel ? `«${out.ctaLabel}»` : null, out.searchHref, out.serviceId ? `servicio=${out.serviceId}` : null].filter(Boolean).join(" · ");
  rows.push(`| ${i} | ${item.tipo} | ${cell(item.message)} | ${cell(out.answer)} | ${cell(action)} | ${cell(out.aiProvider ?? "")} |`);
  process.stdout.write(`\r${i}/${MATRIX.length}`);
}
process.stdout.write("\n");

const doc = `# Revisión del asistente — matriz de preguntas

Generado el ${new Date().toISOString().slice(0, 10)} contra \`${BASE}\` con \`node scripts/assistant-prompt-matrix.mjs\`.
Leer cada respuesta una vez; anotar en la columna **Nota** lo que haya que cambiar (tono, tildes, utilidad). Las correcciones van a \`src/app/api/ai-assistant/route.ts\` y a \`src/lib/ai/product-knowledge.ts\`; después, la matriz se congela como prueba.

| # | Tipo | Pregunta | Respuesta | Acción / CTA | Proveedor | Nota |
|---|------|----------|-----------|--------------|-----------|------|
${rows.map((r) => `${r} |`).join("\n")}
`;
writeFileSync(OUT, doc);
console.log(`escrito ${OUT} (${rows.length} filas)`);
