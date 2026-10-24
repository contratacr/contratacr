"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import { FilaInterruptor } from "@/components/ui/fila-interruptor";
import { UsuariosBloqueados } from "@/components/moderation/usuarios-bloqueados";
import { useNativeApp } from "@/hooks/use-native-app";
import { useCachedResource } from "@/hooks/use-cached-resource";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

/**
 * Privacy groups blocked accounts on web and native. Read receipts remain
 * native-only, where chat is available.
 *
 * Se lee con get_my_profile(): la tabla de perfiles solo deja leer columna por
 * columna lo público, y pedir esta columna directo respondía «permission
 * denied» (el interruptor salía siempre encendido aunque estuviera apagado).
 */
export function AccountPrivacySection() {
  const t = useTranslations("accountPrivacy");
  const { user } = useAuth();
  const native = useNativeApp();
  const privacy = useCachedResource<{ readReceipts: boolean }>(
    native && user ? `account:privacy:${user.id}` : null,
    async () => {
      const { data, error } = await createClient().rpc("get_my_profile");
      if (error || !data) throw error ?? new Error("Privacy settings unavailable");
      return { readReceipts: (data as { confirmaciones_de_lectura?: boolean }).confirmaciones_de_lectura !== false };
    }, { readReceipts: true },
  );
  const confirma = privacy.data.readReceipts;
  const [guardando, setGuardando] = useState(false);
  const [error, setError] = useState(false);

  async function cambiar(siguiente: boolean) {
    if (!user) return;
    setGuardando(true);
    setError(false);
    privacy.setData({ readReceipts: siguiente });
    const { error: fallo } = await createClient().from("profiles").update({ confirmaciones_de_lectura: siguiente }).eq("id", user.id);
    if (fallo) { privacy.setData({ readReceipts: !siguiente }); setError(true); }
    setGuardando(false);
  }

  return (
    <div data-account-privacy className="space-y-6">
      {native && (
        <div>
          {privacy.loading ? (
            <div aria-busy="true" className="h-20 animate-pulse rounded-xl bg-slate-100" />
          ) : (
            <FilaInterruptor
              titulo={t("readReceipts")}
              ayuda={t("readReceiptsHelp")}
              checked={confirma}
              disabled={guardando}
              onChange={(valor) => { void cambiar(valor); }}
            />
          )}
          {error && <p role="alert" className="mt-2 text-sm font-semibold text-[#b91c1c]">{t("readReceiptsError")}</p>}
        </div>
      )}
      <UsuariosBloqueados />
    </div>
  );
}
