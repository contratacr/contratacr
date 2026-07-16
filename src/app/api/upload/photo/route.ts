import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { validateUpload, IMAGE_KINDS, MIME_FOR } from "@/lib/upload-validation";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: Request) {
  const rl = enforceRateLimit(req, "upload-photo", 12, 60_000);
  if (rl) return rl;

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary no está configurado. Revisa las variables de entorno en Vercel." },
      { status: 503 }
    );
  }

  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No se recibió ningún archivo" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());

    // Validate by MAGIC BYTES (not the spoofable file.type/extension) against a safe
    // raster-image allow-list. SVG (XML, scriptable → stored-XSS risk) and any
    // non-image are REJECTED here, before anything reaches Cloudinary. Vercel
    // Functions reject bodies over 4.5 MB, so this endpoint stays below that.
    const check = validateUpload(buffer, {
      allow: IMAGE_KINDS,
      maxBytes: 4 * 1024 * 1024,
      allowLabel: "JPG, PNG, WEBP, HEIC/HEIF o GIF",
    });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    // Correct MIME from the DETECTED kind (never the uploaded file.type).
    const dataUri = `data:${MIME_FOR[check.kind]};base64,${buffer.toString("base64")}`;

    // "avatar" → square face crop (profile photo). "portfolio" (default) →
    // store ONE optimized original (max 1600px, auto format/quality); thumbnails
    // and gallery sizes are derived via URL transforms, never stored copies.
    const kind = (formData.get("type") as string | null) ?? "portfolio";
    const isAvatar = kind === "avatar";

    const result = await cloudinary.uploader.upload(dataUri, {
      folder: isAvatar ? "contratacr/profiles" : "contratacr/portfolio",
      transformation: isAvatar
        ? [{ width: 400, height: 400, crop: "fill", gravity: "face", quality: "auto", fetch_format: "auto" }]
        : [{ width: 1600, height: 1600, crop: "limit", quality: "auto", fetch_format: "auto" }],
    });

    return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Error al subir la imagen";
    console.error("[POST /api/upload/photo]", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
