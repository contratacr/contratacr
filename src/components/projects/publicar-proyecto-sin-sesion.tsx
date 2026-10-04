"use client";

import { useRouter } from "@/i18n/navigation";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";

/**
 * El formulario de proyecto para quien todavía no tiene cuenta: se llena
 * completo y al publicar se pide entrar (ver borrador-sin-sesion.ts).
 */
export function PublicarProyectoSinSesion({ volverA }: { volverA: string }) {
  const router = useRouter();
  return (
    <div className="min-h-dvh bg-white">
      <PublishProjectModal onClose={() => router.push(volverA)} />
    </div>
  );
}
