"use client";

import { useEffect, useRef, useState } from "react";
import { Search, Loader2, BadgeCheck, Ban, ShieldOff } from "lucide-react";
import { useRouter } from "@/i18n/navigation";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { getInitials } from "@/lib/utils";

type Result = {
  id: string;
  full_name: string | null;
  email: string | null;
  cedula: string | null;
  role: string | null;
  avatar_url: string | null;
  is_disabled: boolean;
  isPro: boolean;
  verification_status: string | null;
  is_banned: boolean;
};

/* Reusable admin search box — find a user by name / cédula / email and jump to
   their consolidated profile (/admin/usuarios/[id]). Used as the main tool on
   the Usuarios page and embedded in section views (Soporte, etc.). */
export function AdminUserSearch({
  size = "md",
  autoFocus = false,
  placeholder = "Buscar usuario por nombre, cédula o correo",
}: {
  size?: "md" | "lg";
  autoFocus?: boolean;
  placeholder?: string;
}) {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Debounced search
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) { setResults([]); setLoading(false); return; }
    setLoading(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/admin/users?q=${encodeURIComponent(term)}`);
        const data = await res.json();
        setResults(data.users ?? []);
        setOpen(true);
      } catch {
        setResults([]);
      } finally {
        setLoading(false);
      }
    }, 250);
    return () => clearTimeout(id);
  }, [q]);

  function go(id: string) {
    setOpen(false);
    setQ("");
    router.push(`/admin/usuarios/${id}`);
  }

  const lg = size === "lg";

  return (
    <div ref={boxRef} className="relative w-full">
      <div className="relative">
        <Search className={`absolute left-3 top-1/2 -translate-y-1/2 text-[#9ca3af] ${lg ? "h-5 w-5" : "h-4 w-4"}`} />
        <input
          value={q}
          autoFocus={autoFocus}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => { if (blurTimer.current) clearTimeout(blurTimer.current); if (results.length) setOpen(true); }}
          onBlur={() => { blurTimer.current = setTimeout(() => setOpen(false), 150); }}
          placeholder={placeholder}
          className={`w-full rounded-lg border border-[#e5e7eb] bg-white pl-9 pr-9 focus:outline-none focus:ring-2 focus:ring-[#009FD9] ${lg ? "h-11 text-base" : "h-9 text-sm"}`}
        />
        {loading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-[#9ca3af]" />}
      </div>

      <AnchoredDropdown anchorRef={boxRef} open={open && q.trim().length >= 2} maxHeight={360} className="shadow-2xl">
        <div className="py-1.5">
          {results.length === 0 && !loading ? (
            <p className="px-4 py-3 text-sm text-[#9ca3af]">Sin resultados para “{q.trim()}”.</p>
          ) : (
            results.map((u) => (
              <button
                key={u.id}
                onMouseDown={(e) => { e.preventDefault(); go(u.id); }}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left hover:bg-[#f9fafb] transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-[#EBF5FB] text-[#009FD9] text-xs font-semibold flex items-center justify-center overflow-hidden shrink-0">
                  {u.avatar_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={u.avatar_url} alt="" className="h-full w-full object-cover" />
                  ) : (
                    getInitials(u.full_name ?? "?")
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-[#111827] truncate">{u.full_name ?? "Sin nombre"}</p>
                  <p className="text-xs text-[#6b7280] truncate">
                    {u.cedula ? `${u.cedula} · ` : ""}{u.email}
                  </p>
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <span className="text-[10px] uppercase tracking-wide text-gray-400">{u.isPro ? "Pro" : "Cliente"}</span>
                  {u.isPro && u.verification_status === "verified" && <BadgeCheck className="h-4 w-4 text-emerald-500" />}
                  {u.is_banned && <Ban className="h-4 w-4 text-red-500" />}
                  {u.is_disabled && <ShieldOff className="h-4 w-4 text-amber-500" />}
                </div>
              </button>
            ))
          )}
        </div>
      </AnchoredDropdown>
    </div>
  );
}
