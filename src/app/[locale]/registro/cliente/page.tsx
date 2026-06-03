"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

// Client registration now happens inline during the booking flow.
// This standalone page is no longer used.
export default function RegisterClientPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/registro/profesional");
  }, [router]);
  return null;
}
