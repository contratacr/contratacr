import { v2 as cloudinary } from "cloudinary";
import { createAdminClient } from "@/lib/supabase/admin";

type StorageObject = { bucket_id: string; object_name: string };
type MediaAsset = { id: string; public_id: string; resource_type: string };

function chunks<T>(items: T[], size: number) {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) result.push(items.slice(index, index + size));
  return result;
}

async function markFailed(requestId: string, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  await createAdminClient()
    .from("account_deletion_requests")
    .update({ status: "failed", last_error: message.slice(0, 1000), updated_at: new Date().toISOString() })
    .eq("id", requestId)
    .neq("status", "completed");
}

/** Remove only assets resolved by the database for this deletion request, then
 * finalize its one user id. Safe to call repeatedly after partial failures. */
export async function processAccountDeletion(requestId: string) {
  const db = createAdminClient();
  try {
    const { data: request, error: requestError } = await db
      .from("account_deletion_requests")
      .select("id,user_id,status")
      .eq("id", requestId)
      .single();
    if (requestError || !request) throw new Error(requestError?.message || "Deletion request not found");
    if (request.status === "completed") return { status: "completed" as const };

    const { data: storageRows, error: storageError } = await db.rpc("account_deletion_storage_objects", {
      p_request_id: requestId,
    });
    if (storageError) throw new Error(storageError.message);

    const byBucket = new Map<string, string[]>();
    for (const row of (storageRows ?? []) as StorageObject[]) {
      const names = byBucket.get(row.bucket_id) ?? [];
      names.push(row.object_name);
      byBucket.set(row.bucket_id, names);
    }
    for (const [bucket, names] of byBucket) {
      for (const batch of chunks([...new Set(names)], 100)) {
        const { error } = await db.storage.from(bucket).remove(batch);
        if (error) throw new Error(`Storage ${bucket}: ${error.message}`);
      }
    }

    const { data: mediaRows, error: mediaError } = await db
      .from("user_media_assets")
      .select("id,public_id,resource_type")
      .eq("user_id", request.user_id);
    if (mediaError) throw new Error(mediaError.message);
    const assets = (mediaRows ?? []) as MediaAsset[];
    if (assets.length > 0) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) throw new Error("Cloudinary cleanup is not configured");
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
      for (const asset of assets) {
        await cloudinary.uploader.destroy(asset.public_id, {
          resource_type: asset.resource_type || "image",
          invalidate: true,
        });
        const { error } = await db.from("user_media_assets").delete().eq("id", asset.id).eq("user_id", request.user_id);
        if (error) throw new Error(error.message);
      }
    }

    const { error: finalizeError } = await db.rpc("finalize_account_deletion", { p_request_id: requestId });
    if (finalizeError) throw new Error(finalizeError.message);
    return { status: "completed" as const };
  } catch (error) {
    await markFailed(requestId, error);
    throw error;
  }
}
