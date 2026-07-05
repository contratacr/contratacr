import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { notifyNewBooking, notifyBookingStatusChange, notifyBookingRescheduled } from "@/lib/notifications";
import { cleanId, detectIdType, isValidId } from "@/lib/cedula";
import { getIdentityVerifier } from "@/lib/verification/identity-verifier";
import { syncProfessionalVerificationFromAccount } from "@/lib/verification/account-identity";
import { AUTO_CONFIRM_DAYS } from "@/lib/completion";
import { LONG_TEXT_MAX_LENGTH, NAME_MAX_LENGTH, SHORT_TEXT_MAX_LENGTH, limitTrimmedText } from "@/lib/text-limits";

// Lazy auto-confirm: a booking the pro marked "trabajo realizado" auto-completes
// after AUTO_CONFIRM_DAYS if the client never confirmed. Best-effort.
async function autoConfirmStale(admin: ReturnType<typeof createAdminClient>, filter: { professional_id?: string; client_id?: string }) {
  try {
    const cutoff = new Date(Date.now() - AUTO_CONFIRM_DAYS * 24 * 60 * 60 * 1000).toISOString();
    let q = admin.from("bookings").update({ status: "completed", completed_at: new Date().toISOString() })
      .eq("status", "awaiting_confirmation").lt("work_done_at", cutoff);
    if (filter.professional_id) q = q.eq("professional_id", filter.professional_id);
    if (filter.client_id) q = q.eq("client_id", filter.client_id);
    await q;
  } catch { /* column may not be migrated yet */ }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { professionalId, clientCedula, clientName, clientEmail, serviceDescription, preferredDateText } = body;

    if (!professionalId || !serviceDescription) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    const supabase = await createClient();

    // Check if an authenticated user session exists to link the booking
    const { data: { session } } = await supabase.auth.getSession();
    const cleanClientCedula = cleanId(typeof clientCedula === "string" ? clientCedula : "");
    if (cleanClientCedula && !isValidId(cleanClientCedula)) {
      return NextResponse.json({ error: "Ingresa un numero de identificacion valido." }, { status: 400 });
    }

    // Self-interaction guard: a professional cannot request a service from themselves.
    if (session?.user) {
      const admin = createAdminClient();
      const { data: targetPro } = await admin
        .from("professionals")
        .select("profile_id")
        .eq("id", professionalId)
        .maybeSingle();
      if (targetPro?.profile_id === session.user.id) {
        return NextResponse.json({ error: "No puedes solicitarte un servicio a ti mismo." }, { status: 400 });
      }

      if (cleanClientCedula) {
        const { data: dupe } = await admin
          .from("profiles")
          .select("id")
          .eq("cedula", cleanClientCedula)
          .neq("id", session.user.id)
          .maybeSingle();

        if (dupe) {
          return NextResponse.json({ error: "Esta identificacion ya esta registrada en ContrataCR." }, { status: 409 });
        }

        let accountIdentityStatus: "verified" | "pending" | "unverified" = "unverified";
        let officialName: string | null = null;
        let identityProvider: string | null = null;

        const idType = detectIdType(cleanClientCedula);
        if (idType === "cedula") {
          const result = await getIdentityVerifier().lookup(cleanClientCedula);
          if (result.unavailable) {
            return NextResponse.json({ error: "No pudimos consultar el padrón en este momento. Intenta de nuevo en unos minutos." }, { status: 503 });
          }
          identityProvider = result.provider;
          if (result.found) {
            accountIdentityStatus = "verified";
            officialName = result.fullName ?? null;
          }
        } else {
          accountIdentityStatus = "pending";
        }

        await admin
          .from("profiles")
          .update({
            cedula: cleanClientCedula,
            ...(officialName ? { full_name: officialName } : {}),
            client_identity_status: accountIdentityStatus,
            client_identity_verified_at: accountIdentityStatus === "verified" ? new Date().toISOString() : null,
            client_identity_provider: identityProvider,
          })
          .eq("id", session.user.id);

        await syncProfessionalVerificationFromAccount(admin, session.user.id, accountIdentityStatus, identityProvider);

        if (officialName) {
          try {
            const { data: authUser } = await admin.auth.admin.getUserById(session.user.id);
            await admin.auth.admin.updateUserById(session.user.id, {
              user_metadata: { ...(authUser?.user?.user_metadata ?? {}), full_name: officialName },
            });
          } catch { /* profile is the source of truth */ }
        }
      }
    }

    const {
      scheduledDate, scheduledTime, clientPhone, clientDob,
      forSomeoneElse, beneficiaryName, beneficiaryCedula, beneficiaryDob, beneficiaryPhone, beneficiaryIsMinor,
      categoryId, slotLocationId, slotLocationLabel,
    } = body;

    // No double-booking: if this request targets a specific slot, reject it when
    // another active booking already holds that pro + date + time. (Cancelled /
    // completed bookings free the slot again, so they don't count here.) This is the
    // FAST-PATH check; the migration-069 partial unique index is the ATOMIC guard
    // that wins a true race (the loser's INSERT hits 23505 → handled below).
    if (scheduledDate && scheduledTime) {
      const admin = createAdminClient();
      const { data: clash } = await admin
        .from("bookings")
        .select("id")
        .eq("professional_id", professionalId)
        .eq("scheduled_date", scheduledDate)
        .eq("scheduled_time", scheduledTime)
        .in("status", ["pending", "confirmed", "in_progress", "awaiting_confirmation"])
        .limit(1);
      if (clash && clash.length > 0) {
        return NextResponse.json(
          { error: "Ese horario acaba de ser reservado. Elige otra hora disponible." },
          { status: 409 }
        );
      }
    }

    const baseBooking = {
      professional_id: professionalId,
      client_id: session?.user?.id ?? null,
      client_cedula: cleanClientCedula || null,
      client_name: limitTrimmedText(clientName, NAME_MAX_LENGTH) || "Cliente",
      client_email: clientEmail ?? null,
      client_phone: clientPhone ?? null,
      service_description: limitTrimmedText(serviceDescription, LONG_TEXT_MAX_LENGTH),
      preferred_date_text: preferredDateText ? limitTrimmedText(preferredDateText, SHORT_TEXT_MAX_LENGTH) : null,
      scheduled_date: scheduledDate ?? null,
      scheduled_time: scheduledTime ?? null,
      // AUTO-CONFIRM: a solicitud in an available slot is confirmed immediately and
      // holds the slot — no manual "accept" step. The professional manages exceptions
      // (decline an unverified/unwanted client, reschedule) from their panel + WhatsApp.
      status: "confirmed",
    };
    // Beneficiary fields (booking for someone else) — optional; retried-away if
    // the columns aren't migrated yet (migration 032).
    const beneficiaryFields = {
      for_someone_else: !!forSomeoneElse,
      beneficiary_name: beneficiaryName ? limitTrimmedText(beneficiaryName, NAME_MAX_LENGTH) : null,
      beneficiary_cedula: beneficiaryCedula ?? null,
      beneficiary_dob: beneficiaryDob ?? null,
      beneficiary_phone: beneficiaryPhone ?? null,
      beneficiary_is_minor: !!beneficiaryIsMinor,
      // Client DOB — sent only for HEALTH-category services (data minimization).
      client_dob: clientDob ?? null,
      // (service + location) context of the picked slot (migration 038).
      category_id: categoryId ?? null,
      slot_location_id: slotLocationId ?? null,
      slot_location_label: slotLocationLabel ? limitTrimmedText(slotLocationLabel, SHORT_TEXT_MAX_LENGTH) : null,
    };

    // Insert via the service-role client: the API has already validated the
    // payload and the self-request guard, and client_id is set from the session
    // (or null for a guest). This makes the save resilient to any INSERT
    // row-policy regression on `bookings` (core flow must never silently fail).
    const adminInsert = createAdminClient();
    let { data, error } = await adminInsert.from("bookings").insert({ ...baseBooking, ...beneficiaryFields }).select("id").single();
    if (error && /for_someone_else|beneficiary_|client_dob|category_id|slot_location|column|schema cache|PGRST204|could not find/i.test(error.message)) {
      ({ data, error } = await adminInsert.from("bookings").insert(baseBooking).select("id").single());
    }

    // ATOMIC double-booking guard (migration 069): a concurrent request that won the
    // race already holds this slot → our INSERT violates the partial unique index
    // (23505). Return the same friendly 409 as the fast-path check above.
    if (error && ((error as { code?: string }).code === "23505" || /duplicate key|unique|bookings_active_slot/i.test(error.message))) {
      return NextResponse.json(
        { error: "Ese horario acaba de ser reservado. Elige otra hora disponible." },
        { status: 409 }
      );
    }

    if (error) {
      console.error("[POST /api/bookings]", error);
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Failed to create booking" }, { status: 500 });
    }

    // Persist the DOB for reuse on FUTURE medical requests (backend-only — the padrón
    // has no birth date, and this is NEVER shown as a profile/account field). Self →
    // profiles.date_of_birth; beneficiary → beneficiary_dob keyed by (owner, cédula).
    // Best-effort: the booking already succeeded, so a save miss must never fail it.
    if (session?.user) {
      try {
        if (!forSomeoneElse && clientDob) {
          await adminInsert.from("profiles").update({ date_of_birth: clientDob }).eq("id", session.user.id);
        }
        if (forSomeoneElse && beneficiaryCedula && beneficiaryDob) {
          await adminInsert.from("beneficiary_dob").upsert(
            { owner_id: session.user.id, cedula: String(beneficiaryCedula).replace(/\D/g, ""), dob: beneficiaryDob, updated_at: new Date().toISOString() },
            { onConflict: "owner_id,cedula" }
          );
        }
      } catch { /* best-effort — never fail the booking over the DOB cache */ }
    }

    // Notify the professional (in-app + optional WhatsApp). Best-effort.
    await notifyNewBooking({
      professionalId,
      bookingId: data.id,
      clientName: clientName || "Un cliente",
      serviceDescription,
      whenText: preferredDateText ?? null,
    });

    // If email provided and no session, send magic link to create / sign in account
    if (clientEmail && !session?.user) {
      await supabase.auth.signInWithOtp({
        email: clientEmail,
        options: {
          data: { cedula: clientCedula, full_name: clientName },
        },
      });
    }

    return NextResponse.json({ id: data.id, success: true });
  } catch (err) {
    console.error("[POST /api/bookings] Unexpected error:", err);
    return NextResponse.json({ error: "Internal server error" }, { status: 500 });
  }
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const role = searchParams.get("role");

  // Public: taken slots for a professional (date + time only, no PII).
  // Lets the booking calendar hide slots already booked by other clients.
  const takenForPro = searchParams.get("takenFor");
  if (takenForPro) {
    const admin = createAdminClient();
    const { data } = await admin
      .from("bookings")
      .select("scheduled_date, scheduled_time")
      .eq("professional_id", takenForPro)
      .in("status", ["pending", "confirmed", "in_progress", "awaiting_confirmation"])
      .not("scheduled_date", "is", null)
      .not("scheduled_time", "is", null);
    return NextResponse.json({
      // Normalize time to HH:MM (Postgres `time` may return HH:MM:SS).
      taken: (data ?? []).map((b) => `${b.scheduled_date} ${String(b.scheduled_time).slice(0, 5)}`),
    });
  }

  const supabase = await createClient();

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (role === "professional") {
    // Get professional ID for this user
    const { data: pro } = await supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", session.user.id)
      .single();

    if (!pro) return NextResponse.json({ bookings: [] });

    const adminPro = createAdminClient();
    await autoConfirmStale(adminPro, { professional_id: pro.id });

    // Read via the service-role client (authorized above by pro.id). The embedded
    // client profile needs `is_flagged` (a moderation column) which migration 047
    // removed from the anon/authenticated column grants — selecting it with the
    // RLS client now errors and silently returns NO bookings. Admin bypasses the
    // column grant; the query is still scoped to THIS pro's bookings only.
    const { data, error } = await adminPro
      .from("bookings")
      .select("*, profiles:client_id(full_name, avatar_url, is_flagged)")
      .eq("professional_id", pro.id)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("[GET /api/bookings] professional error:", error.message);
      return NextResponse.json({ error: error.message, bookings: [] }, { status: 500 });
    }
    return NextResponse.json({ bookings: (data ?? []).filter((b) => !b.archived_by_professional) });
  }

  // Client role. Read via the service-role client, scoped to THIS client's id
  // (authorized by the session above). RLS row-policy changes on `bookings` would
  // otherwise silently filter the client's own sent requests to an empty list.
  const adminClient = createAdminClient();
  await autoConfirmStale(adminClient, { client_id: session.user.id });
  // NOTE: professionals↔categories has no FK (category_id is plain text), so an
  // embedded categories(...) join 500s and silently drops every booking. Select
  // category_id as a column instead.
  const { data, error } = await adminClient
    .from("bookings")
    .select("*, professionals(slug, category_id, profiles(full_name, avatar_url))")
    .eq("client_id", session.user.id)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/bookings] client error:", error.message);
    return NextResponse.json({ error: error.message, bookings: [] }, { status: 500 });
  }
  return NextResponse.json({ bookings: (data ?? []).filter((b) => !b.archived_by_client) });
}

export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const { id, status, cancelReason, scheduledDate, scheduledTime, action, slotLocationId, slotLocationLabel } = body;
  // A reschedule carries a new slot (the pro proposes a different time); the booking
  // stays active ("confirmed") at the new time and the client is notified.
  const isReschedule = !!scheduledDate && !!scheduledTime;

  const supabase = await createClient();
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  // Identify who is updating (professional vs client) to set ownership fields and
  // notify the OTHER party on every state change.
  const { data: actorPro } = await supabase
    .from("professionals")
    .select("id")
    .eq("profile_id", session.user.id)
    .maybeSingle();

  // Authorize against the actual row, then persist with the service-role client.
  // (The RLS-bound update could silently affect 0 rows if no UPDATE policy covers
  // the professional — which is exactly why confirm/complete wasn't persisting.)
  const admin = createAdminClient();
  const { data: bookingRow } = await admin
    .from("bookings")
    .select("id, professional_id, client_id, status")
    .eq("id", id)
    .maybeSingle();
  if (!bookingRow) return NextResponse.json({ error: "Solicitud no encontrada." }, { status: 404 });

  const isOwnerPro = !!actorPro && bookingRow.professional_id === actorPro.id;
  const isOwnerClient = bookingRow.client_id === session.user.id;
  if (!isOwnerPro && !isOwnerClient) {
    return NextResponse.json({ error: "No autorizado." }, { status: 403 });
  }

  if (action === "archive") {
    if (bookingRow.status !== "cancelled" && bookingRow.status !== "rescheduled") {
      return NextResponse.json({ error: "Solo puedes archivar solicitudes canceladas." }, { status: 409 });
    }
    const archivePatch = isOwnerPro ? { archived_by_professional: true } : { archived_by_client: true };
    const { error: archiveError } = await admin.from("bookings").update(archivePatch).eq("id", id);
    if (archiveError) return NextResponse.json({ error: archiveError.message }, { status: 500 });
    return NextResponse.json({ success: true });
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = { status, updated_at: now };
  // Lifecycle timestamps + cancellation ownership (migration 033).
  if (status === "awaiting_confirmation") update.work_done_at = now;
  if (status === "completed") update.completed_at = now;
  if (status === "cancelled") {
    update.cancelled_by = isOwnerPro ? "professional" : "client";
    if (typeof cancelReason === "string" && cancelReason.trim()) update.cancel_reason = cancelReason.trim();
  }
  // Reschedule → move the booking to the new slot (the migration-069 unique index
  // keeps it atomic: if that slot is already taken, the UPDATE hits 23505 → 409).
  if (isReschedule) {
    update.scheduled_date = scheduledDate;
    update.scheduled_time = scheduledTime;
    if ("slotLocationId" in body) update.slot_location_id = slotLocationId ?? null;
    if ("slotLocationLabel" in body) {
      update.slot_location_label = typeof slotLocationLabel === "string"
        ? limitTrimmedText(slotLocationLabel, SHORT_TEXT_MAX_LENGTH)
        : null;
    }
  }

  let { error } = await admin.from("bookings").update(update).eq("id", id);
  // Slot already taken (atomic guard) → friendly 409, before the column-retry below.
  if (error && ((error as { code?: string }).code === "23505" || /duplicate key|unique|bookings_active_slot/i.test(error.message))) {
    return NextResponse.json({ error: "Ese horario ya está reservado. Elige otra hora." }, { status: 409 });
  }
  // Retry without the new lifecycle columns if not migrated yet.
  if (error && /work_done_at|completed_at|cancelled_by|cancel_reason|column|schema cache|PGRST204/i.test(error.message)) {
    const fallback: Record<string, unknown> = { status, updated_at: now };
    if (isReschedule) {
      fallback.scheduled_date = scheduledDate;
      fallback.scheduled_time = scheduledTime;
      if ("slotLocationId" in body) fallback.slot_location_id = slotLocationId ?? null;
      if ("slotLocationLabel" in body) {
        fallback.slot_location_label = typeof slotLocationLabel === "string"
          ? limitTrimmedText(slotLocationLabel, SHORT_TEXT_MAX_LENGTH)
          : null;
      }
    }
    ({ error } = await admin.from("bookings").update(fallback).eq("id", id));
  }

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  // Notify the OTHER party on every state change (best-effort, never blocks).
  // `notifyBookingStatusChange` always notifies the CLIENT, so only fire it for a
  // PRO-initiated cancel (the pro telling the client). A CLIENT-initiated cancel
  // notifies the PRO instead (in the in-app block below) — never the client itself.
  if (isReschedule) {
    await notifyBookingRescheduled(id);
  } else if (status === "confirmed" || (status === "cancelled" && isOwnerPro)) {
    await notifyBookingStatusChange(id, status, typeof cancelReason === "string" ? cancelReason : undefined);
  }
  // In-app notification to the other side for the new lifecycle states.
  try {
    const otherUserId = isOwnerPro ? bookingRow.client_id : null;
    const labelMap: Record<string, { title: string; message: string }> = {
      awaiting_confirmation: { title: "El profesional marcó el trabajo como realizado", message: `Confirma la finalización para cerrar la solicitud. Se confirma automáticamente en ${AUTO_CONFIRM_DAYS} días.` },
      in_progress: { title: "Tu solicitud está en progreso", message: "El profesional marcó tu solicitud en progreso." },
    };
    if (isOwnerPro && otherUserId && labelMap[status]) {
      await admin.from("notifications").insert({
        user_id: otherUserId,
        type: "booking_update",
        title: labelMap[status].title,
        message: labelMap[status].message,
        data: { link: "/es/dashboard/profesional?tab=sent_bookings", booking_id: id },
      });
    }
    // Client confirmed completion → notify the professional.
    if (isOwnerClient && status === "completed") {
      const { data: pr } = await admin.from("professionals").select("profile_id").eq("id", bookingRow.professional_id).maybeSingle();
      if (pr?.profile_id) {
        await admin.from("notifications").insert({
          user_id: pr.profile_id,
          type: "booking_completed_by_client",
          title: "El cliente confirmó la finalización",
          message: "La solicitud quedó finalizada.",
          data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: id },
        });
      }
    }
    // Client cancelled their own booking → notify the professional (their slot freed),
    // with the motivo if the client added one. Links to Solicitudes recibidas.
    if (isOwnerClient && status === "cancelled") {
      const { data: pr } = await admin.from("professionals").select("profile_id").eq("id", bookingRow.professional_id).maybeSingle();
      if (pr?.profile_id) {
        const motivo = typeof cancelReason === "string" && cancelReason.trim() ? ` Motivo: ${cancelReason.trim()}` : "";
        await admin.from("notifications").insert({
          user_id: pr.profile_id,
          type: "booking_cancelled_by_client",
          title: "El cliente canceló la solicitud",
          message: `El cliente canceló su solicitud. El horario quedó libre.${motivo}`,
          data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: id },
        });
      }
    }
  } catch (e) { console.error("[PATCH /api/bookings] notify:", e); }

  // When a booking is marked completed, prompt the client to leave a review.
  if (status === "completed") {
    try {
      const { data: booking } = await admin
        .from("bookings")
        .select("client_id, professional_id, professionals(slug, profiles(full_name))")
        .eq("id", id)
        .maybeSingle();

      if (booking?.client_id) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const pro = booking.professionals as any;
        const proName = pro?.profiles?.full_name ?? "el profesional";
        await admin.from("notifications").insert({
          user_id: booking.client_id,
          type: "review_request",
          title: "¿Cómo te fue?",
          message: `Tu servicio con ${proName} se marcó como completado. Deja una reseña para ayudar a otros clientes.`,
        });
      }
    } catch (err) {
      console.error("[PATCH /api/bookings] review prompt failed:", err);
    }
  }

  return NextResponse.json({ success: true });
}
