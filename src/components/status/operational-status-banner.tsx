"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, ExternalLink, Info, X } from "lucide-react";
import type { OperationalStatusBanner as OperationalStatusBannerData } from "@/lib/status/runtime-status";
import { cn } from "@/lib/utils";

const COPY = {
  es: {
    details: "Ver estado",
    dismiss: "Cerrar aviso",
  },
  en: {
    details: "View status",
    dismiss: "Dismiss notice",
  },
} as const;

const LEVEL_STYLES = {
  info: {
    shell: "border-sky-200 bg-white text-[#1a2744]",
    icon: "bg-sky-50 text-[#009FD9]",
  },
  warning: {
    shell: "border-amber-200 bg-white text-[#1a2744]",
    icon: "bg-amber-50 text-amber-600",
  },
  critical: {
    shell: "border-rose-200 bg-white text-[#1a2744]",
    icon: "bg-rose-50 text-rose-600",
  },
} as const;

export function OperationalStatusBanner({
  locale,
  status,
}: {
  locale: string;
  status: OperationalStatusBannerData | null;
}) {
  const [dismissed, setDismissed] = useState(false);
  const t = COPY[locale === "en" ? "en" : "es"];

  useEffect(() => {
    if (!status) return;
    setDismissed(window.localStorage.getItem(status.id) === "dismissed");
  }, [status]);

  if (!status || dismissed) return null;

  const styles = LEVEL_STYLES[status.level];
  const Icon = status.level === "info" ? Info : AlertTriangle;

  function dismiss() {
    if (!status) return;
    window.localStorage.setItem(status.id, "dismissed");
    setDismissed(true);
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed inset-x-3 bottom-3 z-[80] mx-auto max-w-3xl rounded-xl border px-3 py-3 shadow-[0_18px_60px_-30px_rgba(15,23,42,0.55)] sm:bottom-5 sm:px-4",
        styles.shell
      )}
    >
      <div className="flex items-start gap-3">
        <div className={cn("mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-lg", styles.icon)}>
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold leading-5">{status.message}</p>
          {status.href && (
            <a
              href={status.href}
              target={status.href.startsWith("http") ? "_blank" : undefined}
              rel={status.href.startsWith("http") ? "noreferrer" : undefined}
              className="mt-1 inline-flex items-center gap-1 text-xs font-bold text-[#009FD9] hover:underline"
            >
              {t.details}
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </div>
        <button
          type="button"
          onClick={dismiss}
          aria-label={t.dismiss}
          className="grid h-8 w-8 shrink-0 place-items-center rounded-lg text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#1a2744]"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}
