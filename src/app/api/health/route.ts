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

  return Response.json(
    {
      status: "ok",
      commitSha,
      supabase,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
