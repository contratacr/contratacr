import { v2 as cloudinary } from "cloudinary";
import { createAdminClient } from "@/lib/supabase/admin";
import { deleteR2Object } from "@/lib/r2-storage";

export async function recordMediaAsset({
  userId,
  provider,
  publicId,
  resourceType,
  secureUrl,
}: {
  userId: string;
  provider: "cloudinary" | "r2";
  publicId: string;
  resourceType: string;
  secureUrl: string;
}) {
  const { error } = await createAdminClient().from("user_media_assets").upsert({
    user_id: userId,
    provider,
    public_id: publicId,
    resource_type: resourceType,
    secure_url: secureUrl,
  }, { onConflict: "provider,public_id" });
  if (!error) return;
  // Keep uploads available during the short deployment window before migration
  // 165 reaches an environment. New deployments track ownership once available.
  if (/user_media_assets|schema cache|does not exist|PGRST205/i.test(error.message)) return;

  // Never leave a newly uploaded, unowned asset that account deletion cannot
  // later identify. Roll back only this exact object.
  if (provider === "r2") {
    await deleteR2Object(publicId).catch(() => {});
  } else {
    await cloudinary.uploader.destroy(publicId, { resource_type: resourceType, invalidate: true }).catch(() => {});
  }
  throw new Error(`No se pudo registrar la propiedad del archivo: ${error.message}`);
}

export async function recordCloudinaryAsset(input: Omit<Parameters<typeof recordMediaAsset>[0], "provider">) {
  return recordMediaAsset({ ...input, provider: "cloudinary" });
}
