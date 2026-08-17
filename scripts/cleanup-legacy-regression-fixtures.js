/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const { v2: cloudinary } = require("cloudinary");
const { createClient } = require("@supabase/supabase-js");
const { DeleteObjectCommand, S3Client } = require("@aws-sdk/client-s3");

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

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

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

  const media = await must(`media ownership ${actor.email}`, admin.from("user_media_assets").select("id,provider,public_id,resource_type").eq("user_id", profile.id));
  if (media.length) {
    const cloudinaryAssets = media.filter((asset) => asset.provider === "cloudinary" || !asset.provider);
    const r2Assets = media.filter((asset) => asset.provider === "r2");
    if (cloudinaryAssets.length) {
      const cloudName = process.env.CLOUDINARY_CLOUD_NAME;
      const apiKey = process.env.CLOUDINARY_API_KEY;
      const apiSecret = process.env.CLOUDINARY_API_SECRET;
      if (!cloudName || !apiKey || !apiSecret) throw new Error(`Cloudinary credentials are required to clean ${actor.email}.`);
      cloudinary.config({ cloud_name: cloudName, api_key: apiKey, api_secret: apiSecret });
    }
    let r2Client = null;
    if (r2Assets.length) {
      if (!process.env.R2_ENDPOINT || !process.env.R2_ACCESS_KEY_ID || !process.env.R2_SECRET_ACCESS_KEY || !process.env.R2_BUCKET) {
        throw new Error(`R2 credentials are required to clean ${actor.email}.`);
      }
      r2Client = new S3Client({
        region: "auto",
        endpoint: process.env.R2_ENDPOINT,
        credentials: {
          accessKeyId: process.env.R2_ACCESS_KEY_ID,
          secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        },
      });
    }
    for (const asset of media) {
      if (asset.provider === "r2") {
        await r2Client.send(new DeleteObjectCommand({ Bucket: process.env.R2_BUCKET, Key: asset.public_id }));
      } else {
        await cloudinary.uploader.destroy(asset.public_id, { resource_type: asset.resource_type || "image", invalidate: true });
      }
      await must(`media row ${asset.id}`, admin.from("user_media_assets").delete().eq("id", asset.id).eq("user_id", profile.id));
    }
  }
  await must(`finalize ${actor.email}`, admin.rpc("finalize_account_deletion", { p_request_id: request.id }));
  await must(`remove completed request ${actor.email}`, admin.from("account_deletion_requests").delete().eq("id", request.id));
  return { email: actor.email, present: true, removed: true, userId: profile.id };
}

async function interruptedDeletionActors() {
  const profiles = await must(
    "interrupted account-deletion profiles",
    admin.from("profiles").select("id,email,full_name").ilike("email", "deletion-%@contratacr.test"),
  );
  const emailPattern = /^deletion-(?:target|sentinel)-(\d+-[0-9a-f]{8})@contratacr\.test$/i;
  return profiles.flatMap((profile) => {
    const match = (profile.email || "").match(emailPattern);
    if (!match || profile.full_name !== `Cuenta desechable ${match[1]}`) return [];
    return [{
      email: profile.email.toLowerCase(),
      name: new RegExp(`^Cuenta desechable ${escapeRegex(match[1])}$`),
      slug: `regression-disposable-${match[1]}`,
    }];
  });
}

async function interruptedDeletionBookings() {
  const candidates = await must(
    "interrupted account-deletion bookings",
    admin
      .from("bookings")
      .select("id,client_id,client_name,client_email,service_description")
      .ilike("client_email", "%@contratacr.test")
      .or("service_description.ilike.Deletion target booking %,service_description.ilike.Deletion sentinel booking %"),
  );
  const clientIds = [...new Set(candidates.map((row) => row.client_id).filter(Boolean))];
  const profiles = clientIds.length
    ? await must("account-deletion booking profiles", admin.from("profiles").select("id").in("id", clientIds))
    : [];
  const existingProfiles = new Set(profiles.map((profile) => profile.id));
  const disposableEmail = /^deletion-(?:target|sentinel)-\d+-[0-9a-f]{8}@contratacr\.test$/i;
  const disposableName = /^Deletion (?:target|sentinel)$/;
  const disposableDescription = /^Deletion (?:target|sentinel) booking \d+$/;
  return candidates.filter((row) =>
    row.client_id
    && !existingProfiles.has(row.client_id)
    && disposableEmail.test(row.client_email || "")
    && disposableName.test(row.client_name || "")
    && disposableDescription.test(row.service_description || ""));
}

async function run() {
  const users = await allUsers();
  const cleanupActors = [...legacyActors, ...await interruptedDeletionActors()];
  const actorPlan = [];
  for (const actor of cleanupActors) actorPlan.push(await cleanupActor(actor, users));
  const rowPlan = {
    jobs: await must("legacy jobs", admin.from("job_posts").select("id").in("id", legacyJobIds)),
    offers: await must("legacy offers", admin.from("professional_offers").select("id").in("id", legacyOfferIds)),
    applications: await must("legacy applications", admin.from("job_applications").select("id").in("id", legacyApplicationIds)),
    savedItems: await must(
      "legacy saved marketplace items",
      admin.from("saved_items").select("id,item_type,item_id").in("item_id", [...legacyJobIds, ...legacyOfferIds]),
    ),
    interruptedDeletionBookings: await interruptedDeletionBookings(),
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
  for (const booking of rowPlan.interruptedDeletionBookings) {
    await must(
      `interrupted account-deletion booking notification ${booking.id}`,
      admin.from("notifications").delete().contains("data", { booking_id: booking.id }),
    );
  }
  if (rowPlan.interruptedDeletionBookings.length) {
    await must(
      "interrupted account-deletion bookings",
      admin.from("bookings").delete().in("id", rowPlan.interruptedDeletionBookings.map((booking) => booking.id)),
    );
  }

  const remainingUsers = await allUsers();
  for (const actor of cleanupActors) {
    if (remainingUsers.some((user) => user.email?.toLowerCase() === actor.email)) throw new Error(`${actor.email} still exists after cleanup.`);
  }
  const remainingInterruptedBookings = await interruptedDeletionBookings();
  if (remainingInterruptedBookings.length) throw new Error("Interrupted account-deletion bookings remain after cleanup.");
  console.log("Legacy regression actors and deterministic rows removed from the test project.");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
