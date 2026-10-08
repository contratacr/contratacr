/**
 * Un WhatsApp de texto por la API de WhatsApp Cloud. Lo usa el aviso de un
 * mensaje directo cuando quien lo recibe no está en el app.
 *
 * Este archivo traía además los avisos de las citas (reserva nueva, cambio de
 * estado, reprogramación) y su registro de entregas; las citas se borraron el
 * 8-oct-2026 y con ellas esos avisos.
 */
type DeliveryStatus = "sent" | "failed" | "skipped";

export async function sendWhatsAppText(
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
