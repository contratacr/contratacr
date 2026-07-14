"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { SaveStatus } from "@/components/dashboard/save-status";
import { cn } from "@/lib/utils";

// Shared autosave status for panel editors.
//
// Editors REPORT their save state up through this context; the dashboard renders a
// globally fixed status row via <HeaderSaveStatus/> so the autosave state stays
// visible while scrolling.

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

// Editors call this to surface autosave state in the panel-level status row.
// Resets to idle on unmount (tab switch) so a stale "Guardado" never lingers on another tab.
export function useReportSaveStatus(saving: boolean, saved: boolean, dirty = false) {
  const set = useContext(SetterCtx);
  useEffect(() => {
    set?.({ saving, saved, dirty });
  }, [set, saving, saved, dirty]);
  useEffect(() => () => set?.(IDLE), [set]);
}

// Rendered as a fixed global row anchored to the dashboard content width, so it stays
// visible while the user scrolls this panel. Non-interactive and out of flow.
export function HeaderSaveStatus({ className }: { className?: string }) {
  const s = useContext(ValueCtx);
  const visible = s.saving || s.saved || s.dirty;

  return (
    <div className={cn("pointer-events-none fixed inset-x-0 top-[72px] z-50", className)}>
      <div className="mx-auto flex w-full max-w-5xl justify-end px-4 sm:px-6">
        <div
          className={cn(
            "rounded-full border border-[#e5e7eb] bg-white/95 px-2.5 py-1 shadow-sm shadow-[#0f172a]/6 backdrop-blur transition-all duration-200",
            visible ? "scale-100 opacity-100" : "scale-95 opacity-0",
          )}
        >
          <SaveStatus saving={s.saving} saved={s.saved} dirty={s.dirty} />
        </div>
      </div>
    </div>
  );
}
