"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { X, Check } from "lucide-react";
import { AnchoredDropdown } from "@/components/ui/anchored-dropdown";
import { INSURERS } from "@/lib/data/insurers";
import { createClient } from "@/lib/supabase/client";

// Chip/autocomplete for aseguradoras, fed ONLY by an official approved list
// (static list in code + admin-approved additions from the DB). There is NO
// free-text "Otra" field; instead a discreet "¿No ves tu aseguradora?" link opens
// a small form that creates a tracked suggestion ticket in the admin panel.
interface Props {
  value: string[];
  onChange: (next: string[]) => void;
}

// Explicit "I don't work with insurers" answer. Storing this sentinel means the
// field is ANSWERED (counts as complete), distinct from a blank/unanswered one.
// It never matches a real aseguradora filter on /buscar.
export const NO_INSURERS = "ninguna";

function normalize(s: string): string {
  return s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");
}

type Option = { id: string; label: string };

export function AseguradorasInput({ value, onChange }: Props) {
  const t = useTranslations("inputs");
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const [approved, setApproved] = useState<Option[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);

  // Suggestion form state.
  const [suggesting, setSuggesting] = useState(false);
  const [suggestName, setSuggestName] = useState("");
  const [suggestSent, setSuggestSent] = useState(false);
  const [sending, setSending] = useState(false);

  // Merge the static official list with admin-approved additions.
  useEffect(() => {
    (async () => {
      try {
        const supabase = createClient();
        const { data } = await supabase.from("insurers").select("id, label").eq("approved", true);
        if (Array.isArray(data)) setApproved(data.map((d) => ({ id: d.id as string, label: d.label as string })));
      } catch { /* table may not exist pre-migration — static list still works */ }
    })();
  }, []);

  const options = useMemo<Option[]>(() => {
    const map = new Map<string, Option>();
    for (const i of INSURERS) map.set(i.id, { id: i.id, label: i.label });
    for (const a of approved) map.set(a.id, a);
    return Array.from(map.values());
  }, [approved]);

  const labelFor = (id: string) => options.find((o) => o.id === id)?.label ?? id;

  const suggestions = useMemo(() => {
    const q = normalize(query.trim());
    return options.filter((o) => !value.includes(o.id) && (q === "" || normalize(o.label).includes(q))).slice(0, 8);
  }, [query, value, options]);

  function add(id: string) {
    if (!value.includes(id)) onChange([...value, id]);
    setQuery("");
    setHighlight(0);
    setOpen(false);
    inputRef.current?.focus();
  }

  function remove(id: string) {
    onChange(value.filter((l) => l !== id));
  }

  const noInsurers = value.includes(NO_INSURERS);
  // Chips never show the sentinel — it's represented by the checkbox below.
  const chipValues = value.filter((id) => id !== NO_INSURERS);

  async function sendSuggestion() {
    const name = suggestName.trim();
    if (!name) return;
    setSending(true);
    try {
      await fetch("/api/insurers/suggest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      setSuggestSent(true);
      setSuggestName("");
      setSuggesting(false);
    } catch { /* best-effort */ }
    finally { setSending(false); }
  }

  return (
    <div className="flex flex-col gap-2">
      {!noInsurers && (<>
      <div ref={fieldRef} className="relative">
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-[#e5e7eb] bg-white p-2 overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[#009FD9] focus-within:border-transparent">
          {chipValues.map((id) => (
            <span key={id} className="inline-flex items-center gap-1.5 rounded-lg bg-[#EBF5FB] text-[#0089bb] text-sm font-medium pl-2.5 pr-1.5 py-1">
              {labelFor(id)}
              <button type="button" onClick={() => remove(id)} className="rounded-md p-0.5 hover:bg-[#009FD9]/20 transition-colors" aria-label={t("remove")}>
                <X className="h-3.5 w-3.5" />
              </button>
            </span>
          ))}
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
            onFocus={() => setOpen(true)}
            onBlur={() => setTimeout(() => setOpen(false), 120)}
            onKeyDown={(e) => {
              if (e.key === "ArrowDown") { e.preventDefault(); setHighlight((h) => Math.min(h + 1, suggestions.length - 1)); }
              else if (e.key === "ArrowUp") { e.preventDefault(); setHighlight((h) => Math.max(h - 1, 0)); }
              else if (e.key === "Enter" && suggestions[highlight]) { e.preventDefault(); add(suggestions[highlight].id); }
              else if (e.key === "Backspace" && query === "" && value.length > 0) { remove(value[value.length - 1]); }
            }}
            placeholder={value.length === 0 ? t("insurerPlaceholder") : t("addAnotherInsurer")}
            className="flex-1 min-w-[140px] bg-transparent text-sm text-[#111827] placeholder:text-[#9ca3af] focus:outline-none focus-visible:outline-none py-1"
          />
        </div>

        <AnchoredDropdown anchorRef={fieldRef} open={open && suggestions.length > 0} maxHeight={264}>
          <ul className="py-1">
            {suggestions.map((s, i) => (
              <li key={s.id}>
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => add(s.id)}
                  className={`w-full text-left px-3 py-2 text-sm transition-colors ${i === highlight ? "bg-[#EBF5FB] text-[#0089bb]" : "text-[#374151] hover:bg-[#f9fafb]"}`}
                >
                  {s.label}
                </button>
              </li>
            ))}
          </ul>
        </AnchoredDropdown>
      </div>

      {/* Discreet "¿No ves tu aseguradora?" — opens a suggestion form (admin ticket). */}
      {suggestSent ? (
        <p className="inline-flex items-center gap-1.5 text-xs text-[#15803d]">
          <Check className="h-3.5 w-3.5" /> {t("suggestThanks")}
        </p>
      ) : suggesting ? (
        <div className="flex items-center gap-2">
          <input
            value={suggestName}
            onChange={(e) => setSuggestName(e.target.value)}
            placeholder={t("insurerSuggestName")}
            className="flex-1 h-9 px-3 rounded-lg border border-[#e5e7eb] text-sm focus:outline-none focus:ring-2 focus:ring-[#009FD9] focus:border-transparent"
          />
          <button type="button" disabled={!suggestName.trim() || sending} onClick={sendSuggestion} className="h-9 px-3 rounded-lg bg-[#009FD9] text-white text-sm font-medium disabled:opacity-50">
            {sending ? t("sending") : t("send")}
          </button>
          <button type="button" onClick={() => setSuggesting(false)} className="h-9 px-2 text-sm text-[#9ca3af] hover:text-[#374151]">{t("cancel")}</button>
        </div>
      ) : (
        <button type="button" onClick={() => setSuggesting(true)} className="self-start text-xs text-[#009FD9] hover:underline">
          {t("insurerNotListed")}
        </button>
      )}
      </>)}

      {/* Explicit "none" — answering this counts as complete (not a blank field). */}
      <label className="inline-flex items-center gap-2 text-sm text-[#374151] cursor-pointer self-start">
        <input
          type="checkbox"
          checked={noInsurers}
          onChange={(e) => onChange(e.target.checked ? [NO_INSURERS] : [])}
          className="h-4 w-4 rounded border-[#d1d5db] text-[#009FD9] focus:ring-[#009FD9]"
        />
        {t("noInsurers")}
      </label>
    </div>
  );
}
