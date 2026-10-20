"use client";
import { useEffect, useState } from "react";
import { useLocale } from "next-intl";
import { useAuth } from "@/hooks/use-auth";
import { isNativeAppRuntime } from "@/hooks/use-native-app";
import { LEGAL_VERSION } from "@/lib/privacy/legal-version";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";
export function MarketingPreferences() {
  const { user } = useAuth();
  const userId = user?.id;
  const en = useLocale() === "en";
  const [choice, setChoice] = useState<{ userId: string; accepted: boolean } | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState(false);
  useEffect(() => {
    if (!userId) return;
    const controller = new AbortController();
    fetch("/api/privacy/choices", { cache: "no-store", signal: controller.signal }).then(async response => {
      if (!response.ok) throw new Error("unavailable");
      const data = await response.json();
      if (!controller.signal.aborted) setChoice({ userId, accepted: data.choices?.marketing?.accepted === true && data.choices.marketing.version === LEGAL_VERSION });
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [userId]);
  if (!user) return null;
  return <div>
    <FilaInterruptor titulo={en ? "Promotional emails" : "Correos promocionales"} ayuda={en ? "Optional ContrataCR news and campaigns. Account and security messages remain separate. Unsubscribing by email also prevents campaigns." : "Novedades y campañas opcionales de ContrataCR. Los avisos de cuenta y seguridad son independientes. La baja por correo también detiene las campañas."}
      checked={choice?.userId === user.id && choice.accepted} disabled={saving || choice?.userId !== user.id} cargando={saving}
      onChange={async accepted => {
        setSaving(true); setError(false);
        try {
          const response = await fetch("/api/privacy/choices", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ purpose: "marketing", accepted, version: LEGAL_VERSION, locale: en ? "en" : "es", channel: isNativeAppRuntime() ? "native" : "web" }) });
          if (!response.ok) throw new Error("unavailable");
          setChoice({ userId: user.id, accepted });
        } catch { setError(true); } finally { setSaving(false); }
      }} />
    {error && <p role="alert" className="text-sm text-red-700">{en ? "Could not load or save your choice. Please try again later." : "No se pudo consultar o guardar su elección. Inténtelo más tarde."}</p>}
  </div>;
}
