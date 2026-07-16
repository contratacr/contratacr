"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";

type DialogTone = "default" | "danger" | "success";

type DialogInput = {
  label: string;
  placeholder?: string;
  defaultValue?: string;
};

type DialogOptions = {
  title: string;
  description?: string;
  detail?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: DialogTone;
  input?: DialogInput;
};

type DialogState = DialogOptions & {
  mode: "message" | "confirm";
};

type DialogResult = {
  confirmed: boolean;
  value?: string;
};

function toneClasses(tone: DialogTone = "default") {
  if (tone === "danger") {
    return {
      iconWrap: "bg-[#fef2f2] text-[#dc2626]",
      detail: "border-[#fecaca] bg-[#fef2f2] text-[#991b1b]",
      button: "destructive" as const,
      icon: AlertTriangle,
    };
  }
  if (tone === "success") {
    return {
      iconWrap: "bg-[#ecfdf5] text-[#16a34a]",
      detail: "border-[#bbf7d0] bg-[#f0fdf4] text-[#166534]",
      button: "default" as const,
      icon: CheckCircle2,
    };
  }
  return {
    iconWrap: "bg-[#EBF5FB] text-[#009FD9]",
    detail: "border-[#bfdbfe] bg-[#eff6ff] text-[#1e3a8a]",
    button: "default" as const,
    icon: Info,
  };
}

export function useAppDialog() {
  const [dialog, setDialog] = useState<DialogState | null>(null);
  const [inputValue, setInputValue] = useState("");
  const resolverRef = useRef<((result: DialogResult) => void) | null>(null);

  const close = useCallback((result: DialogResult) => {
    const resolve = resolverRef.current;
    resolverRef.current = null;
    setDialog(null);
    setInputValue("");
    resolve?.(result);
  }, []);

  const showMessage = useCallback((options: DialogOptions) => {
    return new Promise<void>((resolve) => {
      resolverRef.current = () => resolve();
      setInputValue("");
      setDialog({ ...options, mode: "message" });
    });
  }, []);

  const confirm = useCallback((options: DialogOptions) => {
    return new Promise<DialogResult>((resolve) => {
      resolverRef.current = resolve;
      setInputValue(options.input?.defaultValue ?? "");
      setDialog({ ...options, mode: "confirm" });
    });
  }, []);

  const dialogNode = dialog ? (
    <Modal
      open
      onClose={() => close({ confirmed: false })}
      title={dialog.title}
      size="sm"
      mobilePresentation="center"
      footerClassName="justify-center sm:justify-end"
      footer={(
        <>
          {dialog.mode === "confirm" && (
            <Button type="button" variant="outline" onClick={() => close({ confirmed: false })}>
              {dialog.cancelLabel ?? "Cancelar"}
            </Button>
          )}
          <Button
            type="button"
            variant={toneClasses(dialog.tone).button}
            onClick={() => close({ confirmed: true, value: inputValue.trim() })}
          >
            {dialog.confirmLabel ?? (dialog.mode === "confirm" ? "Confirmar" : "Entendido")}
          </Button>
        </>
      )}
    >
      <div className="space-y-4">
        <div className="flex gap-3">
          {(() => {
            const classes = toneClasses(dialog.tone);
            const Icon = classes.icon;
            return (
              <span className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${classes.iconWrap}`}>
                <Icon className="h-5 w-5" />
              </span>
            );
          })()}
          <div className="min-w-0">
            {dialog.description && <p className="text-sm leading-6 text-[#4b5563]">{dialog.description}</p>}
            {dialog.detail && (
              <div className={`mt-3 rounded-xl border px-3 py-2 text-sm leading-5 ${toneClasses(dialog.tone).detail}`}>
                {dialog.detail}
              </div>
            )}
          </div>
        </div>
        {dialog.input && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-semibold text-[#111827]">{dialog.input.label}</span>
            <textarea
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={dialog.input.placeholder}
              rows={3}
              className="w-full resize-none rounded-xl border border-[#d1d5db] bg-white px-3 py-2 text-sm text-[#111827] outline-none transition focus:border-[#009FD9] focus:ring-2 focus:ring-[#009FD9]/15"
            />
          </label>
        )}
      </div>
    </Modal>
  ) : null;

  return { dialogNode, showMessage, confirm };
}
