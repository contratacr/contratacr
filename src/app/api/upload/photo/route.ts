import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";

export async function POST(req: Request) {
  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;

  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json(
      { error: "Cloudinary no está configurado. Revisá las variables de entorno en Vercel." },
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

    if (file.size > 5 * 1024 * 1024) {
      return NextResponse.json({ error: "El archivo excede el límite de 5 MB" }, { status: 400 });
    }

    const allowed = ["image/jpeg", "image/png", "image/webp"];
    if (!allowed.includes(file.type)) {
      return NextResponse.json({ error: "Formato no permitido. Usá JPG, PNG o WebP." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const dataUri = `data:${file.type};base64,${buffer.toString("base64")}`;

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
