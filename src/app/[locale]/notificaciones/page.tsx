import { redirect } from "next/navigation";

export default async function NotificationsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  redirect(`/${locale === "en" ? "en" : "es"}/dashboard/profesional?tab=notifications`);
}
