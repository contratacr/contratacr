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
try { projectRef = new URL(url).hostname.split(".")[0]; } catch {}
if (projectRef !== expectedTestRef) {
  throw new Error(`Refusing destructive push verification on ${projectRef}; expected test.`);
}
if (process.env.EXPECTED_SUPABASE_PROJECT_REF && process.env.EXPECTED_SUPABASE_PROJECT_REF !== expectedTestRef) {
  throw new Error("EXPECTED_SUPABASE_PROJECT_REF does not identify the hard-coded test project.");
}
if (!anonKey || !serviceRole) throw new Error("Missing test Supabase credentials.");

const admin = createClient(url, serviceRole, { auth: { persistSession: false } });
const anonymous = createClient(url, anonKey, { auth: { persistSession: false } });
const password = `Push!${crypto.randomUUID()}aA1`;
const suffix = `${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
const targetEmail = `push-target-${suffix}@contratacr.test`;
const sentinelEmail = `push-sentinel-${suffix}@contratacr.test`;
const workerId = `push-isolation-${suffix}`;
const sharedToken = `fake-fcm-shared-${suffix}`;
const targetToken = `fake-fcm-target-${suffix}`;
const targetNotificationId = crypto.randomUUID();
const suppressedNotificationId = crypto.randomUUID();
const sentinelNotificationId = crypto.randomUUID();
let targetId = "";
let sentinelId = "";
let targetOutboxId = "";
let targetTokenId = "";

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function rows(value) {
  return Array.isArray(value) ? value : [];
}

async function serviceRpc(name, payload) {
  const response = await fetch(`${url}/rest/v1/rpc/${name}`, {
    method: "POST",
    headers: {
      apikey: serviceRole,
      authorization: `Bearer ${serviceRole}`,
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`Service-role RPC ${name} failed (${response.status}): ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : null;
}

async function createDisposable(email, fullName) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: fullName, role: "client" },
  });
  if (error || !data.user) throw new Error(error?.message || `Could not create ${email}`);
  return data.user.id;
}

async function signIn(email) {
  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`Disposable sign-in failed: ${error.message}`);
  return client;
}

async function registerToken(client, token, platform = "android") {
  const { data, error } = await client.rpc("register_user_push_token", {
    p_token: token,
    p_platform: platform,
    p_device_id: `isolation-${suffix}`,
    p_app_version: "isolation-test",
    p_transport: "fcm",
  });
  if (error || !data) throw new Error(error?.message || "Push token registration failed.");
  return data;
}

async function assertDirectTableDenied(client, table) {
  const { error } = await client.from(table).select("id").limit(1);
  assert(error, `${table} unexpectedly allowed direct client reads.`);
}

async function cleanup() {
  const errors = [];
  const remember = (label, error) => {
    if (error) errors.push(`${label}: ${error.message || String(error)}`);
  };

  const notificationIds = [targetNotificationId, suppressedNotificationId, sentinelNotificationId];
  const { error: notificationError } = await admin.from("notifications").delete().in("id", notificationIds);
  remember("notifications", notificationError);

  for (const [label, userId] of [["target rows", targetId], ["sentinel rows", sentinelId]]) {
    if (!userId) continue;
    const { error: outboxError } = await admin.from("notification_push_outbox").delete().eq("user_id", userId);
    remember(`${label} outbox`, outboxError);
    const { error: tokenError } = await admin.from("user_push_tokens").delete().eq("user_id", userId);
    remember(`${label} tokens`, tokenError);
  }

  for (const [label, userId] of [["target auth", targetId], ["sentinel auth", sentinelId]]) {
    if (!userId) continue;
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error && !/not found/i.test(error.message || "")) remember(label, error);
  }

  if (errors.length > 0) throw new Error(`Push isolation cleanup failed: ${errors.join("; ")}`);
}

async function run() {
  targetId = await createDisposable(targetEmail, "Push Isolation Target");
  sentinelId = await createDisposable(sentinelEmail, "Push Isolation Sentinel");

  const { data: profiles, error: profilesError } = await admin
    .from("profiles")
    .select("id")
    .in("id", [targetId, sentinelId]);
  if (profilesError) throw new Error(profilesError.message);
  const profileIds = new Set(rows(profiles).map((profile) => profile.id));
  if (!profileIds.has(targetId)) {
    const { error } = await admin.from("profiles").insert({
      id: targetId,
      email: targetEmail,
      full_name: "Push Isolation Target",
      role: "client",
      onboarding_completed: true,
    });
    if (error) throw new Error(`Target profile seed failed: ${error.message}`);
  }
  if (!profileIds.has(sentinelId)) {
    const { error } = await admin.from("profiles").insert({
      id: sentinelId,
      email: sentinelEmail,
      full_name: "Push Isolation Sentinel",
      role: "client",
      onboarding_completed: true,
    });
    if (error) throw new Error(`Sentinel profile seed failed: ${error.message}`);
  }

  const target = await signIn(targetEmail);
  const sentinel = await signIn(sentinelEmail);

  const { error: anonymousRpcError } = await anonymous.rpc("register_user_push_token", {
    p_token: sharedToken,
    p_platform: "android",
    p_transport: "fcm",
  });
  assert(anonymousRpcError, "Anonymous token registration unexpectedly succeeded.");
  await assertDirectTableDenied(anonymous, "user_push_tokens");
  await assertDirectTableDenied(target, "notification_push_outbox");
  await assertDirectTableDenied(sentinel, "notification_push_deliveries");

  await registerToken(target, sharedToken);
  await registerToken(sentinel, sharedToken);
  const { data: transferredRows, error: transferredError } = await admin
    .from("user_push_tokens")
    .select("user_id,is_active")
    .eq("transport", "fcm")
    .eq("token", sharedToken);
  if (transferredError) throw new Error(transferredError.message);
  const activeShared = rows(transferredRows).filter((row) => row.is_active);
  assert(activeShared.length === 1 && activeShared[0].user_id === sentinelId,
    "The same FCM token was not transferred exclusively from target to sentinel.");

  for (let index = 0; index < 12; index += 1) {
    await registerToken(sentinel, `fake-fcm-cap-${index}-${suffix}`);
  }
  const { data: activeSentinelTokens, error: capError } = await admin
    .from("user_push_tokens")
    .select("id,token")
    .eq("user_id", sentinelId)
    .eq("transport", "fcm")
    .eq("is_active", true);
  if (capError) throw new Error(capError.message);
  assert(rows(activeSentinelTokens).length > 0 && rows(activeSentinelTokens).length <= 10,
    "Active push tokens exceeded the per-account cap of 10.");
  assert(rows(activeSentinelTokens).some((row) => row.token === `fake-fcm-cap-11-${suffix}`),
    "The newest sentinel token was not retained by the cap.");

  targetTokenId = await registerToken(target, targetToken);

  const notifications = [
    {
      id: targetNotificationId,
      user_id: targetId,
      type: "support_reply",
      title: "Push isolation target",
      message: "Normal notification captured by the durable outbox.",
      data: { isolation_id: suffix },
    },
    {
      id: suppressedNotificationId,
      user_id: targetId,
      type: "support_reply",
      title: "Push isolation suppressed",
      message: "Suppressed notification retained for audit without delivery.",
      data: { isolation_id: suffix, push_suppressed: true },
    },
    {
      id: sentinelNotificationId,
      user_id: sentinelId,
      type: "support_reply",
      title: "Push isolation sentinel",
      message: "Sentinel notification must survive target deletion.",
      data: { isolation_id: suffix },
    },
  ];
  const { error: notificationError } = await admin.from("notifications").insert(notifications);
  if (notificationError) throw new Error(notificationError.message);

  const { data: outboxRows, error: outboxError } = await admin
    .from("notification_push_outbox")
    .select("id,notification_id,user_id,status")
    .in("notification_id", [targetNotificationId, suppressedNotificationId, sentinelNotificationId]);
  if (outboxError) throw new Error(outboxError.message);
  assert(rows(outboxRows).length === 3, "A notification was not captured by the push outbox.");
  const targetOutbox = rows(outboxRows).find((row) => row.notification_id === targetNotificationId);
  const suppressedOutbox = rows(outboxRows).find((row) => row.notification_id === suppressedNotificationId);
  const sentinelOutbox = rows(outboxRows).find((row) => row.notification_id === sentinelNotificationId);
  assert(targetOutbox?.status === "pending", "Normal notification was not pending.");
  assert(suppressedOutbox?.status === "suppressed", "push_suppressed notification was not suppressed.");
  assert(sentinelOutbox?.status === "pending", "Sentinel notification was not pending.");
  targetOutboxId = targetOutbox.id;

  const { error: priorityError } = await admin
    .from("notification_push_outbox")
    .update({ available_at: "0001-01-01T00:00:00.000Z" })
    .eq("id", targetOutboxId);
  if (priorityError) throw new Error(priorityError.message);

  const claimed = await serviceRpc("claim_notification_push_outbox", {
    p_worker_id: workerId,
    p_limit: 1,
    p_lease_seconds: 120,
  });
  assert(rows(claimed).length === 1 && claimed[0].id === targetOutboxId,
    "Service-role claim did not lease only the isolated target row.");

  const finished = await serviceRpc("finish_notification_push_outbox", {
    p_outbox_id: targetOutboxId,
    p_worker_id: workerId,
    p_outcome: "failed",
    p_deliveries: [{
      token_id: targetTokenId,
      status: "failed",
      provider_message_id: null,
      error_code: "isolation_probe_no_fcm",
      error_detail: null,
    }],
    p_error: "isolation_probe_no_fcm",
    p_available_at: null,
  });
  assert(finished === true, "Service-role finish did not complete the isolated lease.");

  const { data: delivery, error: deliveryError } = await admin
    .from("notification_push_deliveries")
    .select("id,status")
    .eq("outbox_id", targetOutboxId)
    .eq("token_id", targetTokenId)
    .maybeSingle();
  if (deliveryError) throw new Error(deliveryError.message);
  assert(delivery?.status === "failed", "The non-FCM isolation delivery was not recorded.");

  const { error: deleteTargetError } = await admin.auth.admin.deleteUser(targetId);
  if (deleteTargetError) throw new Error(deleteTargetError.message);

  const [targetAuth, sentinelAuth, targetProfile, sentinelProfile, targetTokens, sentinelTokenRow,
    targetNotifications, sentinelNotification, targetOutboxes, sentinelOutboxAfter, targetDelivery] = await Promise.all([
    admin.auth.admin.getUserById(targetId),
    admin.auth.admin.getUserById(sentinelId),
    admin.from("profiles").select("id").eq("id", targetId).maybeSingle(),
    admin.from("profiles").select("id").eq("id", sentinelId).maybeSingle(),
    admin.from("user_push_tokens").select("id").eq("user_id", targetId),
    admin.from("user_push_tokens").select("id").eq("user_id", sentinelId).eq("token", `fake-fcm-cap-11-${suffix}`).eq("is_active", true).maybeSingle(),
    admin.from("notifications").select("id").in("id", [targetNotificationId, suppressedNotificationId]),
    admin.from("notifications").select("id").eq("id", sentinelNotificationId).maybeSingle(),
    admin.from("notification_push_outbox").select("id").eq("user_id", targetId),
    admin.from("notification_push_outbox").select("id,status").eq("id", sentinelOutbox.id).maybeSingle(),
    admin.from("notification_push_deliveries").select("id").eq("outbox_id", targetOutboxId),
  ]);

  const postDeleteQueries = [
    ["sentinel auth", sentinelAuth],
    ["target profile", targetProfile],
    ["sentinel profile", sentinelProfile],
    ["target tokens", targetTokens],
    ["sentinel token", sentinelTokenRow],
    ["target notifications", targetNotifications],
    ["sentinel notification", sentinelNotification],
    ["target outboxes", targetOutboxes],
    ["sentinel outbox", sentinelOutboxAfter],
    ["target delivery", targetDelivery],
  ];
  for (const [label, result] of postDeleteQueries) {
    if (result.error) throw new Error(`Post-delete ${label} check failed: ${result.error.message}`);
  }
  if (targetAuth.error && !/not found/i.test(targetAuth.error.message || "")) {
    throw new Error(`Post-delete target auth check failed: ${targetAuth.error.message}`);
  }

  assert(!targetAuth.data?.user, "Target Auth user survived cascade deletion.");
  assert(!targetProfile.data, "Target profile survived cascade deletion.");
  assert(rows(targetTokens.data).length === 0, "Target push tokens survived cascade deletion.");
  assert(rows(targetNotifications.data).length === 0, "Target notifications survived cascade deletion.");
  assert(rows(targetOutboxes.data).length === 0, "Target outbox rows survived cascade deletion.");
  assert(rows(targetDelivery.data).length === 0, "Target delivery survived cascade deletion.");
  assert(sentinelAuth.data?.user?.id === sentinelId, "Sentinel Auth user was affected.");
  assert(sentinelProfile.data?.id === sentinelId, "Sentinel profile was affected.");
  assert(sentinelTokenRow.data?.id, "Sentinel active push token was affected.");
  assert(sentinelNotification.data?.id === sentinelNotificationId, "Sentinel notification was affected.");
  assert(sentinelOutboxAfter.data?.id === sentinelOutbox.id, "Sentinel outbox row was affected.");

  console.log("Notification push isolation verified without calling FCM or the worker.");
}

(async () => {
  let failure = null;
  try {
    await run();
  } catch (error) {
    failure = error;
  }
  try {
    await cleanup();
  } catch (cleanupError) {
    failure = failure ? new AggregateError([failure, cleanupError], "Push isolation verification and cleanup failed.") : cleanupError;
  }
  if (failure) throw failure;
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
