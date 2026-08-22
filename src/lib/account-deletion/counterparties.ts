import type { SupabaseClient } from "@supabase/supabase-js";
import { sendNotificationPush } from "@/lib/push/notify";

// When an account is deleted for good, the people on the other side of its open
// relationships must not be left guessing: the request, project, application or
// conversation simply vanishes for them. Collect those people before the
// finalizer runs (it anonymizes and deletes the rows) and tell them afterwards,
// in plain words and without naming anything that no longer exists.

export type Counterparty = { userId: string; what: string };

const OPEN_BOOKING = ["pending", "confirmed", "in_progress", "awaiting_confirmation"];
const OPEN_PROJECT = ["open", "in_progress", "awaiting_confirmation"];

export async function collectCounterparties(db: SupabaseClient, userId: string): Promise<{ name: string; parties: Counterparty[] }> {
  const parties = new Map<string, Set<string>>();
  const add = (otherUserId: string | null | undefined, what: string) => {
    if (!otherUserId || otherUserId === userId) return;
    const set = parties.get(otherUserId) ?? new Set<string>();
    set.add(what);
    parties.set(otherUserId, set);
  };

  const { data: profile } = await db.from("profiles").select("full_name").eq("id", userId).maybeSingle();
  const { data: ownPros } = await db.from("professionals").select("id, business_name").eq("profile_id", userId);
  const ownProIds = (ownPros ?? []).map((row) => row.id);
  const name = (ownPros?.[0]?.business_name || profile?.full_name || "Una persona").trim();

  const proOwner = async (professionalIds: string[]) => {
    if (!professionalIds.length) return new Map<string, string | null>();
    const { data } = await db.from("professionals").select("id, profile_id").in("id", professionalIds);
    return new Map((data ?? []).map((row) => [row.id, row.profile_id as string | null]));
  };

  // Direct requests (bookings) still open, from either side.
  const { data: asClient } = await db.from("bookings").select("professional_id, status").eq("client_id", userId).in("status", OPEN_BOOKING);
  const owners = await proOwner([...new Set((asClient ?? []).map((row) => row.professional_id as string).filter(Boolean))]);
  for (const row of asClient ?? []) add(owners.get(row.professional_id as string), "una solicitud de servicio abierta");
  if (ownProIds.length) {
    const { data: asPro } = await db.from("bookings").select("client_id, status").in("professional_id", ownProIds).in("status", OPEN_BOOKING);
    for (const row of asPro ?? []) add(row.client_id as string, "una solicitud de servicio abierta");
  }

  // Projects: the accepted professional of an open project, professionals with
  // pending proposals on it, and clients whose projects had this account's proposal.
  const { data: ownProjects } = await db.from("projects").select("id, accepted_professional_id, status").eq("client_id", userId).in("status", OPEN_PROJECT);
  const ownProjectIds = (ownProjects ?? []).map((row) => row.id);
  if (ownProjectIds.length) {
    const { data: proposals } = await db.from("proposals").select("professional_id, status").in("project_id", ownProjectIds).in("status", ["pending", "accepted"]);
    const proposalOwners = await proOwner([...new Set([...(proposals ?? []).map((row) => row.professional_id as string), ...(ownProjects ?? []).map((row) => row.accepted_professional_id as string)].filter(Boolean))]);
    for (const row of proposals ?? []) add(proposalOwners.get(row.professional_id as string), row.status === "accepted" ? "un proyecto en curso" : "una propuesta enviada a un proyecto");
    for (const row of ownProjects ?? []) if (row.accepted_professional_id) add(proposalOwners.get(row.accepted_professional_id as string), "un proyecto en curso");
  }
  if (ownProIds.length) {
    const { data: myProposals } = await db.from("proposals").select("project_id, status").in("professional_id", ownProIds).in("status", ["pending", "accepted"]);
    const projectIds = [...new Set((myProposals ?? []).map((row) => row.project_id as string))];
    if (projectIds.length) {
      const { data: projects } = await db.from("projects").select("id, client_id, status").in("id", projectIds).in("status", OPEN_PROJECT);
      for (const project of projects ?? []) add(project.client_id as string, "un proyecto con una propuesta pendiente o aceptada");
    }
  }

  // Jobs: applicants of this account's open vacancies, employers of its pending applications.
  if (ownProIds.length) {
    const { data: jobs } = await db.from("job_posts").select("id").in("employer_id", ownProIds).in("status", ["published", "paused"]);
    const jobIds = (jobs ?? []).map((row) => row.id);
    if (jobIds.length) {
      const { data: applications } = await db.from("job_applications").select("applicant_id").in("job_id", jobIds);
      for (const row of applications ?? []) add(row.applicant_id as string, "una postulación a un empleo");
    }
  }
  const { data: myApplications } = await db.from("job_applications").select("job_id").eq("applicant_id", userId);
  const appliedJobIds = [...new Set((myApplications ?? []).map((row) => row.job_id as string))];
  if (appliedJobIds.length) {
    const { data: jobs } = await db.from("job_posts").select("employer_id").in("id", appliedJobIds).in("status", ["published", "paused"]);
    const employerOwners = await proOwner([...new Set((jobs ?? []).map((row) => row.employer_id as string).filter(Boolean))]);
    for (const row of jobs ?? []) add(employerOwners.get(row.employer_id as string), "una postulación recibida en un empleo");
  }

  // Direct conversations that were still active.
  const { data: conversations } = await db
    .from("direct_conversations")
    .select("client_id, professional_profile_id, status")
    .or(`client_id.eq.${userId},professional_profile_id.eq.${userId}`)
    .neq("status", "closed");
  for (const row of conversations ?? []) {
    add(row.client_id === userId ? (row.professional_profile_id as string) : (row.client_id as string), "una conversación abierta");
  }

  return { name, parties: [...parties.entries()].map(([otherUserId, whats]) => ({ userId: otherUserId, what: [...whats].join(", ") })) };
}

export async function notifyCounterparties(db: SupabaseClient, name: string, parties: Counterparty[]): Promise<void> {
  for (const party of parties) {
    try {
      const title = "Una cuenta con la que tenías algo abierto se eliminó";
      const message = `${name} eliminó su cuenta de ContrataCR. Tenían ${party.what}; ya no aparece en tu panel y no hace falta que hagas nada. Si necesitas ayuda, escríbenos a soporte.`;
      const notification = { user_id: party.userId, type: "counterparty_account_deleted", title, message, data: { href: "/dashboard/profesional?tab=soporte" } };
      const { error } = await db.from("notifications").insert(notification);
      if (error) throw error;
      await sendNotificationPush({ userId: party.userId, title, message, data: notification.data });
    } catch (error) {
      console.warn("[account-deletion] counterparty notice failed", party.userId, error instanceof Error ? error.message : error);
    }
  }
}
