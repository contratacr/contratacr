import { randomUUID } from "node:crypto";
import { E2E_USERS, regressionAdminClient } from "./seed";

export type DisposableAccount = {
  id: string;
  email: string;
  password: string;
  professionalId?: string;
  businessName?: string;
};

export async function createDisposableAccount(options: {
  prefix: string;
  professional?: boolean;
  admin?: boolean;
  /**
   * Public search is shared by every regression process that targets test.
   * Temporary providers stay banned from discovery unless a test explicitly
   * needs to exercise public matching (for example, the AI search contract).
   */
  publicDiscoverable?: boolean;
}): Promise<DisposableAccount> {
  if (options.professional && options.admin) throw new Error("A disposable account cannot be both professional and admin.");
  const admin = regressionAdminClient();
  const token = `${Date.now()}-${randomUUID().slice(0, 8)}`;
  const email = `${options.prefix}-${token}@contratacr.test`;
  const password = `Disposable!${randomUUID()}aA1`;
  const fullName = `Cuenta desechable ${token}`;
  const role = options.admin ? "admin" : options.professional ? "professional" : "client";
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      role,
      full_name: fullName,
      cedula: "",
      onboarding_completed: true,
      is_provider: Boolean(options.professional),
    },
  });
  if (error || !data.user) throw error ?? new Error(`Could not create ${email}`);

  const id = data.user.id;
  try {
    const { error: profileError } = await admin.from("profiles").upsert({
      id,
      email,
      full_name: fullName,
      role,
      onboarding_completed: true,
      is_provider: Boolean(options.professional),
      is_disabled: false,
      disabled_reason: null,
      disabled_at: null,
    }, { onConflict: "id" });
    if (profileError) throw profileError;

    let professionalId: string | undefined;
    let businessName: string | undefined;
    if (options.professional) {
      const { data: reference, error: referenceError } = await admin
        .from("professionals")
        .select("category_id,provincia_id,canton_id,portfolio_urls,portfolio_items,profiles(avatar_url)")
        .eq("slug", E2E_USERS.professional.slug)
        .maybeSingle();
      if (referenceError || !reference) {
        throw referenceError ?? new Error(`Professional reference fixture ${E2E_USERS.professional.slug} was not found`);
      }
      const referenceProfile = Array.isArray(reference.profiles) ? reference.profiles[0] : reference.profiles;
      const referenceItems = Array.isArray(reference.portfolio_items)
        ? reference.portfolio_items as Array<{ url?: string; image_url?: string; photos?: string[] }>
        : [];
      const reusableImage = (Array.isArray(reference.portfolio_urls) ? reference.portfolio_urls[0] : null)
        || referenceItems.flatMap((item) => [item.url, item.image_url, ...(item.photos ?? [])]).find(Boolean)
        || referenceProfile?.avatar_url
        || null;
      if (!reusableImage) {
        throw new Error(`Professional reference fixture ${E2E_USERS.professional.slug} has no reusable portfolio or profile image`);
      }
      businessName = `Disposable Regression ${token}`;
      const { data: professional, error: professionalError } = await admin
        .from("professionals")
        .insert({
          profile_id: id,
          category_id: reference.category_id,
          bio: "Perfil profesional desechable usado solamente por la regresión automatizada.",
          whatsapp: "+50670009999",
          provincia_id: reference.provincia_id,
          canton_id: reference.canton_id,
          slug: `regression-disposable-${token}`,
          is_available: Boolean(options.publicDiscoverable),
          is_banned: !options.publicDiscoverable,
          is_verified: false,
          verification_status: "pending",
          business_name: businessName,
          professions: [reference.category_id],
          services: [{
            id: `disposable-service-${token}`,
            category: reference.category_id,
            name: "Regression service",
            active: true,
            price: "Consultar precio",
            priceType: "a_convenir",
            modalities: ["presencial", "videoconsulta"],
            startedAt: "2020-01",
            description: "Disposable service used only by automated regression.",
          }],
          portfolio_urls: [reusableImage],
          portfolio_items: [{
            id: `disposable-case-${token}`,
            profession: reference.category_id,
            title: "Disposable regression case",
            description: "Temporary case for exercising the complete editor.",
            recipient: "Regression",
            date: "2026",
            photos: [reusableImage],
            likes: 0,
          }],
          availability_public: true,
          videoconsulta: true,
        })
        .select("id")
        .single();
      if (professionalError || !professional) throw professionalError ?? new Error("Could not create disposable professional");
      professionalId = professional.id;
    }
    return { id, email, password, professionalId, businessName };
  } catch (error) {
    const { error: deleteProfileError } = await admin.from("profiles").delete().eq("id", id);
    const { error: deleteAuditError } = await admin.from("user_action_audit").delete().eq("entity_id", id);
    const { error: deleteAuthError } = await admin.auth.admin.deleteUser(id);
    if (deleteProfileError || deleteAuditError || deleteAuthError) {
      throw new AggregateError(
        [error, deleteProfileError, deleteAuditError, deleteAuthError].filter(Boolean),
        `Could not create or fully clean disposable account ${id}`,
      );
    }
    throw error;
  }
}

export async function cleanupDisposableAccount(account: DisposableAccount | undefined) {
  if (!account) return;
  const admin = regressionAdminClient();
  const failures: unknown[] = [];
  const { data: deletionRequests, error: deletionLookupError } = await admin
    .from("account_deletion_requests")
    .select("id")
    .eq("user_id", account.id);
  if (deletionLookupError) failures.push(deletionLookupError);
  const { error: notificationsError } = await admin.from("notifications").delete().eq("user_id", account.id);
  if (notificationsError) failures.push(notificationsError);
  const { error: mediaError } = await admin.from("user_media_assets").delete().eq("user_id", account.id);
  if (mediaError) failures.push(mediaError);
  const { error: requestError } = await admin.from("account_deletion_requests").delete().eq("user_id", account.id);
  if (requestError) failures.push(requestError);
  const { error: profileError } = await admin.from("profiles").delete().eq("id", account.id);
  if (profileError) failures.push(profileError);
  const { error: relatedAuditError } = await admin
    .from("user_action_audit")
    .delete()
    .or(`actor_user_id.eq.${account.id},entity_owner_user_id.eq.${account.id},entity_id.eq.${account.id}`);
  if (relatedAuditError) failures.push(relatedAuditError);
  if (account.professionalId) {
    const { error: professionalAuditError } = await admin
      .from("user_action_audit")
      .delete()
      .eq("entity_id", account.professionalId);
    if (professionalAuditError) failures.push(professionalAuditError);
  }
  if (deletionRequests?.length) {
    const { error: completedRequestError } = await admin
      .from("account_deletion_requests")
      .delete()
      .in("id", deletionRequests.map((request) => request.id));
    if (completedRequestError) failures.push(completedRequestError);
  }
  const { data: authUser, error: authLookupError } = await admin.auth.admin.getUserById(account.id);
  if (authLookupError && !/not found/i.test(authLookupError.message)) failures.push(authLookupError);
  if (authUser?.user) {
    const { error: authError } = await admin.auth.admin.deleteUser(account.id);
    if (authError && !/not found/i.test(authError.message)) failures.push(authError);
  }
  if (failures.length) throw new AggregateError(failures, `Disposable cleanup failed for ${account.id}`);
}
