"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SaveStatus } from "@/components/dashboard/save-status";
import { cn } from "@/lib/utils";

// ── Inline-with-title autosave status ────────────────────────────────────────
// The autosave "Guardado/Guardando…" indicator must live ON THE SECTION TITLE LINE
// (right of the heading), NOT in the content flow — otherwise toggling it null↔shown
// pushed the content down and back up (a layout jump). Editors REPORT their save
// state up through this context; the dashboard's section-title row renders it via
// <HeaderSaveStatus/>. The title line always exists, so the content never moves.
//
// Setter + value are split into two contexts so an editor that only reports never
// re-renders when the value changes (and the report effect's deps stay stable —
// React's useState setter is referentially stable).

type Status = { saving: boolean; saved: boolean; dirty: boolean };
const IDLE: Status = { saving: false, saved: false, dirty: false };

const SetterCtx = createContext<((s: Status) => void) | null>(null);
const ValueCtx = createContext<Status>(IDLE);

export function SaveStatusProvider({ children }: { children: ReactNode }) {
  const [status, setStatus] = useState<Status>(IDLE);
  return (
    <SetterCtx.Provider value={setStatus}>
      <ValueCtx.Provider value={status}>{children}</ValueCtx.Provider>
    </SetterCtx.Provider>
  );
}

// An editor calls this to surface its autosave state in the section title. Resets to
// idle on unmount (tab switch) so a stale "Guardado" never lingers on another tab.
export function useReportSaveStatus(saving: boolean, saved: boolean, dirty = false) {
  const set = useContext(SetterCtx);
  useEffect(() => {
    set?.({ saving, saved, dirty });
  }, [set, saving, saved, dirty]);
  useEffect(() => () => set?.(IDLE), [set]);
}

// Rendered INLINE with the section title (right-aligned). The slot ALWAYS reserves a
// fixed width (even when idle, where SaveStatus renders null) so the title's available
// width is constant — the title never reflows/wraps differently when the status
// toggles, which would otherwise still nudge the content. Wide enough for the longest
// state ("Guardando…"); the title (`min-w-0`) wraps within the remaining width at ~360px.
export function HeaderSaveStatus({ className }: { className?: string }) {
  const s = useContext(ValueCtx);
  return (
    <div className={cn("shrink-0 min-w-[112px]", className)}>
      <SaveStatus saving={s.saving} saved={s.saved} dirty={s.dirty} />
    </div>
  );
}
