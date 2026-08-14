/* eslint-disable @typescript-eslint/no-require-imports */
const fs = require("fs");
const crypto = require("crypto");
const { createClient } = require("@supabase/supabase-js");

const envFile = process.env.DEMO_ENV_FILE || ".env.test";
if (fs.existsSync(envFile)) {
  for (const line of fs.readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([^#=]+)=(.*)$/);
    if (match) process.env[match[1].trim()] = match[2].trim().replace(/^["']|["']$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY || "";
const expectedTestRef = "sodegkfjjrdkbohycqyq";
let projectRef = "invalid";
let isLoopback = false;
try {
  const parsedUrl = new URL(url);
  projectRef = parsedUrl.hostname.split(".")[0];
  isLoopback = ["127.0.0.1", "localhost", "::1"].includes(parsedUrl.hostname);
} catch {}
const allowEphemeralLocal = process.env.LOCAL_REGRESSION_SEED === "1" && isLoopback;
if (projectRef !== expectedTestRef && !allowEphemeralLocal) {
  throw new Error(`Refusing destructive verification on ${projectRef}; expected test or explicit loopback regression.`);
}
if (!anonKey || !serviceRole) throw new Error("Missing test Supabase credentials.");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const password = `Delete!${crypto.randomUUID()}aA1`;
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const bucket = "direct-message-attachments";
let targetId = "";
let sentinelId = "";
let targetPath = "";
let sentinelPath = "";
let deletionRequestId = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function createDisposable(email) {
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error || !data.user) throw new Error(error?.message || `Could not create ${email}`);
  return data.user.id;
}

async function run() {
  targetId = await createDisposable(`deletion-target-${suffix}@contratacr.test`);
  sentinelId = await createDisposable(`deletion-sentinel-${suffix}@contratacr.test`);
  targetPath = `account-deletion-isolation/${targetId}/probe.png`;
  sentinelPath = `account-deletion-isolation/${sentinelId}/probe.png`;
  const pngProbe = Buffer.from("89504e470d0a1a0a", "hex");

  for (const path of [targetPath, sentinelPath]) {
    const { error } = await admin.storage.from(bucket).upload(path, pngProbe, { contentType: "image/png", upsert: false });
    if (error) throw new Error(`Storage seed failed: ${error.message}`);
  }

  const targetClient = createClient(url, anonKey, { auth: { persistSession: false } });
  const targetEmail = `deletion-target-${suffix}@contratacr.test`;
  const { error: signInError } = await targetClient.auth.signInWithPassword({ email: targetEmail, password });
  if (signInError) throw new Error(`Target sign-in failed: ${signInError.message}`);

  const { data: requestId, error: requestError } = await targetClient.rpc("request_my_account_deletion");
  if (requestError || !requestId) throw new Error(requestError?.message || "Deletion request failed");
  deletionRequestId = requestId;

  const { data: owned, error: ownedError } = await admin.rpc("account_deletion_storage_objects", { p_request_id: requestId });
  if (ownedError) throw new Error(ownedError.message);
  const names = (owned || []).map((item) => item.object_name);
  assert(names.includes(targetPath), "The target object was not selected for deletion.");
  assert(!names.includes(sentinelPath), "The sentinel object was incorrectly selected.");

  const { error: removeError } = await admin.storage.from(bucket).remove(names);
  if (removeError) throw new Error(removeError.message);
  const { error: finalizeError } = await admin.rpc("finalize_account_deletion", { p_request_id: requestId });
  if (finalizeError) throw new Error(finalizeError.message);

  const [{ data: targetAuth }, { data: sentinelAuth }, { data: targetProfile }, { data: sentinelProfile }, { data: sentinelObjects }] = await Promise.all([
    admin.auth.admin.getUserById(targetId),
    admin.auth.admin.getUserById(sentinelId),
    admin.from("profiles").select("id").eq("id", targetId).maybeSingle(),
    admin.from("profiles").select("id").eq("id", sentinelId).maybeSingle(),
    admin.storage.from(bucket).list(`account-deletion-isolation/${sentinelId}`),
  ]);
  assert(!targetAuth.user, "Target Auth user still exists.");
  assert(!targetProfile, "Target profile still exists.");
  assert(sentinelAuth.user?.id === sentinelId, "Sentinel Auth user was affected.");
  assert(sentinelProfile?.id === sentinelId, "Sentinel profile was affected.");
  assert((sentinelObjects || []).some((item) => item.name === "probe.png"), "Sentinel storage object was affected.");

  const { error: requestCleanupError } = await admin.from("account_deletion_requests").delete().eq("id", requestId);
  if (requestCleanupError) throw new Error(requestCleanupError.message);
  deletionRequestId = "";
  console.log("Account deletion isolation verified: target removed; sentinel unchanged.");
}

run().finally(async () => {
  if (targetPath) await admin.storage.from(bucket).remove([targetPath]);
  if (sentinelPath) await admin.storage.from(bucket).remove([sentinelPath]);
  if (targetId) {
    await admin.from("account_deletion_requests").delete().eq("user_id", targetId);
    await admin.auth.admin.deleteUser(targetId);
  }
  if (deletionRequestId) await admin.from("account_deletion_requests").delete().eq("id", deletionRequestId);
  if (sentinelId) await admin.auth.admin.deleteUser(sentinelId);
}).catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
