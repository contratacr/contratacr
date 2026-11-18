#!/usr/bin/env node
// npm audit de dependencias de producción: falla con cualquier aviso high o
// critical, salvo los de la lista de abajo. Cada excepción lleva el motivo y
// una fecha de vencimiento: pasada esa fecha deja de valer y el check vuelve a
// fallar hasta que alguien la revise.
import { spawnSync } from "node:child_process";

const excepciones = [
  {
    id: "GHSA-fc5q-39xc-vjpf",
    paquete: "picomatch",
    vence: "2026-12-15",
    motivo:
      "ReDoS con extglobs. Desde el 17-nov-2026 el aviso marca todas las versiones y no hay arreglo. " +
      "Solo llega por next-intl -> @parcel/watcher, el vigilante de archivos del extractor de mensajes " +
      "en desarrollo; los patrones los fija el proyecto, ninguna entrada de usuarios llega ahí.",
  },
];

const hoy = new Date().toISOString().slice(0, 10);
const vigentes = new Map(excepciones.filter((e) => e.vence >= hoy).map((e) => [e.id, e]));
for (const e of excepciones) if (e.vence < hoy) console.error(`Excepción vencida (${e.vence}): ${e.id} en ${e.paquete}. Revisala.`);

const r = spawnSync("npm", ["audit", "--omit=dev", "--json"], { encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
let informe;
try { informe = JSON.parse(r.stdout); } catch {
  console.error("No se pudo leer la salida de npm audit.");
  console.error(r.stderr || r.stdout);
  process.exit(1);
}
if (informe.error) { console.error("npm audit falló:", JSON.stringify(informe.error)); process.exit(1); }

const graves = new Map();
const ignorados = new Map();
for (const [paquete, v] of Object.entries(informe.vulnerabilities ?? {})) {
  for (const via of v.via ?? []) {
    if (typeof via !== "object" || !["high", "critical"].includes(via.severity)) continue;
    const id = String(via.url ?? "").split("/").pop() || String(via.source);
    const destino = vigentes.has(id) ? ignorados : graves;
    destino.set(`${id} ${paquete}`, `${via.severity} ${paquete} ${via.range ?? ""} ${via.title ?? ""} ${via.url ?? ""}`.trim());
  }
}

for (const [, linea] of ignorados) console.log(`Excepción revisada: ${linea}`);
if (graves.size > 0) {
  console.error(`${graves.size} aviso(s) high/critical en dependencias de producción:`);
  for (const [, linea] of graves) console.error(`- ${linea}`);
  process.exit(1);
}
console.log("Audit high/critical: sin avisos pendientes.");
