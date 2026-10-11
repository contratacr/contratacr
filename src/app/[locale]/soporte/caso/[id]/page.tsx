import type { Metadata } from "next";
import { GuestSupportCase } from "@/components/support/guest-support-case";

export const metadata: Metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

export default async function GuestCasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <GuestSupportCase id={id} />;
}
