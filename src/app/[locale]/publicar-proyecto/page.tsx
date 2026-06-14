import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { PublishProjectForm } from "./publish-form";

export const dynamic = "force-dynamic";

// Auth is checked on the SERVER, BEFORE rendering: an unauthenticated visitor is
// redirected straight to /login and never sees a flash of the publish form.
export default async function PublicarProyectoPage() {
  const supabase = await createClient();
  const user = await safeGetUser(supabase);
  if (!user) {
    const locale = await getLocale();
    redirect(`/${locale}/login`);
  }
  return <PublishProjectForm />;
}
