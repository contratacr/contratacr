"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { JobPostForm } from "@/components/jobs/job-post-form";
import { AvisoDeBorrador } from "@/components/ui/aviso-de-borrador";
import { leerBorrador } from "@/lib/borrador-sin-sesion";

type Inicial = NonNullable<Parameters<typeof JobPostForm>[0]["initialJob"]>;

/** El formulario de empleo, lleno con lo que se escribió antes de entrar. */
export function JobPostFormConBorrador({ professionalId, backHref, conBorrador }: { professionalId: string | null; backHref: string; conBorrador: boolean }) {
  const tBorrador = useTranslations("borradorGuardado");
  const [listo, setListo] = useState(!conBorrador);
  const [inicial, setInicial] = useState<Inicial | null>(null);
  useEffect(() => {
    if (!conBorrador) return;
    let vivo = true;
    void leerBorrador<Inicial>("empleo").then((b) => {
      if (!vivo) return;
      setInicial(b?.datos ?? null);
      setListo(true);
    });
    return () => { vivo = false; };
  }, [conBorrador]);
  if (!listo) return <div className="min-h-dvh bg-white" />;
  return (
    <>
      {inicial && professionalId && <AvisoDeBorrador texto={tBorrador("empleo")} />}
      <JobPostForm professionalId={professionalId} backHref={backHref} initialJob={inicial} />
    </>
  );
}
