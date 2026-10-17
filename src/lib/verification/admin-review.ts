import type { createAdminClient } from "@/lib/supabase/admin";
import { detectIdType, isValidId, type IdType } from "@/lib/cedula";
import { getIdentityVerifier } from "./identity-verifier";
import { verifiedProfileName } from "./profile-name";
import { runIdentityVerification } from "./run-verification";
import { invalidateProfessionalCache } from "@/lib/cache/professional-revision";

type DB = ReturnType<typeof createAdminClient>;
type Profile = { id: string; full_name: string | null; cedula: string | null; client_identity_status: string | null; is_disabled?: boolean };
export type PendingIdentity = {
  accountId: string; professionalId: string | null; name: string; cedula: string | null;
  type: IdType | null; status: string; manualReason: string | null;
};
export type IdentityReview = PendingIdentity & {
  kind: "match" | "not_found" | "unavailable" | "manual";
  officialName: string | null; canVerify: boolean; checkedAt: string;
};
const HUMAN_ACTIONS = ["verified", "authorized", "rejected", "reverted_pending", "under_appeal"];

/** Fetch every pending record, never a partial newest-200 snapshot of the queue. */
export async function pendingIdentities(db: DB): Promise<PendingIdentity[]> {
  type Pro = { id: string; profile_id: string; verification_status: string; is_verified: boolean; is_banned: boolean; profiles: unknown };
  const pros: Pro[] = [];
  const clients: Profile[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("professionals")
      .select("id, profile_id, verification_status, is_verified, is_banned, profiles(id, full_name, cedula, client_identity_status, is_disabled)")
      .in("verification_status", ["pending", "under_appeal"]).order("id").range(offset, offset + 499);
    if (error) throw error;
    pros.push(...(data ?? []) as Pro[]); if ((data?.length ?? 0) < 500) break;
  }
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db.from("profiles").select("id, full_name, cedula, client_identity_status, is_disabled")
      .eq("client_identity_status", "pending").order("id").range(offset, offset + 499);
    if (error) throw error;
    clients.push(...(data ?? []) as Profile[]); if ((data?.length ?? 0) < 500) break;
  }
  const professionalOwners = new Set(pros.map(pro => pro.profile_id));
  for (let offset = 0; offset < clients.length; offset += 100) {
    const { data, error } = await db.from("professionals").select("profile_id").in("profile_id", clients.slice(offset, offset + 100).map(profile => profile.id));
    if (error) throw error;
    for (const pro of data ?? []) professionalOwners.add(pro.profile_id);
  }
  const rows: PendingIdentity[] = pros.map(pro => {
    const profile = pro.profiles as Profile | null;
    const cedula = profile?.cedula ? profile.cedula.replace(/[\s-]/g, "") : null;
    return { accountId: pro.profile_id, professionalId: pro.id, name: profile?.full_name ?? "Sin nombre", cedula,
      type: cedula ? detectIdType(cedula) : null, status: pro.verification_status,
      manualReason: pro.is_verified || profile?.client_identity_status === "verified" ? "La cuenta ya tiene una aprobación; revisar su estado en la ficha."
        : profile?.is_disabled ? "Cuenta deshabilitada: requiere revisión del administrador."
        : pro.is_banned ? "Cuenta bloqueada: requiere revisión del administrador."
        : pro.verification_status === "under_appeal" ? "Apelación en revisión manual." : null };
  });
  for (const profile of clients) if (!professionalOwners.has(profile.id)) {
    const cedula = profile.cedula ? profile.cedula.replace(/[\s-]/g, "") : null;
    rows.push({ accountId: profile.id, professionalId: null, name: profile.full_name ?? "Sin nombre", cedula,
      type: cedula ? detectIdType(cedula) : null, status: "pending", manualReason: profile.is_disabled ? "Cuenta deshabilitada: requiere revisión del administrador." : null });
  }
  // Human decisions and open document cases must never be silently re-approved.
  for (let offset = 0; offset < rows.length; offset += 100) {
    const chunk = rows.slice(offset, offset + 100);
    const proIds = chunk.flatMap(row => row.professionalId ? [row.professionalId] : []);
    const manualAccounts = new Set<string>();
    const manualPros = new Set<string>();
    for (let start = 0; ; start += 500) {
      const { data: tickets, error } = await db.from("support_tickets").select("user_id")
        .in("user_id", chunk.map(row => row.accountId)).in("topic", ["verification_documents", "verification_appeal"])
        .in("status", ["open", "in_progress"]).order("id").range(start, start + 499);
      if (error) throw error;
      for (const ticket of tickets ?? []) if (ticket.user_id) manualAccounts.add(ticket.user_id);
      if ((tickets?.length ?? 0) < 500) break;
    }
    if (proIds.length) for (let start = 0; ; start += 500) {
      const { data: history, error } = await db.from("provider_verification_log").select("professional_id")
        .in("professional_id", proIds).in("action", HUMAN_ACTIONS).order("id").range(start, start + 499);
      if (error) throw error;
      for (const log of history ?? []) manualPros.add(log.professional_id);
      if ((history?.length ?? 0) < 500) break;
    }
    for (const row of chunk) {
      if (manualAccounts.has(row.accountId)) row.manualReason ??= "Hay un caso de documentos o apelación abierto.";
      if (row.professionalId && manualPros.has(row.professionalId)) row.manualReason ??= "Hay una decisión administrativa anterior; requiere revisión manual.";
      if (!row.cedula || !isValidId(row.cedula)) row.manualReason ??= "Falta una identificación válida; solicitar documentos desde Verificación.";
    }
  }
  return rows.sort((a, b) => a.accountId.localeCompare(b.accountId));
}

/** Read-only check. Tax status and activities are never returned or saved. */
export async function inspectPendingIdentity(row: PendingIdentity): Promise<IdentityReview> {
  const base = { ...row, officialName: null, canVerify: false, checkedAt: new Date().toISOString() };
  if (!row.cedula || !isValidId(row.cedula)) return { ...base, kind: "manual" };
  const result = await getIdentityVerifier().lookup(row.cedula);
  if (result.unavailable) return { ...base, kind: "unavailable" };
  if (!result.found || !result.fullName) return { ...base, kind: "not_found" };
  const checked = { ...base, type: result.idType ?? row.type, officialName: result.fullName };
  if (row.manualReason) return { ...checked, kind: "manual" };
  return { ...checked, kind: "match", canVerify: true };
}

/** Explicit admin action only. Re-check saved identity and eligibility on every call. */
export async function verifyPendingIdentity(db: DB, accountId: string, expectedCedula: string) {
  const row = (await pendingIdentities(db)).find(candidate => candidate.accountId === accountId);
  if (!row || !row.cedula || row.cedula !== expectedCedula) return { outcome: "changed" as const };
  const review = await inspectPendingIdentity(row);
  if (!review.canVerify || !review.officialName) return { outcome: "manual" as const, review };
  if (row.professionalId) {
    const outcome = await runIdentityVerification(row.professionalId, { notifyChannel: "in_app", expectedCedula });
    return { outcome, review };
  }
  const name = await verifiedProfileName(db, row.accountId, row.name, row.cedula, review.officialName);
  if (name !== row.name) {
    const { data: account, error: accountError } = await db.auth.admin.getUserById(row.accountId);
    if (accountError || !account.user) throw new Error("No se pudo cargar la cuenta.");
    const { error: authError } = await db.auth.admin.updateUserById(row.accountId, { user_metadata: { ...account.user.user_metadata, full_name: name } });
    if (authError) throw authError;
  }
  const now = new Date().toISOString();
  const { data: saved, error } = await db.from("profiles").update({ full_name: name, client_identity_status: "verified",
    client_identity_verified_at: now, client_identity_provider: "hacienda_api" })
    .eq("id", row.accountId).eq("cedula", expectedCedula).eq("client_identity_status", "pending").eq("full_name", row.name).select("id").maybeSingle();
  if (error) throw error;
  if (!saved) return { outcome: "changed" as const, review };
  const { error: projectError } = await db.from("projects").update({ client_identity_status: "verified" }).eq("client_id", row.accountId).eq("status", "open");
  if (projectError) throw projectError;
  try { await invalidateProfessionalCache(); } catch { /* Saved state remains authoritative; cached listings expire normally. */ }
  return { outcome: "verified" as const, review };
}
