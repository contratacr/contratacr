import { permanentRedirect } from "next/navigation";
import { rutaConIdioma } from "@/lib/prefijo-de-idioma";

// The "Para negocios y profesionales" page was removed (owner decision 2026-11-22): old links go to the professional registration.
export default async function RemovedBusinessHubPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect(rutaConIdioma(locale, "/registro/profesional"));
}
