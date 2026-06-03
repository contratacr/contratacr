"use client";

import { useEffect } from "react";
import { useRouter } from "@/i18n/navigation";

export default function RegisterPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/registro/profesional");
  }, [router]);
  return null;
}
