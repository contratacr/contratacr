"use client";

import { useState, type FormEvent } from "react";
import { ChevronDown, Loader2, Search } from "lucide-react";
import { formatId } from "@/lib/cedula";

type Result = { found: boolean; cedula: string; fullName?: string };

export function AdminPadronLookup() {
  const [open, setOpen] = useState(false);
  const [cedula, setCedula] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState("");

  async function consult(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (loading) return;
    setLoading(true); setResult(null); setError("");
    try {
      const response = await fetch("/api/admin/padron", {
        method: "POST", credentials: "same-origin", cache: "no-store",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ cedula }),
      });
      const data = await response.json().catch(() => null);
      if (!data) throw new Error("No pudimos realizar la consulta.");
      if (!response.ok && response.status !== 404) throw new Error(data.error || "No pudimos realizar la consulta.");
      setResult(data as Result);
    } catch (cause) {
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : "No pudimos realizar la consulta. Revisá tu conexión e intentá de nuevo.");
    } finally { setLoading(false); }
  }

  return <section className="mb-4 rounded-xl border border-[#e5e7eb] bg-white">
    <button type="button" aria-expanded={open} aria-controls="admin-padron-form" disabled={loading}
      onClick={() => { setOpen(!open); setCedula(""); setResult(null); setError(""); }}
      className="flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left text-sm font-semibold text-[#162543] disabled:opacity-60">
      <Search className="h-4 w-4 shrink-0 text-[#009FD9]" />
      Consultar identificación en Hacienda
      <ChevronDown className={`ml-auto h-4 w-4 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
    </button>
    {open && <form id="admin-padron-form" onSubmit={consult} aria-busy={loading} className="border-t border-[#eef2f6] p-4">
      <p className="mb-3 text-xs leading-5 text-[#68778d]">Consultá el nombre o razón social en Hacienda. Admite identificación nacional, jurídica, DIMEX y NITE. No muestra información tributaria.</p>
      <label htmlFor="admin-padron-cedula" className="text-xs font-semibold text-[#526277]">Número de identificación</label>
      <div className="mt-2 flex flex-col gap-2 sm:flex-row">
        <input id="admin-padron-cedula" value={cedula} onChange={event => { setCedula(event.target.value); setResult(null); setError(""); }}
          inputMode="numeric" autoComplete="off" maxLength={16} required disabled={loading} placeholder="1-2345-6789"
          className="h-11 min-w-0 flex-1 rounded-xl border border-[#d7e1ea] bg-white px-3 text-sm text-[#162543] outline-none focus:border-[#009FD9] focus:ring-2 focus:ring-[#bfefff] disabled:opacity-60" />
        <button type="submit" disabled={loading || !cedula.trim()} className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#009FD9] px-5 text-sm font-semibold text-white disabled:opacity-50">
          {loading && <Loader2 className="h-4 w-4 animate-spin" />}{loading ? "Consultando…" : "Consultar"}
        </button>
      </div>
      {error && <p role="alert" className="mt-3 text-sm text-[#b45309]">{error}</p>}
      {result && <div role="status" className="mt-3 rounded-lg bg-[#f8fafc] p-3 text-sm text-[#162543]">
        {result.found ? <><p className="text-xs text-[#68778d]">Nombre en Hacienda · {formatId(result.cedula)}</p><p className="mt-1 font-semibold">{result.fullName}</p></> : <p>Hacienda no encontró esta identificación. Esto no confirma que sea inválida; la cuenta puede solicitar revisión manual.</p>}
      </div>}
    </form>}
  </section>;
}
