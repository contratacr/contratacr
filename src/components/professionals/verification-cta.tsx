"use client";

import { useEffect, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

// "Solicitar mi verificación" CTA. Resolves the destination from the session so
// an EXISTING professional goes to the verification section inside Mi perfil:
//  - has a professional record → /dashboard/profesional?tab=profile&mode=offer&focus=verification
//  - logged-in client (no pro record) → unified panel in client mode
//  - logged out → /login
export function VerificationCta({ className }: { className?: string }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [hasPro, setHasPro] = useState<boolean | null>(null);

  useEffect(() => {
    if (loading) return;
    if (!user) {
      queueMicrotask(() => setHasPro(false));
      return;
    }
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
    if (hasPro) { router.push("/dashboard/profesional?tab=profile&mode=offer&focus=verification"); return; }
    // Logged-in client without a pro record → they must become a professional first.
    router.push("/dashboard/profesional?tab=profile&mode=use");
  }

  return (
    <button onClick={go} className={className}>
      <ShieldCheck className="h-4 w-4" /> Solicitar mi verificación
    </button>
  );
}
