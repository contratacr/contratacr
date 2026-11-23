import { readFileSync } from "node:fs";
import { inflateSync } from "node:zlib";
import { expect, test } from "playwright/test";
import { lineasEquilibradas } from "../../src/lib/seo/tarjeta-de-marca";

/**
 * LA IMAGEN AL COMPARTIR UN ENLACE NO PUEDE SALIR EN BLANCO (21-nov-2026).
 * Un solo carácter cambiado en el base64 del símbolo de `src/lib/og-logos.ts`
 * dejó el PNG dañado; el dibujante de imágenes no avisa: pinta un lienzo
 * blanco de ~4 KB y WhatsApp y Facebook mostraban un recuadro vacío. Estas
 * pruebas lo atrapan por dos lados: el archivo de logos y las imágenes reales.
 */

function crc32(bytes: Uint8Array) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < bytes.length; n++) {
    c = (crc ^ bytes[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Valida un PNG como lo haría un lector estricto: firma, CRC de cada bloque y datos que descomprimen al tamaño exacto. */
function validarPng(base64: string) {
  const bytes = Buffer.from(base64, "base64");
  expect(bytes.subarray(0, 8).toString("hex")).toBe("89504e470d0a1a0a");
  let pos = 8, ancho = 0, alto = 0, tipoColor = 0, entrelazado = 0;
  const datos: Buffer[] = [];
  while (pos < bytes.length) {
    const largo = bytes.readUInt32BE(pos);
    const tipo = bytes.subarray(pos + 4, pos + 8).toString("latin1");
    const cuerpo = bytes.subarray(pos + 8, pos + 8 + largo);
    expect(bytes.readUInt32BE(pos + 8 + largo), `CRC del bloque ${tipo}`).toBe(crc32(bytes.subarray(pos + 4, pos + 8 + largo)));
    if (tipo === "IHDR") { ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4); tipoColor = cuerpo[9]; entrelazado = cuerpo[12]; }
    if (tipo === "IDAT") datos.push(cuerpo);
    pos += 12 + largo;
    if (tipo === "IEND") break;
  }
  expect(tipoColor).toBe(6); expect(entrelazado).toBe(0);
  expect(inflateSync(Buffer.concat(datos)).length, "los datos de imagen deben descomprimir completos").toBe(alto * (1 + ancho * 4));
  return { ancho, alto };
}

test("los logos de la tarjeta (símbolo y nombre) son PNG íntegros", () => {
  const fuente = readFileSync("src/lib/og-logos.ts", "utf8");
  for (const nombre of ["LOGO_SIMBOLO", "LOGO_PALABRA"]) {
    const m = new RegExp(`${nombre} = "data:image/png;base64,([^"]+)"`).exec(fuente);
    expect(m, nombre).not.toBeNull();
    const { ancho, alto } = validarPng(m![1]);
    expect(ancho, nombre).toBeGreaterThan(100); expect(alto, nombre).toBeGreaterThan(100);
  }
});

const RUTAS = [
  "/es/opengraph-image", "/en/opengraph-image",
  "/es/profesionales/opengraph-image", "/en/profesionales/opengraph-image",
  "/es/empleos/opengraph-image", "/es/promociones/opengraph-image", "/es/solicitudes/opengraph-image",
  "/es/cotizar/opengraph-image", "/es/publicar-solicitud/opengraph-image",
];

test("toda imagen de vista previa es un PNG de 1200x630 con contenido, no un lienzo en blanco", async ({ request, baseURL }) => {
  test.skip(/127\.0\.0\.1:9\b/.test(baseURL ?? ""), "necesita el servidor; corre en CI");
  for (const ruta of RUTAS) {
    const res = await request.get(ruta);
    expect(res.status(), ruta).toBe(200);
    expect(res.headers()["content-type"], ruta).toContain("image/png");
    const cuerpo = await res.body();
    expect(cuerpo.length, `${ruta}: una tarjeta en blanco pesa ~4 KB`).toBeGreaterThan(20_000);
    expect(cuerpo.length, `${ruta}: debe ser liviana`).toBeLessThan(300_000);
    expect(cuerpo.readUInt32BE(16), ruta).toBe(1200);
    expect(cuerpo.readUInt32BE(20), ruta).toBe(630);
  }
});

test("el texto de la tarjeta se reparte en líneas parejas, sin una palabra sola abajo", () => {
  const promesa = lineasEquilibradas("Encuentre y ofrezca servicios en Costa Rica", 52);
  expect(promesa.join(" ")).toBe("Encuentre y ofrezca servicios en Costa Rica");
  expect(promesa.length).toBeLessThanOrEqual(3);
  expect(promesa.at(-1)!.length, "la última línea no puede ser una palabra suelta").toBeGreaterThan(7);
  for (const corto of ["Vacantes en Costa Rica", "Solicitudes en Costa Rica", "Cotizaciones en minutos", "Find and offer services in Costa Rica"]) {
    const lineas = lineasEquilibradas(corto, corto.length > 34 ? 52 : 62);
    expect(lineas.join(" ")).toBe(corto);
    expect(lineas.length, corto).toBeLessThanOrEqual(3);
    if (lineas.length > 1) expect(Math.max(...lineas.map((l) => l.length)) - Math.min(...lineas.map((l) => l.length)), corto).toBeLessThanOrEqual(10);
  }
});
