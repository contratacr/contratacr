"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

/**
 * PRIVACIDAD: por ahora, las confirmaciones de lectura del chat (recíprocas,
 * como WhatsApp). Va en su propia sección y solo en la app, que es donde existe
 * el chat.
 *
 * Se lee con get_my_profile(): la tabla de perfiles solo deja leer columna por
 * columna lo público, y pedir esta columna directo respondía «permission
 * denied» (el interruptor salía siempre encendido aunque estuviera apagado).
 */
export function AccountPrivacySection() {
  const t = useTranslations("accountPrivacy");
  const { user } = useAuth();
  const [confirma, setConfirma] = useState<boolean | null>(null);
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);

  useEffect(() => {
    if (!user) return;
    let vivo = true;
    void createClient().rpc("get_my_profile").then(({ data }) => {
      if (vivo && data) setConfirma((data as { confirmaciones_de_lectura?: boolean }).confirmaciones_de_lectura !== false);
    });
    return () => { vivo = false; };
  }, [user]);

  async function cambiar(siguiente: boolean) {
    if (!user) return;
    setGuardando(true);
    setError(false);
    setConfirma(siguiente);
    const { error: fallo } = await createClient().from("profiles").update({ confirmaciones_de_lectura: siguiente }).eq("id", user.id);
    if (fallo) { setConfirma(!siguiente); setError(true); }
    setGuardando(false);
  }

  if (confirma === null) return null;
  return (
    <div>
      <FilaInterruptor
        titulo={t("readReceipts")}
        ayuda={t("readReceiptsHelp")}
        checked={confirma}
        disabled={guardando}
        onChange={(valor) => { void cambiar(valor); }}
      />
      {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#b91c1c]">{t("readReceiptsError")}</p>}
    </div>
  );
}
