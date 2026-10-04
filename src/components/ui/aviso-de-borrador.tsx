"use client";

import { useEffect, useState } from "react";
import { CheckCircle2 } from "lucide-react";

/** Franja que confirma que lo escrito antes de entrar se guardó. Se va sola. */
export function AvisoDeBorrador({ texto }: { texto: string }) {
  const [visible, setVisible] = useState(true);
  useEffect(() => {
    const t = window.setTimeout(() => setVisible(false), 5000);
    return () => window.clearTimeout(t);
  }, []);
  if (!visible) return null;
  return (
    <div role="status" onClick={() => setVisible(false)} className="fixed inset-x-4 top-[calc(env(safe-area-inset-top)+12px)] z-[60] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-[#0f7a4a] px-4 py-3 text-sm font-semibold text-white shadow-lg">
      <CheckCircle2 className="h-5 w-5 shrink-0" />
      <span>{texto}</span>
    </div>
  );
}
