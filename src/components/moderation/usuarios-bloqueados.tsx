"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { Ban } from "lucide-react";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { useAuth } from "@/hooks/use-auth";
import { getInitials } from "@/lib/utils";

type Bloqueado = { id: string; name: string; avatarUrl: string | null; slug: string | null };

// Session-only cache, scoped by account. Never reuse another account's list.
const blockedCache = new Map<string, Bloqueado[]>();

/** La lista de «Usuarios bloqueados» en Privacidad, con su «Desbloquear». */
export function UsuariosBloqueados() {
  const t = useTranslations("bloqueo");
  const { user } = useAuth();
  const userId = user?.id;
  const [result, setResult] = useState<{ userId: string; lista: Bloqueado[] } | null>(() => {
    const cached = userId ? blockedCache.get(userId) : undefined;
    return userId && cached ? { userId, lista: cached } : null;
  });
  const lista = userId ? (result?.userId === userId ? result.lista : blockedCache.get(userId) ?? null) : null;
  const [quitando, setQuitando] = useState<string | null>(null);
  const [error, setError] = useState(false);
  const requestId = useRef(0);
  const cargar = useCallback(async () => {
    if (!userId) return;
    const request = ++requestId.current;
    try {
      const response = await fetch("/api/block");
      if (!response.ok) throw new Error("Blocked users unavailable");
      const data = await response.json();
      if (!Array.isArray(data.blocked)) throw new Error("Invalid blocked users response");
      if (request !== requestId.current) return;
      setError(false);
      blockedCache.set(userId, data.blocked);
      setResult({ userId, lista: data.blocked });
    } catch {
      if (request === requestId.current) setError(true);
    }
  }, [userId]);
  const invalidateRequests = useCallback(() => { ++requestId.current; }, []);
  useEffect(() => {
    let active = true;
    void Promise.resolve().then(() => { if (active) void cargar(); });
    const alBloquear = () => void cargar();
    window.addEventListener("ccr:usuario-bloqueado", alBloquear);
    return () => { active = false; invalidateRequests(); window.removeEventListener("ccr:usuario-bloqueado", alBloquear); };
  }, [cargar, invalidateRequests]);
  async function desbloquear(id: string) {
    setQuitando(id);
    try {
      const response = await fetch(`/api/block?profileId=${encodeURIComponent(id)}`, { method: "DELETE" });
      if (!response.ok) { setError(true); return; }
      ++requestId.current;
      if (userId) {
        const next = (lista ?? []).filter((b) => b.id !== id);
        blockedCache.set(userId, next);
        setResult({ userId, lista: next });
      }
    } catch { setError(true); } finally { setQuitando(null); }
  }
  return (
    <div data-blocked-users className="pt-6 first:pt-0">
      <div className="mb-3 flex items-center gap-2">
        <Ban className="h-4 w-4 text-[#6b7280]" />
        <h3 className="text-sm font-semibold text-[#374151]">{t("cuentaTitulo")}</h3>
      </div>
      <p className="mb-3 text-xs leading-relaxed text-[#6b7280]">{t("cuentaTexto")}</p>
      {error && <p role="alert" className="mb-3 text-sm text-red-700">{t("cuentaError")} <button type="button" onClick={() => void cargar()} className="font-semibold underline">{t("cuentaReintentar")}</button></p>}
      {lista === null ? (!error && <div aria-busy="true" className="h-12 animate-pulse rounded-xl bg-slate-100" />) : lista.length === 0 ? (
        <p className="text-sm text-[#68778d]">{t("cuentaVacio")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {lista.map((b) => (
            <li key={b.id} className="flex items-center gap-3 rounded-xl border border-[#e5e7eb] bg-white px-3 py-2.5">
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
