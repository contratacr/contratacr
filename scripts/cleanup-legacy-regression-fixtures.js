/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const { createClient } = require("@supabase/supabase-js");

const envFile = process.env.DEMO_ENV_FILE || ".env.test";
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match && !process.env[match[1].trim()]) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const expectedTestRef = "sodegkfjjrdkbohycqyq";
let projectRef = "invalid";
try { projectRef = new URL(url).hostname.split(".")[0]; } catch {}
if (projectRef !== expectedTestRef) throw new Error(`Refusing legacy cleanup on ${projectRef}; expected ${expectedTestRef}.`);
if (!serviceRole) throw new Error("Missing test SUPABASE_SERVICE_ROLE_KEY.");

const apply = process.argv.includes("--apply");
const admin = createClient(url, serviceRole, { auth: { persistSession: false, autoRefreshToken: false } });
const legacyActors = [
  { email: "e2e.video@contratacr.test", name: /^E2E Video ContrataCR$/i, slug: "e2e-video-contratacr" },
  { email: "e2e.admin@contratacr.test", name: /^E2E Admin ContrataCR$/i },
];
const legacyJobIds = [
  "00000000-0000-4000-8000-00000000e201",
  "00000000-0000-4000-8000-00000000e202",
  "00000000-0000-4000-8000-00000000e203",
  "00000000-0000-4000-8000-00000000e204",
];
const legacyOfferIds = [
  "00000000-0000-4000-8000-00000000e301",
  "00000000-0000-4000-8000-00000000e302",
  "00000000-0000-4000-8000-00000000e303",
];
const legacyApplicationIds = ["00000000-0000-4000-8000-00000000e401"];

async function must(label, promise) {
  const { data, error } = await promise;
  if (error) throw new Error(`${label}: ${error.message}`);
  return data;
}

async function allUsers() {
  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) break;
  }
  return users;
}

async function cleanupActor(actor, users) {
  const authUser = users.find((user) => user.email?.toLowerCase() === actor.email);
  const profile = await must(`profile ${actor.email}`, admin.from("profiles").select("id,full_name,email").ilike("email", actor.email).maybeSingle());
  if (!authUser && !profile) return { email: actor.email, present: false };
  if (!authUser || !profile || authUser.id !== profile.id) throw new Error(`Legacy actor ${actor.email} has inconsistent Auth/profile ownership.`);
  if (!actor.name.test(profile.full_name || "")) throw new Error(`Refusing to delete ${actor.email}: unexpected name ${profile.full_name}.`);
  if (actor.slug) {
    const professional = await must(`professional ${actor.email}`, admin.from("professionals").select("id,slug").eq("profile_id", profile.id).maybeSingle());
    if (!professional || professional.slug !== actor.slug) throw new Error(`Refusing to delete ${actor.email}: expected slug ${actor.slug}.`);
  }
  if (!apply) return { email: actor.email, present: true, userId: profile.id };

  const request = await must(`deletion request ${actor.email}`, admin.from("account_deletion_requests").upsert({
    user_id: profile.id,
    status: "pending",
    updated_at: new Date().toISOString(),
    last_error: null,
  }, { onConflict: "user_id" }).select("id").single());
  const storageRows = await must(`storage ownership ${actor.email}`, admin.rpc("account_deletion_storage_objects", { p_request_id: request.id }));
  const byBucket = new Map();
  for (const row of storageRows || []) {
    const values = byBucket.get(row.bucket_id) || [];
    values.push(row.object_name);
    byBucket.set(row.bucket_id, values);
  }
  for (const [bucket, names] of byBucket) await must(`storage remove ${actor.email}/${bucket}`, admin.storage.from(bucket).remove([...new Set(names)]));

  const media = await must(`media ownership ${actor.email}`, admin.from("user_media_assets").select("id,public_id,resource_type").eq("user_id", profile.id));
  if (media.length) {
    const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
    const apiKey = process.env.CLOUDINARY_API_KEY;
    const apiSecret = process.env.CLOUDINARY_API_SECRET;
    if (!cloudName || !apiKey || !apiSecret) throw new Error(`Cloudinary credentials are required to clean ${actor.email}.`);
    cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    for (const asset of media) {
      await cloudinary.uploader.destroy(asset.public_id, { resource_type: asset.resource_type || "image", invalidate: true });
      await must(`media row ${asset.id}`, admin.from("user_media_assets").delete().eq("id", asset.id).eq("user_id", profile.id));
    }
  }
  await must(`finalize ${actor.email}`, admin.rpc("finalize_account_deletion", { p_request_id: request.id }));
  await must(`remove completed request ${actor.email}`, admin.from("account_deletion_requests").delete().eq("id", request.id));
  return { email: actor.email, present: true, removed: true, userId: profile.id };
}

async function run() {
  const users = await allUsers();
  const actorPlan = [];
  for (const actor of legacyActors) actorPlan.push(await cleanupActor(actor, users));
  const rowPlan = {
    jobs: await must("legacy jobs", admin.from("job_posts").select("id").in("id", legacyJobIds)),
    offers: await must("legacy offers", admin.from("professional_offers").select("id").in("id", legacyOfferIds)),
    applications: await must("legacy applications", admin.from("job_applications").select("id").in("id", legacyApplicationIds)),
    savedItems: await must(
      "legacy saved marketplace items",
      admin.from("saved_items").select("id,item_type,item_id").in("item_id", [...legacyJobIds, ...legacyOfferIds]),
    ),
  };
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry-run", actors: actorPlan, rows: rowPlan }, null, 2));
  if (!apply) {
    if (actorPlan.some((item) => item.present) || Object.values(rowPlan).some((rows) => rows.length)) {
      throw new Error("Legacy fixtures remain. Re-run this exact test-only script with --apply.");
    }
    return;
  }

  for (const id of [...legacyJobIds, ...legacyOfferIds, ...legacyApplicationIds]) {
    await must(`legacy notifications ${id}`, admin.from("notifications").delete().contains("data", { job_id: id }));
    await must(`legacy content notifications ${id}`, admin.from("notifications").delete().contains("data", { content_id: id }));
    await must(`legacy activity ${id}`, admin.from("professional_activity").delete().eq("content_id", id));
  }
  await must(
    "legacy saved marketplace items",
    admin.from("saved_items").delete().in("item_id", [...legacyJobIds, ...legacyOfferIds]),
  );
  await must("legacy applications", admin.from("job_applications").delete().in("id", legacyApplicationIds));
  await must("legacy jobs", admin.from("job_posts").delete().in("id", legacyJobIds));
  await must("legacy offers", admin.from("professional_offers").delete().in("id", legacyOfferIds));

  const remainingUsers = await allUsers();
  for (const actor of legacyActors) {
    if (remainingUsers.some((user) => user.email?.toLowerCase() === actor.email)) throw new Error(`${actor.email} still exists after cleanup.`);
  }
  console.log("Legacy regression actors and deterministic rows removed from the test project.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
