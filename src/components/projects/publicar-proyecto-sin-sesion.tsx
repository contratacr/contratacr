"use client";

import { useRef } from "react";
import { useRouter } from "@/i18n/navigation";
import { PublishProjectModal } from "@/components/projects/publish-project-modal";

/**
 * Formulario directo para todos. Sin sesión conserva el borrador al pedir
 * entrar; con sesión publica aquí y permite volver a Mis proyectos.
 */
export function PublicarProyectoSinSesion({ volverA }: { volverA: string }) {
  const router = useRouter();
  const published = useRef(false);
  return (
    <div className="min-h-dvh bg-white">
      <PublishProjectModal onSuccess={() => { published.current = true; }} onClose={() => router.push(published.current ? "/dashboard/profesional?tab=sent_projects" : volverA)} />
    </div>
  );
}
