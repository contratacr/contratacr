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

/** Delete one exact media object only when the ownership ledger proves it
 * belongs to the authenticated user. Unknown/external URLs are a safe no-op. */
export async function deleteOwnedMediaAsset(userId: string, secureUrl: string) {
  const db = createAdminClient();
  const { data: asset, error: findError } = await db
    .from("user_media_assets")
    .select("id,provider,public_id,resource_type")
    .eq("user_id", userId)
    .eq("secure_url", secureUrl)
    .maybeSingle();
  if (findError) throw new Error(findError.message);
  if (!asset) return { deleted: false as const };

  if (asset.provider === "r2") {
    await deleteR2Object(asset.public_id);
  } else if (asset.provider === "cloudinary") {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary cleanup is not configured");
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    await cloudinary.uploader.destroy(asset.public_id, {
      resource_type: asset.resource_type || "image",
      invalidate: true,
    });
  } else {
    throw new Error(`Unsupported media provider: ${asset.provider}`);
  }

  const { error: deleteError } = await db
    .from("user_media_assets")
    .delete()
    .eq("id", asset.id)
    .eq("user_id", userId);
  if (deleteError) throw new Error(deleteError.message);
  return { deleted: true as const };
}
