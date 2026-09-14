/**
 * El vistazo a producción.
 *
 * No prueba el app: comprueba que está EN PIE y que la base sigue contestando.
 * Cada pantalla trae una marca que solo aparece si el dato llegó de verdad, así
 * que una página que responde 200 pero vacía —el caso de una llave vencida o
 * una base caída— cuenta como caída, que es justo lo que se quiere saber.
 *
 * Se ejecuta con `node scripts/ci/vigilar-produccion.mjs [url-base]`.
 * Sale con 1 si algo falla, y el flujo de GitHub avisa por Telegram y correo.
 */

const base = (process.argv[2] || process.env.APP_URL || "https://www.contratacr.com").replace(/\/$/, "");
const LENTO_MS = Number(process.env.VIGILANCIA_LENTO_MS || 6000);

const pruebas = [
  {
    nombre: "Portada",
    ruta: "/es",
    // La portada es estática: basta con que pinte su propio nombre.
    revisar: (texto) => texto.includes("ContrataCR"),
    queFalta: "el nombre del sitio",
  },
  {
    nombre: "Buscar",
    ruta: "/es/buscar",
    // Este es el que importa: el conteo sale de Supabase. Si dice cero, o la
    // base no contestó o las fichas dejaron de ser públicas.
    revisar: (texto) => {
      const conteo = texto.match(/([\d.,]+)\s+profesionales/);
      if (!conteo) return false;
      return Number(conteo[1].replace(/[.,]/g, "")) > 0;
    },
    queFalta: "profesionales en los resultados (la base no contestó o las fichas dejaron de ser públicas)",
  },
  {
    nombre: "Servicios",
    ruta: "/es/servicios",
    revisar: (texto) => texto.includes("ContrataCR"),
    queFalta: "el contenido de la página",
  },
  {
    nombre: "Mapa del sitio",
    ruta: "/sitemap.xml",
    // Sin esto Google deja de encontrar las fichas nuevas y no hay señal
    // ninguna de que algo se rompió.
    revisar: (texto) => texto.includes("<urlset") && texto.includes("/profesionales/"),
    queFalta: "las fichas dentro del mapa del sitio",
  },
  {
    nombre: "Salud",
    ruta: "/api/health",
    // Delata una llave que se venció o un despliegue al que le falta una
    // variable, que por fuera se ve igual que una base caída.
    revisar: (texto) => {
      try {
        const salud = JSON.parse(texto);
        return salud.status === "ok"
          && salud.supabase?.url === true
          && salud.supabase?.anonKey === true
          && salud.supabase?.serviceKey === true;
      } catch {
        return false;
      }
    },
    queFalta: "alguna llave de Supabase en el servidor",
  },
];

async function mirar(prueba) {
  const url = `${base}${prueba.ruta}`;
  const arranque = Date.now();
  try {
    const respuesta = await fetch(url, {
      headers: { "user-agent": "ContrataCR-vigilancia/1.0", "cache-control": "no-cache" },
      signal: AbortSignal.timeout(25_000),
    });
    const tardo = Date.now() - arranque;
    if (!respuesta.ok) {
      return { prueba, bien: false, tardo, detalle: `respondió ${respuesta.status}` };
    }
    const texto = await respuesta.text();
    if (!prueba.revisar(texto)) {
      return { prueba, bien: false, tardo, detalle: `respondió 200 pero falta ${prueba.queFalta}` };
    }
    return { prueba, bien: true, tardo, lento: tardo > LENTO_MS };
  } catch (error) {
    return { prueba, bien: false, tardo: Date.now() - arranque, detalle: `no respondió (${error?.name || error})` };
  }
}

const resultados = [];
for (const prueba of pruebas) {
  // De a una: cinco peticiones simultáneas contra el propio sitio no prueban
  // nada distinto y sí se parecen a un pico de tráfico.
  resultados.push(await mirar(prueba));
}

const caidas = resultados.filter((r) => !r.bien);
const lentas = resultados.filter((r) => r.bien && r.lento);

for (const r of resultados) {
  const marca = r.bien ? (r.lento ? "LENTO" : "bien") : "CAÍDO";
  console.log(`${marca.padEnd(5)} ${r.prueba.nombre.padEnd(16)} ${String(r.tardo).padStart(5)} ms  ${r.detalle ?? ""}`.trimEnd());
}

const resumen = caidas.length
  ? `🔴 ContrataCR: ${caidas.map((r) => `${r.prueba.nombre} ${r.detalle}`).join("; ")}`
  : lentas.length
    ? `🟡 ContrataCR responde pero lento: ${lentas.map((r) => `${r.prueba.nombre} ${r.tardo} ms`).join("; ")}`
    : "🟢 ContrataCR en pie";

console.log(`\n${resumen}`);

if (process.env.GITHUB_OUTPUT) {
  const { appendFileSync } = await import("node:fs");
  appendFileSync(process.env.GITHUB_OUTPUT, `estado=${caidas.length ? "caido" : lentas.length ? "lento" : "bien"}\n`);
  appendFileSync(process.env.GITHUB_OUTPUT, `resumen=${resumen.replace(/\n/g, " ")}\n`);
}

// Lento no es caído: avisa, pero no despierta a nadie.
process.exit(caidas.length ? 1 : 0);
