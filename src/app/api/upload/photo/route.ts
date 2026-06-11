import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export async function POST(req: Request) {
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

    // 10 MB cap — modern phone photos routinely exceed 5 MB, and Cloudinary
    // downscales anyway (avatars to 400px), so a low cap only caused failures.
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "La imagen pesa más de 10 MB. Usa una más liviana." }, { status: 400 });
    }

    // Accept any image — including iPhone HEIC/HEIF (Cloudinary converts them).
    // Some mobile browsers send an EMPTY type for HEIC, so allow that too; a true
    // non-image still fails at Cloudinary with a clear message.
    const type = file.type || "";
    const isImage = type === "" || type.startsWith("image/");
    if (!isImage) {
      return NextResponse.json({ error: "El archivo no es una imagen. Usa JPG, PNG, WebP o HEIC." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Empty type (some mobile HEIC) → use a sensible default so the data URI is valid.
    const dataUri = `data:${type || "image/heic"};base64,${buffer.toString("base64")}`;

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
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
