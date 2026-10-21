"use client";

import { useEffect, useState, type CSSProperties, type MouseEvent, type ReactNode } from "react";
import Link from "next/link";
import { flushSync } from "react-dom";
import { Loader2 } from "lucide-react";

/** Immediate, local feedback; error boundaries can require a full document reset. */
export function HomeRecoveryLink({ href, className, children, documentNavigation = false, style }: {
  href: string;
  className?: string;
  children: ReactNode;
  documentNavigation?: boolean;
  style?: CSSProperties;
}) {
  const [pending, setPending] = useState(false);
  useEffect(() => {
    const reset = () => setPending(false);
    window.addEventListener("pageshow", reset);
    return () => window.removeEventListener("pageshow", reset);
  }, []);
  const onClick = (event: MouseEvent<HTMLAnchorElement>) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    // Commit feedback before a full-document navigation can freeze this page.
    flushSync(() => setPending(true));
  };
  const content = <>
    <Loader2 aria-hidden="true" className="absolute left-3 h-4 w-4 animate-spin" style={{ opacity: pending ? 1 : 0 }} />
    {children}
    {pending && <span role="status" className="sr-only">{href.startsWith("/en") ? "Opening home…" : "Abriendo el inicio…"}</span>}
  </>;
  const props = { href, onClick, className, style: { ...style, position: "relative" as const }, "aria-busy": pending || undefined, "data-home-recovery-link": "" };
  // A broken root/router must be discarded rather than reused for recovery.
  return documentNavigation ? <a {...props}>{content}</a> : <Link {...props} prefetch>{content}</Link>;
}
