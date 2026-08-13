import { v2 as cloudinary } from "cloudinary";
import { createAdminClient } from "@/lib/supabase/admin";

export async function recordCloudinaryAsset({
  userId,
  publicId,
  resourceType,
  secureUrl,
}: {
  userId: string;
  publicId: string;
  resourceType: string;
  secureUrl: string;
}) {
  const { error } = await createAdminClient().from("user_media_assets").upsert({
    user_id: userId,
    provider: "cloudinary",
    public_id: publicId,
    resource_type: resourceType,
    secure_url: secureUrl,
  }, { onConflict: "provider,public_id" });
  if (!error) return;
  // Keep uploads available during the short deployment window before migration
  // 165 reaches an environment. New deployments track ownership once available.
  if (/user_media_assets|schema cache|does not exist|PGRST205/i.test(error.message)) return;

  // Never leave a newly uploaded, unowned asset that account deletion cannot
  // later identify. Roll back only this exact Cloudinary public id.
  await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true }).catch(() => {});
  throw new Error(`No se pudo registrar la propiedad del archivo: ${error.message}`);
}
