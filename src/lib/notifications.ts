import { createAdminClient } from "@/lib/supabase/admin";
import { sendBrevoEmail } from "@/lib/email/send";

// Booking notifications are transactional and not meant to be replied to (the user
// acts in their panel), so they send from no-reply@ — not the soporte@ inbox.
const NO_REPLY = { name: "ContrataCR", email: "no-reply@contratacr.com" };

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
 * Best-effort across three channels (in-app, email, optional WhatsApp).
 * Never throws — notification failures must not break the booking.
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
      .select("profile_id, whatsapp, profiles(full_name, email)")
      .eq("id", professionalId)
      .maybeSingle();

    if (!pro) return;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const profile = pro.profiles as any;
    const proName: string = profile?.full_name ?? "profesional";
    const proEmail: string | undefined = profile?.email;
    const firstName = proName.split(" ")[0];

    const title = "Nueva solicitud de servicio";
    // Format: "[Client Name] solicitó '[Service]' para el [weekday], [day] de [month] a las [time]."
    const message = whenText
      ? `${clientName} solicitó '${serviceDescription}' para el ${whenText}.`
      : `${clientName} solicitó '${serviceDescription}'.`;

    // 1. In-app notification (with click-through link to the bookings tab)
    await admin.from("notifications").insert({
      user_id: pro.profile_id,
      type: "booking_received",
      title,
      message,
      data: { link: "/es/dashboard/profesional?tab=bookings", booking_id: bookingId ?? null },
    });

    // 2. Email via Resend
    await sendProEmail(proEmail, firstName, clientName, serviceDescription, whenText);

    // 3. WhatsApp (optional, no-op unless configured)
    await sendProWhatsApp(pro.whatsapp as string | undefined, firstName, clientName, serviceDescription, whenText);
  } catch (err) {
    console.error("[notifyNewBooking] failed:", err);
  }
}

/**
 * Notify a client that the professional accepted (confirmed) or cancelled their
 * booking. Sends from ContrataCR's own WhatsApp Business number + email — never
 * the professional's personal contact. WhatsApp is attempted first; on failure
 * (or when unavailable) it falls back to email. Every attempt's delivery status
 * is stored in `notification_deliveries`. Never throws.
 */
export async function notifyBookingStatusChange(
  bookingId: string,
  status: "confirmed" | "cancelled"
): Promise<void> {
  try {
    const admin = createAdminClient();

    const { data: booking } = await admin
      .from("bookings")
      .select(
        `client_id, client_name, client_email, client_phone,
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
    const message = whenText
      ? `${proName} ${verb} tu solicitud de '${service}' para el ${whenText}.`
      : `${proName} ${verb} tu solicitud de '${service}'.`;

    // 1. In-app notification to the client (with click-through link)
    if (booking.client_id) {
      await admin.from("notifications").insert({
        user_id: booking.client_id,
        type: status === "confirmed" ? "booking_confirmed" : "booking_cancelled",
        title,
        message,
        data: { link: "/es/dashboard/cliente?tab=bookings", booking_id: bookingId },
      });
    }

    // 2. Outbound delivery — WhatsApp first, email as fallback.
    const clientFirst = (booking.client_name as string | null)?.split(" ")[0] ?? "";
    const greeting = clientFirst ? `Hola ${clientFirst}, ` : "Hola, ";
    const waBody = `${greeting}${message} — ContrataCR`;

    const wa = await sendWhatsAppText(booking.client_phone as string | undefined, waBody);
    await recordDelivery(admin, bookingId, "whatsapp", wa.status, wa.detail);

    if (wa.status !== "sent") {
      const html = statusEmailHtml(clientFirst, proName, service, whenText, status);
      const subject =
        status === "confirmed"
          ? "Tu solicitud fue confirmada — ContrataCR"
          : "Tu solicitud fue cancelada — ContrataCR";
      const email = await sendEmailText(booking.client_email as string | undefined, subject, html);
      await recordDelivery(admin, bookingId, "email", email.status, email.detail);
    }
  } catch (err) {
    console.error("[notifyBookingStatusChange] failed:", err);
  }
}

// ---------------------------------------------------------------------------
// Delivery recording
// ---------------------------------------------------------------------------

type DeliveryStatus = "sent" | "failed" | "skipped";

async function recordDelivery(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  admin: any,
  bookingId: string,
  channel: "whatsapp" | "email",
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

// ---------------------------------------------------------------------------
// Generic senders — return delivery status (sent | failed | skipped)
// ---------------------------------------------------------------------------

async function sendWhatsAppText(
  toPhone: string | undefined,
  body: string
): Promise<{ status: DeliveryStatus; detail: string | null }> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId) return { status: "skipped", detail: "WhatsApp Cloud API not configured" };
  if (!toPhone) return { status: "skipped", detail: "No client phone on file" };

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

async function sendEmailText(
  to: string | undefined,
  subject: string,
  html: string
): Promise<{ status: DeliveryStatus; detail: string | null }> {
  const r = await sendBrevoEmail({ to, subject, html, sender: NO_REPLY });
  return { status: r.status, detail: r.detail };
}

function statusEmailHtml(
  clientFirst: string,
  proName: string,
  service: string,
  whenText: string | null,
  status: "confirmed" | "cancelled"
): string {
  const headline = status === "confirmed" ? "Tu solicitud fue confirmada" : "Tu solicitud fue cancelada";
  const accent = status === "confirmed" ? "#009FD9" : "#dc2626";
  const verb = status === "confirmed" ? "confirmó" : "canceló";
  const safeService = service.replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4f7fa;border-radius:8px;">
      <div style="background:#1a2744;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">${headline} — ContrataCR</h2>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#111827;">Hola ${clientFirst || ""},</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;">
          <strong>${proName}</strong> ${verb} tu solicitud de <strong>${safeService}</strong>${whenText ? ` para el <strong>${whenText}</strong>` : ""}.
        </p>
        <a href="https://contratacr.com/es/dashboard/cliente?tab=bookings"
           style="display:inline-block;background:${accent};color:white;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;font-size:14px;margin-top:8px;">
          Ver mi solicitud
        </a>
      </div>
    </div>`;
}

// ---------------------------------------------------------------------------
// Professional-facing senders (new-booking notification)
// ---------------------------------------------------------------------------

async function sendProEmail(
  to: string | undefined,
  proFirstName: string,
  clientName: string,
  serviceDescription: string,
  whenText: string | null
): Promise<void> {
  if (!to) return;

  const html = `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f4f7fa;border-radius:8px;">
      <div style="background:#1a2744;color:white;padding:16px 24px;border-radius:8px 8px 0 0;">
        <h2 style="margin:0;font-size:18px;">Nueva solicitud de servicio — ContrataCR</h2>
      </div>
      <div style="background:white;padding:24px;border:1px solid #e5e7eb;border-top:none;border-radius:0 0 8px 8px;">
        <p style="font-size:15px;color:#111827;">Hola ${proFirstName},</p>
        <p style="font-size:14px;color:#374151;line-height:1.6;">
          <strong>${clientName}</strong> te envió una nueva solicitud de servicio${whenText ? ` para <strong>${whenText}</strong>` : ""}.
        </p>
        <div style="background:#f4f7fa;border:1px solid #e5e7eb;border-radius:8px;padding:14px;margin:16px 0;font-size:14px;color:#374151;">
          ${serviceDescription.replace(/</g, "&lt;").replace(/>/g, "&gt;")}
        </div>
        <a href="https://contratacr.com/es/dashboard/profesional?tab=bookings"
           style="display:inline-block;background:#009FD9;color:white;text-decoration:none;font-weight:bold;padding:10px 20px;border-radius:8px;font-size:14px;">
          Ver solicitud
        </a>
      </div>
    </div>`;

  await sendBrevoEmail({ to, subject: `Nueva solicitud de ${clientName} — ContrataCR`, html, sender: NO_REPLY });
}

async function sendProWhatsApp(
  proWhatsapp: string | undefined,
  proFirstName: string,
  clientName: string,
  serviceDescription: string,
  whenText: string | null
): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  if (!token || !phoneId || !proWhatsapp) return;

  const digits = proWhatsapp.replace(/\D/g, "");
  const to = digits.length === 8 ? `506${digits}` : digits;
  const body = `Hola ${proFirstName}, ${clientName} te envió una nueva solicitud${whenText ? ` para ${whenText}` : ""} en ContrataCR: ${serviceDescription}`;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({ messaging_product: "whatsapp", to, type: "text", text: { body } }),
    });
  } catch (err) {
    console.error("[notifyNewBooking] whatsapp failed:", err);
  }
}
