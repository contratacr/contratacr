import { createAdminClient } from "@/lib/supabase/admin";

/**
 * Local stand-in for R2 (storage plan 2026-11-26). When R2 is not configured AND the Supabase project is the loopback
 * one (`supabase start`), /api/upload/photo stores public photos in the local public bucket "local-uploads" instead of
 * falling through to Cloudinary, so a local upload never reaches a remote account. Never used against a remote project.
 */
export const LOCAL_UPLOAD_BUCKET = "local-uploads";

export function isLoopbackSupabase(url = process.env.NEXT_PUBLIC_SUPABASE_URL) {
  try {
    const host = new URL(url ?? "").hostname;
    return host === "127.0.0.1" || host === "localhost";
  } catch {
    return false;
  }
}

export async function uploadLocalObject(key: string, bytes: Uint8Array, contentType: string) {
  if (!isLoopbackSupabase()) throw new Error("local upload store is loopback-only");
  const storage = createAdminClient().storage;
  let up = await storage.from(LOCAL_UPLOAD_BUCKET).upload(key, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  if (up.error && /bucket not found/i.test(up.error.message)) {
    await storage.createBucket(LOCAL_UPLOAD_BUCKET, { public: true });
    up = await storage.from(LOCAL_UPLOAD_BUCKET).upload(key, bytes, { contentType, upsert: false, cacheControl: "31536000" });
  }
  if (up.error) throw new Error(`local upload failed: ${up.error.message}`);
  return { key, url: storage.from(LOCAL_UPLOAD_BUCKET).getPublicUrl(key).data.publicUrl };
}
