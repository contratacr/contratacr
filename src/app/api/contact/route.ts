import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { name, email, subject, message } = body;

    if (!email || !subject || !message) {
      return NextResponse.json({ error: "Faltan campos requeridos" }, { status: 400 });
    }

    // Optional session user_id
    const sessionClient = await createClient();
    const { data: { user } } = await sessionClient.auth.getUser();

    // Save to support_messages table
    const admin = createAdminClient();
    const { error: dbError } = await admin.from("support_messages").insert({
      user_id: user?.id ?? null,
      name: name ?? null,
      email,
      subject,
      message,
      status: "pending",
    });

    if (dbError) {
      console.error("[contact] db error:", dbError.message);
    }

    // Optional: send via Resend if API key configured
    const resendKey = process.env.RESEND_API_KEY;
    if (resendKey) {
      try {
        await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendKey}`,
          },
          body: JSON.stringify({
            from: "ContrataCR Soporte <no-reply@contratacr.com>",
            to: ["soportecontratacr@hotmail.com"],
            reply_to: email,
            subject: `[Soporte] ${subject}`,
            html: `<p><strong>De:</strong> ${name ?? "Sin nombre"} (${email})</p><p><strong>Asunto:</strong> ${subject}</p><hr/><p>${message.replace(/\n/g, "<br/>")}</p>`,
          }),
        });
      } catch {
        // Non-fatal — message already saved to DB
      }
    }

    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: false, error: "Error al enviar" }, { status: 500 });
  }
}
