import { createAdminClient } from "@/lib/supabase/admin";

const FROM_ADDRESS = "ContrataCR <soporte@contratacr.com>";

interface NewBookingArgs {
  professionalId: string;
  clientName: string;
  serviceDescription: string;
  whenText: string | null;
}

/**
 * Notify a professional that they received a new booking.
 * Best-effort across three channels:
 *   1. In-app notification (always, if the professional has an account).
 *   2. Email via Resend (if RESEND_API_KEY is set).
 *   3. WhatsApp (only if a WhatsApp Cloud API token is configured — otherwise skipped).
 * Never throws — notification failures must not break the booking.
 */
export async function notifyNewBooking({
  professionalId,
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
    const message = `${clientName} te solicitó un servicio${whenText ? ` para ${whenText}` : ""}: ${serviceDescription}`;

    // 1. In-app notification
    await admin.from("notifications").insert({
      user_id: pro.profile_id,
      type: "booking_received",
      title,
      message,
    });

    // 2. Email via Resend
    await sendEmail(proEmail, firstName, clientName, serviceDescription, whenText);

    // 3. WhatsApp (optional, no-op unless configured)
    await sendWhatsApp(pro.whatsapp as string | undefined, firstName, clientName, serviceDescription, whenText);
  } catch (err) {
    console.error("[notifyNewBooking] failed:", err);
  }
}

async function sendEmail(
  to: string | undefined,
  proFirstName: string,
  clientName: string,
  serviceDescription: string,
  whenText: string | null
): Promise<void> {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return;

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

  try {
    await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      body: JSON.stringify({
        from: FROM_ADDRESS,
        to: [to],
        subject: `Nueva solicitud de ${clientName} — ContrataCR`,
        html,
      }),
    });
  } catch (err) {
    console.error("[notifyNewBooking] email failed:", err);
  }
}

async function sendWhatsApp(
  proWhatsapp: string | undefined,
  proFirstName: string,
  clientName: string,
  serviceDescription: string,
  whenText: string | null
): Promise<void> {
  const token = process.env.WHATSAPP_CLOUD_TOKEN;
  const phoneId = process.env.WHATSAPP_PHONE_NUMBER_ID;
  // WhatsApp is fully optional — skip silently unless a Cloud API is configured.
  if (!token || !phoneId || !proWhatsapp) return;

  const digits = proWhatsapp.replace(/\D/g, "");
  const to = digits.length === 8 ? `506${digits}` : digits;
  const body = `Hola ${proFirstName}, ${clientName} te envió una nueva solicitud${whenText ? ` para ${whenText}` : ""} en ContrataCR: ${serviceDescription}`;

  try {
    await fetch(`https://graph.facebook.com/v21.0/${phoneId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to,
        type: "text",
        text: { body },
      }),
    });
  } catch (err) {
    console.error("[notifyNewBooking] whatsapp failed:", err);
  }
}
