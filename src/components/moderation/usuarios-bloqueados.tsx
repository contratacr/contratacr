"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { getInitials } from "@/lib/utils";

type Bloqueado = { id: string; name: string; avatarUrl: string | null; slug: string | null };

/** La lista de «Usuarios bloqueados» en Cuenta y seguridad, con su «Desbloquear». */
export function UsuariosBloqueados() {
  const t = useTranslations("bloqueo");
  const [lista, setLista] = useState<Bloqueado[] | null>(null);
  const [quitando, setQuitando] = useState<string | null>(null);
  const cargar = () => fetch("/api/block").then((r) => (r.ok ? r.json() : { blocked: [] })).then((d) => setLista(d.blocked ?? [])).catch(() => setLista([]));
  useEffect(() => {
    void cargar();
    const alBloquear = () => void cargar();
    window.addEventListener("ccr:usuario-bloqueado", alBloquear);
    return () => window.removeEventListener("ccr:usuario-bloqueado", alBloquear);
  }, []);
  async function desbloquear(id: string) {
    setQuitando(id);
    try {
      await fetch(`/api/block?profileId=${encodeURIComponent(id)}`, { method: "DELETE" });
      setLista((l) => (l ?? []).filter((b) => b.id !== id));
    } finally { setQuitando(null); }
  }
  return (
    <div className="border-t border-[#eef2f6] pt-4">
      <div className="mb-2 flex items-center gap-2">
        <Ban className="h-4 w-4 text-[#6b7280]" />
        <h3 className="text-sm font-semibold text-[#374151]">{t("cuentaTitulo")}</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[#6b7280]">{t("cuentaTexto")}</p>
      {lista === null ? null : lista.length === 0 ? (
        <p className="text-sm text-[#68778d]">{t("cuentaVacio")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl bg-[#f8fafc] px-3 py-2.5">
              <Avatar className="h-9 w-9 shrink-0"><AvatarImage src={b.avatarUrl ?? undefined} /><AvatarFallback>{getInitials(b.name)}</AvatarFallback></Avatar>
              <span className="min-w-0 flex-1 break-words text-sm font-medium leading-snug text-[#162543]">{b.name}</span>
              <button type="button" onClick={() => void desbloquear(b.id)} disabled={quitando === b.id} className="shrink-0 rounded-full border border-[#d7e1ea] px-3 py-1.5 text-xs font-bold text-[#52627a] transition-colors hover:bg-white disabled:opacity-60">{t("desbloquear")}</button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
