import { createAdminClient } from "@/lib/supabase/admin";

interface NewBookingArgs {
  professionalId: string;
  bookingId?: string;
  clientName: string;
  serviceDescription: string;
  whenText: string | null;
}

/** Format a booking date/time as "miércoles, 10 de junio a las 14:00". */
export function formatBookingWhen(
  date?: string | null,
  time?: string | null,
  fallback?: string | null
): string | null {
  if (date) {
    const [y, m, d] = date.split("-").map(Number);
    const label = new Date(y, m - 1, d).toLocaleDateString("es-CR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    const tt = time ? String(time).slice(0, 5) : null;
    return tt ? `${label} a las ${tt}` : label;
  }
  return fallback ?? null;
}

/**
 * Notify a professional that they received a new booking.
 * Best-effort through in-app + optional WhatsApp. Activity emails are
 * intentionally not sent; email stays reserved for account/security,
 * verification, and support.
 */
export async function notifyNewBooking({
  professionalId,
  bookingId,
  clientName,
  serviceDescription,
  whenText,
}: NewBookingArgs): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: pro } = await admin
      .from("professionals")
      .select("profile_id, whatsapp, profiles(full_name)")
      .eq("id", professionalId)
      .maybeSingle();

    if (!pro) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = pro.profiles as any;
    const proName: string = profile?.full_name ?? "profesional";
    const firstName = proName.split(" ")[0];

    const title = "Nueva solicitud de servicio";
    const message = whenText
      ? `${clientName} solicitó '${serviceDescription}' para el ${whenText}.`
      : `${clientName} solicitó '${serviceDescription}'.`;

    await admin.from("notifications").insert({
      user_id: pro.profile_id,
      type: "booking_received",
      title,
      message,
      data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: bookingId ?? null },
    });

    await sendProWhatsApp(pro.whatsapp as string | undefined, firstName, clientName, serviceDescription, whenText);
  } catch (err) {
    console.error("[notifyNewBooking] failed:", err);
  }
}

/**
 * Notify a client that the professional accepted or cancelled their booking.
 * Sends in-app and optionally through ContrataCR's WhatsApp Business number.
 * No email is sent for normal app activity.
 */
export async function notifyBookingStatusChange(
  bookingId: string,
  status: "confirmed" | "cancelled",
  reason?: string
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: booking } = await admin
      .from("bookings")
      .select(
        `client_id, client_name, client_phone,
         service_description, scheduled_date, scheduled_time, preferred_date_text,
         professionals(profiles(full_name))`
      )
      .eq("id", bookingId)
      .maybeSingle();

    if (!booking) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const proName: string = (booking.professionals as any)?.profiles?.full_name ?? "El profesional";
    const service = booking.service_description ?? "tu servicio";
    const whenText = formatBookingWhen(
      booking.scheduled_date as string | null,
      booking.scheduled_time as string | null,
      booking.preferred_date_text as string | null
    );

    const verb = status === "confirmed" ? "confirmó" : "canceló";
    const title = status === "confirmed" ? "Solicitud confirmada" : "Solicitud cancelada";
    const reasonText = status === "cancelled" && reason && reason.trim() ? ` Motivo: ${reason.trim()}` : "";
    const message = (whenText
      ? `${proName} ${verb} tu solicitud de '${service}' para el ${whenText}.`
      : `${proName} ${verb} tu solicitud de '${service}'.`) + reasonText;

    if (booking.client_id) {
      await admin.from("notifications").insert({
        user_id: booking.client_id,
        type: status === "confirmed" ? "booking_confirmed" : "booking_cancelled",
        title,
        message,
        data: { link: "/es/dashboard/cliente?tab=bookings", booking_id: bookingId },
      });
    }

    const clientFirst = (booking.client_name as string | null)?.split(" ")[0] ?? "";
    const greeting = clientFirst ? `Hola ${clientFirst}, ` : "Hola, ";
    const waBody = `${greeting}${message} — ContrataCR`;
    const wa = await sendWhatsAppText(booking.client_phone as string | undefined, waBody);
    await recordDelivery(admin, bookingId, "whatsapp", wa.status, wa.detail);
  } catch (err) {
    console.error("[notifyBookingStatusChange] failed:", err);
  }
}

/**
 * The client reschedules their own appointment; notify the professional.
 * In-app + optional WhatsApp only.
 */
export async function notifyBookingRescheduled(bookingId: string): Promise<void> {
  try {
    const admin = createAdminClient();
    const { data: booking } = await admin
      .from("bookings")
      .select(
        `client_name, service_description, scheduled_date, scheduled_time, preferred_date_text,
         professionals(whatsapp, profile_id, profiles(full_name))`
      )
      .eq("id", bookingId)
      .maybeSingle();
    if (!booking) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const pro = booking.professionals as any;
    const proId: string | undefined = pro?.profile_id;
    const clientFirst = (booking.client_name as string | null)?.split(" ")[0] || "Tu cliente";
    const service = booking.service_description ?? "el servicio";
    const whenText = formatBookingWhen(
      booking.scheduled_date as string | null,
      booking.scheduled_time as string | null,
      booking.preferred_date_text as string | null
    );
    const title = "Cita reprogramada";
    const message = whenText
      ? `${clientFirst} cambió el horario de '${service}' a ${whenText}. Coordina los detalles por WhatsApp.`
      : `${clientFirst} cambió el horario de '${service}'. Coordina los detalles por WhatsApp.`;

    if (proId) {
      await admin.from("notifications").insert({
        user_id: proId,
        type: "booking_rescheduled",
        title,
        message,
        data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: bookingId },
      });
    }

    const wa = await sendWhatsAppText(pro?.whatsapp as string | undefined, `${message} — ContrataCR`);
    await recordDelivery(admin, bookingId, "whatsapp", wa.status, wa.detail);
  } catch (err) {
    console.error("[notifyBookingRescheduled] failed:", err);
  }
}

type DeliveryStatus = "sent" | "failed" | "skipped";

async function recordDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  bookingId: string,
  channel: "whatsapp",
  status: DeliveryStatus,
  detail: string | null
): Promise<void> {
  try {
    await admin.from("notification_deliveries").insert({
      booking_id: bookingId,
      channel,
      status,
      detail: detail ? detail.slice(0, 500) : null,
    });
  } catch (err) {
    console.error("[recordDelivery] failed:", err);
  }
}

async function sendWhatsAppText(
  toPhone: string | undefined,
  body: string
): Promise<{ status: DeliveryStatus; detail: string | null }> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { status: "skipped", detail: "WhatsApp Cloud API not configured" };
  if (!toPhone) return { status: "skipped", detail: "No phone on file" };

  const digits = toPhone.replace(/\D/g, "");
  const to = digits.length === 8 ? `506${digits}` : digits;

  try {
    const res = await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
    if (!res.ok) {
      const txt = await res.text().catch(() => "");
      return { status: "failed", detail: `HTTP ${res.status} ${txt}` };
    }
    return { status: "sent", detail: null };
  } catch (err) {
    return { status: "failed", detail: String(err) };
  }
}

async function sendProWhatsApp(
  proWhatsapp: string | undefined,
  proFirstName: string,
  clientName: string,
  serviceDescription: string,
  whenText: string | null
): Promise<void> {
  const body = `Hola ${proFirstName}, ${clientName} te envió una nueva solicitud${whenText ? ` para ${whenText}` : ""} en ContrataCR: ${serviceDescription}`;
  await sendWhatsAppText(proWhatsapp, body);
}
