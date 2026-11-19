import { expect, test } from "playwright/test";
import sharp from "sharp";
import { scanMetadata } from "../../src/lib/directory/photo-pipeline";
import { E2E_USERS } from "./seed";
import { loginAs } from "./helpers";

// Privacidad: una foto de perfil con GPS en su EXIF (p. ej. tomada en la casa de quien la sube)
// debe guardarse SIN GPS. La prueba sube un JPEG real con GPS por /api/upload/photo, descarga el
// objeto que quedó guardado y lo revisa localmente. Necesita almacenamiento de imágenes (R2 o
// Cloudinary); sin él la ruta responde 503 y la prueba se omite con el motivo.

const GPS_EXIF = {
  IFD0: { Artist: "Nombre del Cliente", Make: "FixtureCam" },
  IFD3: { GPSLatitudeRef: "N", GPSLatitude: "9/1 56/1 1234/100", GPSLongitudeRef: "W", GPSLongitude: "84/1 5/1 678/100" },
};

/** true si el bloque EXIF (TIFF) tiene puntero GPS (tag 0x8825) en IFD0. */
function exifHasGpsPointer(exif: Buffer | undefined): boolean {
  if (!exif) return false;
  const tiff = exif.subarray(0, 6).toString("latin1") === "Exif\0\0" ? exif.subarray(6) : exif;
  if (tiff.length < 8) return false;
  const le = tiff.toString("latin1", 0, 2) === "II";
  const u16 = (o: number) => (le ? tiff.readUInt16LE(o) : tiff.readUInt16BE(o));
  const u32 = (o: number) => (le ? tiff.readUInt32LE(o) : tiff.readUInt32BE(o));
  const ifd0 = u32(4);
  if (ifd0 + 2 > tiff.length) return false;
  const count = u16(ifd0);
  for (let i = 0; i < count; i += 1) {
    const entry = ifd0 + 2 + i * 12;
    if (entry + 12 > tiff.length) break;
    if (u16(entry) === 0x8825) return true;
  }
  return false;
}

test("la foto de perfil con GPS en EXIF se guarda sin GPS", async ({ page }) => {
  await loginAs(page, E2E_USERS.professional.email, E2E_USERS.professional.password);

  const original = await sharp({ create: { width: 64, height: 48, channels: 3, background: { r: 200, g: 40, b: 40 } } })
    .withExif(GPS_EXIF)
    .jpeg({ quality: 90 })
    .toBuffer();
  // Precondición: el archivo de prueba de verdad lleva GPS.
  expect(scanMetadata(new Uint8Array(original))).toContain("gps");
  expect(exifHasGpsPointer((await sharp(original).metadata()).exif)).toBe(true);

  const upload = await page.request.post("/api/upload/photo", {
    multipart: {
      type: "avatar",
      file: { name: "perfil-con-gps.jpg", mimeType: "image/jpeg", buffer: original },
    },
  });
  test.skip(upload.status() === 503, "Sin almacenamiento de imágenes (R2/Cloudinary) en este entorno.");
  expect(upload.status(), await upload.text()).toBe(200);
  const { url } = (await upload.json()) as { url: string };
  expect(url).toBeTruthy();

  try {
    const download = await fetch(url);
    expect(download.status).toBe(200);
    const stored = Buffer.from(await download.arrayBuffer());

    // El objeto guardado sigue siendo una imagen válida…
    const meta = await sharp(stored).metadata();
    expect(meta.width).toBeGreaterThan(0);
    // …pero sin GPS ni datos personales, según el escáner independiente y un parseo propio del EXIF.
    expect(scanMetadata(new Uint8Array(stored))).not.toContain("gps");
    expect(exifHasGpsPointer(meta.exif)).toBe(false);
    for (const leak of ["Nombre del Cliente", "FixtureCam"]) {
      expect(stored.includes(Buffer.from(leak, "latin1")), leak).toBe(false);
    }
  } finally {
    // Limpieza: borrar el objeto subido (el registro de propiedad incluido) sin afectar la prueba.
    await page.request.delete("/api/upload/media", { data: { url } }).catch(() => undefined);
  }
});
