import { NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { validateUpload, IMAGE_KINDS, DOC_KINDS, MIME_FOR } from "@/lib/upload-validation";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { PAYMENTS_ENABLED } from "@/lib/payments/config";
import { getApiAdmin } from "@/lib/auth/admin";
import { recordCloudinaryAsset } from "@/lib/cloudinary-ownership";

export const runtime = "nodejs";

// Uploads a SINPE/transfer comprobante (image or PDF) to Cloudinary and returns
// the URL. Auth required (a logged-in pro, or an admin previewing). Gated like the
// rest of payments: nothing here is reachable by anonymous/regular users while off.
export async function POST(req: Request) {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  const admin = await getApiAdmin();
  if (!user) return NextResponse.json({ error: "No autorizado" }, { status: 403 });
  if (!PAYMENTS_ENABLED && !admin) return NextResponse.json({ error: "No disponible" }, { status: 404 });

  const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
  const apiKey = process.env.CLOUDINARY_API_KEY;
  const apiSecret = process.env.CLOUDINARY_API_SECRET;
  if (!cloudName || !apiKey || !apiSecret) {
    return NextResponse.json({ error: "Cloudinary no está configurado." }, { status: 503 });
  }
  cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });

  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    if (!file || file.size === 0) return NextResponse.json({ error: "No se recibió el comprobante" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    // Keep the route below the hosting request-body ceiling. The manual payment UI
    // is currently disabled, but this endpoint must still enforce a usable limit.
    const check = validateUpload(buffer, {
      allow: [...IMAGE_KINDS, ...DOC_KINDS],
      maxBytes: 4 * 1024 * 1024,
      allowLabel: "JPG, PNG, WEBP, AVIF, HEIC/HEIF, GIF o PDF",
    });
    if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

    const dataUri = `data:${MIME_FOR[check.kind]};base64,${buffer.toString("base64")}`;
    // resource_type auto → handles both images and PDFs. Stored in a dedicated
    // folder so comprobantes are easy to find/audit.
    const result = await cloudinary.uploader.upload(dataUri, {
      folder: "contratacr/comprobantes",
      resource_type: "auto",
    });
    await recordCloudinaryAsset({
      userId: user.id,
      publicId: result.public_id,
      resourceType: result.resource_type || "image",
      secureUrl: result.secure_url,
    });
    return NextResponse.json({ url: result.secure_url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al subir el comprobante";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
