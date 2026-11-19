import { scanUpload } from "@/lib/moderation/files";
import { NextResponse } from "next/server";
import { mensajeDeError } from "@/lib/api-errors";
import { v2 as cloudinary } from "cloudinary";
import { validateUpload, IMAGE_KINDS, MIME_FOR, type FileKind } from "@/lib/upload-validation";
import { enforceRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { recordCloudinaryAsset, recordMediaAsset } from "@/lib/cloudinary-ownership";
import { isR2Configured, uploadR2Object } from "@/lib/r2-storage";
import { stripFailureText, stripImageMetadata, verifyStripped } from "@/lib/media/strip-image-metadata";
import { scanMetadata } from "@/lib/directory/photo-pipeline";

export const runtime = "nodejs";

const EXTENSION_FOR: Record<FileKind, string> = {
  jpeg: "jpg",
  png: "png",
  webp: "webp",
  avif: "avif",
  gif: "gif",
  heic: "heic",
  heif: "heif",
  pdf: "pdf",
};

export async function POST(req: Request) {
  const rl = await enforceRateLimit(req, "upload-photo", 12, 60_000);
  if (rl) return rl;

  const user = await safeGetUser(await createClient());
  if (!user) return NextResponse.json({ error: mensajeDeError(req, { es: "Inicie sesión para subir imágenes.", en: "Sign in to upload images." }) }, { status: 401 });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: mensajeDeError(req, { es: "No se recibió ningún archivo", en: "No file was received." }) }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate by MAGIC BYTES (not the spoofable file.type/extension) against a safe
    // raster-image allow-list. SVG (XML, scriptable → stored-XSS risk) and any
    // non-image are REJECTED here, before anything reaches Cloudinary. Vercel
    // Functions reject bodies over 4.5 MB, so this endpoint stays below that.
    const check = validateUpload(buffer, {
      allow: IMAGE_KINDS,
      maxBytes: 4 * 1024 * 1024,
      allowLabel: "JPG, PNG, WEBP, AVIF, HEIC/HEIF o GIF",
    });
    if (!check.ok) return NextResponse.json({ error: check.error, code: check.motivo }, { status: 400 });
  try { await scanUpload(buffer); } catch(e) { return NextResponse.json({error:e instanceof Error?e.message:"Análisis no disponible."},{status:422}); }

    // Privacy: remove EXIF (GPS = e.g. the location of a client's house), XMP, IPTC, comments and trailing
    // data BEFORE the bytes reach R2 or Cloudinary (both keep what they receive). Lossless and pure TS (no
    // sharp in the Worker). AVIF/HEIC/HEIF cannot be stripped safely and are refused; the browser client
    // already converts them to JPG. Fail closed: any metadata the independent scanner still sees → refused.
    const stripped = stripImageMetadata(buffer);
    if (!stripped.ok) {
      return NextResponse.json(
        { error: mensajeDeError(req, stripFailureText(stripped.reason)), code: stripped.reason === "iso_bmff" ? "formato" : "metadatos" },
        { status: 400 },
      );
    }
    if (!verifyStripped(stripped, scanMetadata)) {
      console.error("[POST /api/upload/photo] metadata remained after stripping", { format: stripped.format });
      return NextResponse.json(
        { error: mensajeDeError(req, stripFailureText("metadata_remains")), code: "metadatos" },
        { status: 400 },
      );
    }
    const clean = Buffer.from(stripped.bytes.buffer, stripped.bytes.byteOffset, stripped.bytes.byteLength);

    // Correct MIME from the DETECTED kind (never the uploaded file.type).
    const dataUri = `data:${MIME_FOR[check.kind]};base64,${clean.toString("base64")}`;

    // "avatar" → square image (profile photo), framed by the client. "portfolio" (default) →
    // store ONE optimized original (max 1600px, auto format/quality); thumbnails
    // and gallery sizes are derived via URL transforms, never stored copies.
    const kind = (formData.get("type") as string | null) ?? "portfolio";
    const isAvatar = kind === "avatar";

    if (isR2Configured()) {
      const result = await uploadR2Object({
        buffer: clean,
        contentType: MIME_FOR[check.kind],
        folder: isAvatar ? "contratacr/profiles" : "contratacr/portfolio",
        extension: EXTENSION_FOR[check.kind],
        userId: user.id,
      });
      await recordMediaAsset({
        userId: user.id,
        provider: "r2",
        publicId: result.key,
        resourceType: "image",
        secureUrl: result.url,
      });
      return NextResponse.json({ url: result.url, publicId: result.key, provider: "r2" });
    }

    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) {
      return NextResponse.json(
        { error: mensajeDeError(req, { es: "Cloudinary no está configurado. Revise las variables de entorno en Vercel.", en: "Cloudinary is not configured. Check the environment variables." }) },
        { status: 503 }
      );
    }
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: isAvatar ? "contratacr/profiles" : "contratacr/portfolio",
      transformation: isAvatar
        ? [{ width: 800, height: 800, crop: "fit", quality: 92, fetch_format: "auto" }]
        : [{ width: 1600, height: 1600, crop: "limit", quality: 92, fetch_format: "auto" }],
    });

    await recordCloudinaryAsset({
      userId: user.id,
      publicId: result.public_id,
      resourceType: result.resource_type || "image",
      secureUrl: result.secure_url,
    });

    return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al subir la imagen";
    console.error("[POST /api/upload/photo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
