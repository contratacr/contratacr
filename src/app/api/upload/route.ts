import { NextRequest, NextResponse } from "next/server";
import { validateUpload, IMAGE_KINDS } from "@/lib/upload-validation";
import { enforceRateLimit } from "@/lib/rate-limit";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const rl = enforceRateLimit(req, "upload", 12, 60_000);
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

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "No file provided" }, { status: 400 });

    const { v2: cloudinary } = await import("cloudinary");
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

    const buffer = Buffer.from(await file.arrayBuffer());

    // Magic-byte validation against a safe raster-image allow-list (SVG + non-images
    // rejected). Server-side gate — `accept=` on the client can be bypassed.
    const check = validateUpload(buffer, {
      allow: IMAGE_KINDS,
      maxBytes: 4 * 1024 * 1024,
      allowLabel: "JPG, PNG, WEBP, HEIC/HEIF o GIF",
    });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const result = await new Promise<{ secure_url: string; public_id: string }>(
      (resolve, reject) => {
        cloudinary.uploader
          .upload_stream(
            {
              folder: "contratacr/portfolios",
              resource_type: "image",
              transformation: [{ width: 1200, crop: "limit" }],
            },
            (err, res) => (err ? reject(err) : resolve(res as { secure_url: string; public_id: string }))
          )
          .end(buffer);
      }
    );

    return NextResponse.json({ url: result.secure_url, publicId: result.public_id });
  } catch (err) {
    console.error("[POST /api/upload]", err);
    return NextResponse.json({ error: "Upload failed" }, { status: 500 });
  }
}
