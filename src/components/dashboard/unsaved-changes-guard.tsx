"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

// Custom, designed replacement for the browser's "Changes you may not be saved"
// prompt. Intercepts in-app link navigations while there are unsaved edits and
// shows a Spanish dialog with "Guardar y salir" / "Salir sin guardar" / "Seguir
// editando". Hard unloads (tab close / refresh) still use the native prompt —
// browsers don't allow a custom UI there — but in-app nav is fully styled.
export function UnsavedChangesGuard({
  dirty,
  onSave,
}: {
  dirty: boolean;
  onSave?: () => Promise<void> | void;
}) {
  const t = useTranslations("unsavedGuard");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingAnchor = useRef<HTMLAnchorElement | null>(null);
  const bypass = useRef(false);

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function onClickCapture(e: MouseEvent) {
      if (bypass.current) return;
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as HTMLElement)?.closest?.("a[href]") as HTMLAnchorElement | null;
      if (!anchor) return;
      const href = anchor.getAttribute("href");
      if (!href || href.startsWith("#") || anchor.target === "_blank") return;
      try {
        const dest = new URL(anchor.href, window.location.href);
        if (dest.pathname === window.location.pathname && dest.search === window.location.search) return;
      } catch {
        return;
      }
      // Hold the navigation and ask with our dialog instead.
      e.preventDefault();
      e.stopPropagation();
      pendingAnchor.current = anchor;
      setOpen(true);
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  function proceed() {
    const anchor = pendingAnchor.current;
    pendingAnchor.current = null;
    setOpen(false);
    if (anchor) {
      // Re-dispatch the original click; the capture handler lets it through.
      bypass.current = true;
      anchor.click();
      setTimeout(() => { bypass.current = false; }, 150);
    }
  }

  async function saveAndLeave() {
    if (!onSave) return proceed();
    setSaving(true);
    try {
      await onSave();
    } finally {
      setSaving(false);
    }
    proceed();
  }

  function keepEditing() {
    pendingAnchor.current = null;
    setOpen(false);
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[92vw] max-w-sm -translate-x-1/2 -translate-y-1/2 rounded-2xl bg-white shadow-2xl data-[state=open]:animate-in data-[state=open]:zoom-in-95 data-[state=open]:fade-in-0"
        >
          <div className="p-6">
            <div className="flex items-start gap-3">
              <div className="h-10 w-10 rounded-full bg-amber-50 flex items-center justify-center shrink-0">
                <AlertTriangle className="h-5 w-5 text-amber-500" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="text-base font-bold text-[#111827]">
                  {t("title")}
                </Dialog.Title>
                <Dialog.Description className="text-sm text-[#6b7280] mt-1">
                  {t("body")}
                </Dialog.Description>
              </div>
            </div>

            <div className="flex flex-col gap-2 mt-5">
              {onSave && (
                <Button onClick={saveAndLeave} loading={saving} className="w-full">
                  {saving ? t("saving") : <><Save className="h-4 w-4" /> {t("saveAndLeave")}</>}
                </Button>
              )}
              <button
                type="button"
                onClick={proceed}
                disabled={saving}
                className="w-full h-10 rounded-xl border border-[#e5e7eb] text-sm font-semibold text-[#b91c1c] hover:bg-red-50 transition-colors disabled:opacity-50"
              >
                {t("leaveWithout")}
              </button>
              <button
                type="button"
                onClick={keepEditing}
                disabled={saving}
                className="w-full h-10 rounded-xl text-sm font-medium text-[#6b7280] hover:bg-[#f9fafb] transition-colors disabled:opacity-50"
              >
                {t("keepEditing")}
              </button>
            </div>
          </div>
          {saving && (
            <div className="absolute inset-0 rounded-2xl bg-white/40 flex items-center justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
