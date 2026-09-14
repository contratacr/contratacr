import { supabaseProjectRefFromUrl } from "@/lib/security/supabase-target";

export const dynamic = "force-dynamic";

export function GET() {
  const rawCommitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  const commitSha = /^[a-f0-9]{40}$/i.test(rawCommitSha) ? rawCommitSha : null;

  // Sin esto, un despliegue al que le falta una variable se ve igual que una
  // base caída: la página muestra «servicio fuera de línea» y no hay forma de
  // saber cuál de las dos cosas es. Solo se dice SI la variable llegó, nunca su
  // valor; el identificador del proyecto ya viaja en cada llamada del navegador.
  const supabase = {
    url: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
    anonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    serviceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
    projectRef: process.env.NEXT_PUBLIC_SUPABASE_URL
      ? supabaseProjectRefFromUrl(process.env.NEXT_PUBLIC_SUPABASE_URL)
      : null,
  };

  // Qué integraciones tiene ESTE despliegue. Solo dice sí o no: nunca el valor.
  //
  // Existe porque una llave que falta no se nota: el código que manda correos
  // devuelve «omitido» y sigue como si nada, así que el app se ve entera
  // mientras no sale un solo correo. Con esto se comprueba desde fuera, en un
  // segundo, si el ambiente está completo.
  const integraciones = {
    correo: !!process.env.BREVO_API_KEY,
    asistente: !!process.env.OPENAI_API_KEY,
    traduccion: !!process.env.GOOGLE_TRANSLATE_API_KEY || !!process.env.GOOGLE_TRANSLATE_SERVICE_ACCOUNT_JSON,
    push: !!process.env.FIREBASE_PRIVATE_KEY || !!process.env.FCM_PRIVATE_KEY,
    whatsapp: !!process.env.WHATSAPP_CLOUD_TOKEN && !!process.env.WHATSAPP_PHONE_NUMBER_ID,
    imagenes: !!process.env.CLOUDINARY_API_KEY,
    archivos: !!process.env.R2_ACCESS_KEY_ID,
    tareas: !!process.env.CRON_SECRET || !!process.env.PUSH_WORKER_SECRET,
  };

  return Response.json(
    {
      status: "ok",
      commitSha,
      supabase,
      integraciones,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
