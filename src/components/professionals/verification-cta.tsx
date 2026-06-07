"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

// "Solicitar mi verificación" CTA. Resolves the destination from the session so
// an EXISTING professional goes to their verification tab (not registration):
//  - has a professional record → /dashboard/profesional?tab=verificacion
//  - logged-in client (no pro record) → /dashboard/cliente (upgrade prompt lives there)
//  - logged out → /login
export function VerificationCta({ className }: { className?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) { setHasPro(false); return; }
    const supabase = createClient();
    supabase
      .from("professionals")
      .select("id")
      .eq("profile_id", user.id)
      .maybeSingle()
      .then(({ data }) => setHasPro(!!data));
  }, [user, loading]);

  function go() {
    if (!user) { router.push("/login"); return; }
    if (hasPro) { router.push("/dashboard/profesional?tab=verificacion"); return; }
    // Logged-in client without a pro record → they must become a professional first.
    router.push("/dashboard/cliente?tab=profile");
  }

  return (
    <button onClick={go} className={className}>
      <ShieldCheck className="h-4 w-4" /> Solicitar mi verificación
    </button>
  );
}
