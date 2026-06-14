import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";

// "/contacto" was a near-duplicate of the support ticket center: it created the
// same ticket via /api/contact and even linked users to /soporte to "open a
// ticket". The platform centralizes ALL help on ONE channel — the ticket-based
// support center at /soporte — so this path now permanently redirects there.
// Keeping the route (as a redirect) means old/bookmarked/SEO links never 404.
// The legal contact email (soporte@contratacr.com) stays on Términos/Privacidad.
export default async function ContactoRedirect() {
  const locale = await getLocale();
  redirect(`/${locale}/soporte`);
}
