import { redirect } from "next/navigation";
import type { Metadata } from "next";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";
import { profileContinuationDestination } from "@/lib/email/profile-reminder";
export const metadata: Metadata = {robots:{index:false,follow:false}};
export default async function ContinueProfile({params}:{params:Promise<{locale:string}>}) {
  const {locale} = await params;
  const db = await createClient();
  const user = await safeGetUser(db);
  const continuation = rutaConIdioma(locale,"/continuar-perfil");
  if (!user) redirect(`${rutaConIdioma(locale,"/login")}?redirect=${encodeURIComponent(continuation)}`);
  const {data,error} = await db.from("professionals").select("id").eq("profile_id",user.id).maybeSingle();
  if (error) throw new Error("Could not verify profile continuation");
  redirect(rutaConIdioma(locale,profileContinuationDestination(Boolean(data))));
}
