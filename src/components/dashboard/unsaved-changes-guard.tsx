"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import * as Dialog from "@radix-ui/react-dialog";
import { AlertTriangle, Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";

declare global {
  interface Window {
    __ccrUnsavedNavigationBypass?: boolean;
  }
}

function navigationBypassActive() {
  return typeof window !== "undefined" && window.__ccrUnsavedNavigationBypass === true;
}

function releaseNavigationBypass() {
  window.setTimeout(() => {
    window.__ccrUnsavedNavigationBypass = false;
  }, 250);
}

// Custom, designed replacement for the browser's "Changes you may not be saved"
// prompt. Intercepts in-app link navigations while there are unsaved edits and
// shows a Spanish dialog with "Guardar cambios" / "Salir sin guardar" / "Seguir
// editando". Hard unloads (tab close / refresh) still use the native prompt —
// browsers don't allow a custom UI there — but in-app nav is fully styled.
export function UnsavedChangesGuard({
  dirty,
  onSave,
  onDiscard,
  validationError,
}: {
  dirty: boolean;
  onSave?: () => Promise<boolean | void> | boolean | void;
  onDiscard?: () => void;
  validationError?: string | null;
}) {
  const t = useTranslations("unsavedGuard");
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const pendingAnchor = useRef<HTMLAnchorElement | null>(null);
  const pendingAction = useRef<(() => void) | null>(null);
  const bypass = useRef(false);
  const guardOwner = useRef({});

  function clearPendingDialog() {
    pendingAnchor.current = null;
    pendingAction.current = null;
    setOpen(false);
  }

  function claimDialog() {
    window.dispatchEvent(new CustomEvent("ccr:unsaved-dialog-claimed", { detail: { owner: guardOwner.current } }));
  }

  useEffect(() => {
    if (!dirty) return;

    function onBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
      e.returnValue = "";
    }

    function onClickCapture(e: MouseEvent) {
      if (bypass.current || navigationBypassActive()) return;
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
      e.stopImmediatePropagation();
      pendingAnchor.current = anchor;
      pendingAction.current = null;
      claimDialog();
      setOpen(true);
    }

    function onConfirmUnsavedAction(e: Event) {
      if (bypass.current || navigationBypassActive()) return;
      const detail = (e as CustomEvent<{ proceed?: () => void; handled?: boolean }>).detail;
      if (detail?.handled || typeof detail?.proceed !== "function") return;
      detail.handled = true;
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      pendingAnchor.current = null;
      pendingAction.current = detail.proceed;
      claimDialog();
      setOpen(true);
    }

    function onDialogClaimed(e: Event) {
      const owner = (e as CustomEvent<{ owner?: object }>).detail?.owner;
      if (owner === guardOwner.current) return;
      clearPendingDialog();
    }

    window.addEventListener("beforeunload", onBeforeUnload);
    window.addEventListener("ccr:confirm-unsaved-action", onConfirmUnsavedAction);
    window.addEventListener("ccr:unsaved-dialog-claimed", onDialogClaimed);
    document.addEventListener("click", onClickCapture, true);
    return () => {
      window.removeEventListener("beforeunload", onBeforeUnload);
      window.removeEventListener("ccr:confirm-unsaved-action", onConfirmUnsavedAction);
      window.removeEventListener("ccr:unsaved-dialog-claimed", onDialogClaimed);
      document.removeEventListener("click", onClickCapture, true);
    };
  }, [dirty]);

  function proceed() {
    const anchor = pendingAnchor.current;
    const action = pendingAction.current;
    pendingAnchor.current = null;
    pendingAction.current = null;
    setOpen(false);
    if (action) {
      bypass.current = true;
      window.__ccrUnsavedNavigationBypass = true;
      action();
      setTimeout(() => { bypass.current = false; }, 250);
      releaseNavigationBypass();
    } else if (anchor) {
      // Re-dispatch the original click; the capture handler lets it through.
      bypass.current = true;
      window.__ccrUnsavedNavigationBypass = true;
      anchor.click();
      setTimeout(() => { bypass.current = false; }, 250);
      releaseNavigationBypass();
    }
  }

  async function saveAndStay() {
    if (!onSave) return proceed();
    setSaving(true);
    let ok: boolean | void = false;
    try {
      ok = await onSave();
    } finally {
      setSaving(false);
    }
    if (ok !== false) {
      proceed();
    }
  }

  function leaveWithoutSaving() {
    // Let React commit the restored form and `dirty=false` before replaying the
    // pending navigation. Otherwise that navigation can immediately hit the
    // generic guard again and show a second dialog.
    bypass.current = true;
    window.__ccrUnsavedNavigationBypass = true;
    onDiscard?.();
    window.requestAnimationFrame(() => window.requestAnimationFrame(proceed));
  }

  function keepEditing() {
    clearPendingDialog();
  }

  return (
    <Dialog.Root open={open} onOpenChange={(nextOpen) => { if (nextOpen) setOpen(true); }}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-[#162543]/55 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          onInteractOutside={(event) => event.preventDefault()}
          onPointerDownOutside={(event) => event.preventDefault()}
          className="fixed left-1/2 top-1/2 z-50 w-[calc(100vw-2rem)] max-w-[24rem] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-2xl border border-[#dbe7ef] bg-white shadow-[0_24px_80px_rgba(22,37,67,0.28)] data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="px-5 pb-5 pt-5 sm:px-6 sm:pb-6">
            <div className="flex flex-col items-center text-center">
              <div className="flex h-12 w-12 items-center justify-center rounded-full bg-[#EBF5FB] ring-1 ring-inset ring-[#009FD9]/20">
                <AlertTriangle className="h-5 w-5 text-[#009FD9]" />
              </div>
              <div className="mt-3 min-w-0">
                <Dialog.Title className="text-base font-bold text-[#111827]">
                  {validationError ? t("incompleteTitle") : t("title")}
                </Dialog.Title>
                <Dialog.Description className="mx-auto mt-1.5 max-w-[18rem] text-sm leading-5 text-[#64748b]">
                  {validationError ? t("incompleteBody", { error: validationError }) : t("body")}
                </Dialog.Description>
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-2">
              {onSave && !validationError && (
                <Button onClick={saveAndStay} loading={saving} className="h-11 w-full rounded-xl bg-[#009FD9] text-sm font-bold shadow-sm hover:bg-[#0089bb]">
                  {saving ? t("saving") : <><Save className="h-4 w-4" /> {t("saveChanges")}</>}
                </Button>
              )}
              <button
                type="button"
                onClick={validationError ? keepEditing : leaveWithoutSaving}
                disabled={saving}
                className={`h-11 w-full rounded-xl text-sm font-bold transition-colors disabled:opacity-50 ${validationError ? "bg-[#009FD9] text-white shadow-sm hover:bg-[#0089bb]" : "border border-[#dbe7ef] bg-white text-[#162543] hover:bg-[#f5f9fc]"}`}
              >
                {validationError ? t("keepEditing") : t("leaveWithout")}
              </button>
              <button
                type="button"
                onClick={validationError ? leaveWithoutSaving : keepEditing}
                disabled={saving}
                className={`h-10 w-full rounded-xl text-sm font-semibold transition-colors hover:bg-[#f8fafc] disabled:opacity-50 ${validationError ? "text-[#b91c1c]" : "text-[#64748b]"}`}
              >
                {validationError ? t("leaveWithout") : t("keepEditing")}
              </button>
            </div>
          </div>
          {saving && (
            <div className="absolute inset-0 flex items-center justify-center rounded-2xl bg-white/50">
              <Loader2 className="h-5 w-5 animate-spin text-[#009FD9]" />
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
