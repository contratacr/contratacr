#!/usr/bin/env node
/**
 * Un nombre por sección, en todo el app.
 *
 * Las secciones se han renombrado varias veces (Ofertas → Promociones,
 * trabajos/portafolio → Casos de éxito, Postulaciones → Mis postulaciones) y
 * cada vez quedaban rótulos viejos regados: el paso «Agrega trabajos» dentro de
 * «Completa tu perfil» seguía nombrando una sección que ya se llamaba «Casos de
 * éxito», y el asistente mandaba a una pestaña «Ofertas» que no existe.
 *
 * Esto NO prohíbe palabras: prohíbe FRASES donde la palabra está nombrando una
 * sección. «Lugares de trabajo», «trabajo bien hecho» o «la promoción vence el
 * viernes» pasan sin problema.
 *
 * Además ataja el destrozo de un buscar-y-reemplazar global: en inglés «offer»
 * es también el VERBO («Offer my services»), y un reemplazo a «promotion» dejó
 * 52 claves en inglés agramatical, incluido el botón principal de la barra.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const RAIZ = new URL("../..", import.meta.url).pathname.replace(/\/$/, "");

const PROHIBIDO = [
  // ── Promociones (antes «Ofertas») ──────────────────────────────────────────
  { re: /pesta(ñ|n)a\s+Ofertas/iu, dice: "pestaña Ofertas", usa: "pestaña Promociones" },
  { re: /secci(ó|o)n\s+Ofertas/iu, dice: "sección Ofertas", usa: "sección Promociones" },
  { re: /Publicar\s+oferta\b/iu, dice: "Publicar oferta", usa: "Publicar promoción" },
  { re: /\bMis\s+ofertas\b/iu, dice: "Mis ofertas", usa: "Mis promociones" },
  { re: /\bOffers\s+tab\b/iu, dice: "Offers tab", usa: "Promotions tab" },
  { re: /\b(Publish|Post)\s+(an\s+)?offer\b/iu, dice: "Publish/Post offer", usa: "Publish/Post promotion" },
  { re: /\bMy\s+offers\b/iu, dice: "My offers", usa: "My promotions" },
  { re: /\bEdit\s+offer\b/iu, dice: "Edit offer", usa: "Edit promotion" },

  // ── Casos de éxito (antes «trabajos» o «portafolio») ───────────────────────
  { re: /\bMis\s+trabajos\b/iu, dice: "Mis trabajos", usa: "Casos de éxito" },
  { re: /Agrega\s+trabajos\b/iu, dice: "Agrega trabajos", usa: "Agrega casos de éxito" },
  { re: /\btrabajos\s+anteriores\b/iu, dice: "trabajos anteriores", usa: "casos de éxito" },
  { re: /\bfotos\s+de\s+trabajos\b/iu, dice: "fotos de trabajos", usa: "fotos de casos de éxito" },
  { re: /\bportafolio\b/iu, dice: "portafolio", usa: "casos de éxito" },
  { re: /\bportfolio\b/iu, dice: "portfolio", usa: "success stories" },
  { re: /\bprevious\s+jobs\b/iu, dice: "previous jobs", usa: "success stories" },
  { re: /\bjobs\s+done\b/iu, dice: "jobs done", usa: "success stories" },

  // ── Mis postulaciones ──────────────────────────────────────────────────────
  { re: /pesta(ñ|n)a\s+Postulaciones/iu, dice: "pestaña Postulaciones", usa: "pestaña Mis postulaciones" },
  { re: /(?<!My\s)\bApplications\s+tab\b/iu, dice: "Applications tab", usa: "My applications tab" },

  // ── «offer» es VERBO en inglés: no se reemplaza por «promotion» ────────────
  { re: /\b(Promotion|promotion)\s+(my|your)\s+services\b/u, dice: "«Promotion my/your services»", usa: "Offer my/your services" },
  { re: /\b(you|You|I|we|they|To|to)\s+promotion\b/u, dice: "«… promotion …» de verbo", usa: "offer" },
  { re: /\bDo\s+you\s+promotion\b/iu, dice: "«Do you promotion»", usa: "Do you offer" },
  { re: /\ban\s+promotion\b/iu, dice: "«an promotion»", usa: "a promotion" },
];

// Nombres internos: columnas, rutas de API, carpetas de Cloudinary, props. No
// son rótulos y renombrarlos rompería la base y los enlaces publicados.
const PERMITIDO = [
  /portfolio_urls|portfolio_items|portfolioCount|portfolioLike|portfolio-like|portfolioItems/u,
  /\/promociones\b|"offers"|'offers'|`offers`|offer_type|OFFER_|offerId|offersEnabled/u,
  /data-portfolio|portfolio\.(webp|png|jpg)/u,
  // Carpeta de Cloudinary y el valor del campo `type` de la subida: cambiarlos
  // desconectaría las imágenes ya subidas.
  /contratacr\/portfolio|"portfolio"|'portfolio'/u,
  // El portafolio o sitio que adjunta QUIEN SE POSTULA a un empleo: es suyo, no
  // es la sección «Casos de éxito» del perfil profesional.
  /sitio o portafolio|site or portfolio/u,
];

const EXTENSIONES = new Set([".ts", ".tsx", ".json"]);
const SALTAR = new Set(["node_modules", ".next", ".git", "test-results", "playwright-report", "dist", "coverage", "supabase"]);

function* archivos(dir) {
  for (const nombre of readdirSync(dir)) {
    if (SALTAR.has(nombre)) continue;
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) yield* archivos(ruta);
    else if (EXTENSIONES.has(ruta.slice(ruta.lastIndexOf(".")))) yield ruta;
  }
}

const fallos = [];
const mirar = [join(RAIZ, "src"), join(RAIZ, "messages")];
for (const base of mirar) {
  for (const ruta of archivos(base)) {
    const lineas = readFileSync(ruta, "utf8").split("\n");
    lineas.forEach((linea, i) => {
      if (PERMITIDO.some((re) => re.test(linea))) return;
      // Los comentarios explican el código; no los lee nadie desde el app.
      const limpia = linea.trim();
      if (limpia.startsWith("//") || limpia.startsWith("*") || limpia.startsWith("/*")) return;
      // Solo importa lo que va DENTRO de comillas: un rótulo. Fuera de
      // comillas solo hay nombres de variables, rutas y llaves de objeto.
      const enComillas = linea.match(/"[^"]*"|'[^']*'|`[^`]*`/gu);
      if (!enComillas) return;
      linea = enComillas.join(" ");
      for (const regla of PROHIBIDO) {
        if (regla.re.test(linea)) {
          fallos.push({ archivo: relative(RAIZ, ruta), linea: i + 1, texto: linea.trim().slice(0, 110), regla });
        }
      }
    });
  }
}

if (fallos.length === 0) {
  console.log("Vocabulario: un nombre por sección en todo el app.");
  process.exit(0);
}

console.error(`\nNombres viejos encontrados: ${fallos.length}\n`);
for (const f of fallos) {
  console.error(`  ${f.archivo}:${f.linea}`);
  console.error(`    dice «${f.regla.dice}» → debe decir «${f.regla.usa}»`);
  console.error(`    ${f.texto}\n`);
}
console.error("Si alguno es un nombre interno (columna, ruta de API, prop) y no un rótulo,");
console.error("agrégalo a PERMITIDO en scripts/ci/verify-vocabulario.mjs con el porqué.\n");
process.exit(1);
