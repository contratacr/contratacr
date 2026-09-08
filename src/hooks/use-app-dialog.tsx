"use client";

import { useCallback, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Info } from "lucide-react";
import { Modal } from "@/components/ui/modal";
import { Button } from "@/components/ui/button";
import { SuccessIcon } from "@/components/ui/success-icon";

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

  const dialogNode = dialog ? (() => {
    const classes = toneClasses(dialog.tone);
    const Icon = classes.icon;
    return (
      <Modal
        open
        onClose={() => close({ confirmed: false })}
        title={dialog.title}
        hideHeader
        size="sm"
        mobilePresentation="center"
        footerClassName="flex-col-reverse gap-2 sm:flex-row sm:justify-center"
        footer={(
          <>
            {dialog.mode === "confirm" && (
              <Button type="button" variant="secondary" className="w-full sm:w-auto sm:min-w-[9rem]" onClick={() => close({ confirmed: false })}>
                {dialog.cancelLabel ?? "Cancelar"}
              </Button>
            )}
            <Button
              type="button"
              variant={classes.button}
              className="w-full sm:w-auto sm:min-w-[9rem]"
              onClick={() => close({ confirmed: true, value: inputValue.trim() })}
            >
              {dialog.confirmLabel ?? (dialog.mode === "confirm" ? "Confirmar" : "Entendido")}
            </Button>
          </>
        )}
      >
        {/* Aviso centrado: ícono, título y explicación en el mismo eje, como el
            resto de las confirmaciones del app. Antes el título vivía en una
            barra aparte y el texto quedaba pegado a la izquierda del ícono. */}
        <div className="flex flex-col items-center px-1 pt-1 text-center">
          {dialog.tone === "success" ? (
            <SuccessIcon size={68} />
          ) : (
            <span className={`grid h-[68px] w-[68px] place-items-center rounded-full ${classes.iconWrap}`}>
              <Icon className="h-8 w-8" />
            </span>
          )}
          <h2 className="mt-4 text-[19px] font-extrabold leading-tight text-[#162543]">{dialog.title}</h2>
          {dialog.description && (
            <p className="mt-2 max-w-sm text-[15px] leading-6 text-[#52627a]">{dialog.description}</p>
          )}
          {dialog.detail && (
            <div className={`mt-3 w-full rounded-xl border px-3 py-2 text-left text-sm leading-5 ${classes.detail}`}>
              {dialog.detail}
            </div>
          )}
          {dialog.input && (
            <label className="mt-4 block w-full text-left">
              <span className="mb-1.5 block text-sm font-semibold text-[#162543]">{dialog.input.label}</span>
              <textarea
                value={inputValue}
                onChange={(e) => setInputValue(e.target.value)}
                placeholder={dialog.input.placeholder}
                rows={3}
                className="w-full resize-none rounded-xl border border-[#e5e7eb] bg-white px-3 py-2 text-sm text-[#162543] placeholder:text-[#68778d] focus:border-transparent focus:outline-none focus:ring-2 focus:ring-[#009FD9]"
              />
            </label>
          )}
        </div>
      </Modal>
    );
  })() : null;

  return { dialogNode, showMessage, confirm };
}
