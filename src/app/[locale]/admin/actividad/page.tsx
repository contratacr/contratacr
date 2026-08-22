import { redirect } from "next/navigation";

// "Actividad" now lives inside Resumen ("Actividad reciente"); keep old links working.
export default async function AdminActividadPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  redirect(`/${locale}/admin`);
}
