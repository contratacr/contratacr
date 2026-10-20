"use client";
import { useState, useSyncExternalStore } from "react";
import { useLocale } from "next-intl";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";
import { readOptionalConsent, saveOptionalConsent, subscribeOptionalConsent, type OptionalChoice } from "@/lib/privacy/optional-consent";
const snapshot = () => readOptionalConsent("ai");
const serverSnapshot = (): OptionalChoice => "unknown";
export function AiPreferences() {
  const en = useLocale() === "en";
  const choice = useSyncExternalStore(subscribeOptionalConsent, snapshot, serverSnapshot);
  const [error, setError] = useState(false);
  return <div>
    <FilaInterruptor titulo={en ? "External AI assistant" : "Asistente con IA externa"}
      ayuda={en ? "Cloudflare Workers AI and, as a fallback, OpenAI process your prompts and recent context. Optional on this device." : "Cloudflare Workers AI y, como respaldo, OpenAI procesan sus consultas y contexto reciente. Opcional en este dispositivo."}
      checked={choice === "accepted"} onChange={value => { try { saveOptionalConsent("ai", value ? "accepted" : "declined"); setError(false); } catch { setError(true); } }} />
    {error && <p role="alert" className="text-sm text-red-700">{en ? "Could not save your choice." : "No se pudo guardar su elección."}</p>}
  </div>;
}
