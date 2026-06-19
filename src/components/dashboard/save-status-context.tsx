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

// Rendered as an ABSOLUTE OVERLAY pinned to the section-title's top-right (the title row
// is `relative` and reserves `pr-28`), so the autosave state sits RIGHT BESIDE the heading
// the user is looking at — much more visible than the old bottom-right floating pill, while
// still OUT of the document flow so it can never push/reflow content (no layout jump). This
// matches the CLIENT dashboard's inline placement, so every autosave panel is consistent.
export function HeaderSaveStatus({ className }: { className?: string }) {
  const s = useContext(ValueCtx);
  return (
    <div className={cn("pointer-events-none absolute right-0 top-1", className)}>
      <SaveStatus saving={s.saving} saved={s.saved} dirty={s.dirty} />
    </div>
  );
}
