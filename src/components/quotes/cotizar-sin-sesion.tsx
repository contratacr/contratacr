"use client";

import { useRouter } from "@/i18n/navigation";
import { QuoteEditorModal } from "@/components/quotes/quote-editor-modal";

/** El editor de cotización para quien aún no tiene cuenta (ver /cotizar). */
export function CotizarSinSesion({ volverA }: { volverA: string }) {
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-white">
      <QuoteEditorModal
        open
        sinSesion
        onClose={() => router.push(volverA)}
        onSent={() => {}}
      />
    </div>
  );
}
