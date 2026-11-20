"use client";

import { FileUser, Mail, Sparkles } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { JobPost } from "@/lib/jobs";
import { cn } from "@/lib/utils";
import { textoDeLaVacante, type VacanteParaCurriculum } from "@/lib/cv/vacante-empleo";

/**
 * «PREPARE SU POSTULACIÓN A ESTE EMPLEO», al pie de cada vacante.
 * Es el momento de más intención: quien lee una vacante está por postularse.
 * Dos caminos, los dos con el texto de la vacante en la mano (20-nov-2026):
 *  - «Adaptar mi currículum»: abre su CV con «Adaptar a una oferta» ya con el
 *    anuncio pegado. No corre nada solo: la persona toca el botón y revisa cada
 *    cambio; el original queda igual.
 *  - «Escribir mi carta»: abre una carta NUEVA en «Mis cartas» dirigida a este
 *    puesto y empresa, con el anuncio listo para «Escribir con IA». Antes pisaba
 *    la que ya había (16-nov-2026).
 * Va por el almacenamiento de la sesión y no por la dirección: el texto de una
 * vacante no cabe en un enlace y no tiene por qué quedar en el historial.
 */
export const VACANTE_PARA_CURRICULUM = "ccr:cv-vacante:v1";

export { MAX_TEXTO_VACANTE, textoDeLaVacante, type VacanteParaCurriculum } from "@/lib/cv/vacante-empleo";

type Vacante = Pick<JobPost, "title" | "description" | "requirements" | "responsibilities" | "employer_name">;

const boton = "inline-flex h-11 min-w-0 items-center justify-center gap-2 rounded-full px-5 text-sm font-bold transition-colors";

export function PrepararCurriculum({ job }: { job: Vacante }) {
  const en = useLocale() === "en";
  const guardar = (destino: "cv" | "carta") => {
    const vacante: VacanteParaCurriculum = {
      puesto: job.title,
      empresa: job.employer_name ?? "",
      texto: textoDeLaVacante(job, en),
      destino,
    };
    try {
      window.sessionStorage.setItem(VACANTE_PARA_CURRICULUM, JSON.stringify(vacante));
    } catch { /* sin almacenamiento: el generador abre igual, sin la vacante */ }
  };
  const para = [job.title, job.employer_name].map((x) => x?.trim()).filter(Boolean).join(" · ");
  return (
    <section className="mt-7 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-4 rounded-2xl border border-[#d9e8f2] bg-[#f5fafd] p-4 sm:p-5" data-testid="preparar-postulacion">
      <div className="flex min-w-0 gap-3">
        <span className="ccr-caja-icono grid h-10 w-10 shrink-0 place-items-center rounded-xl"><FileUser className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-black leading-6 text-[#162543]">{en ? "Get your application ready for this job" : "Prepare su postulación a este empleo"}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#52627a]">
            {en
              ? "We tailor your resume and your cover letter to this job using your profile data. You review every change before accepting it."
              : "Adaptamos su currículum y su carta a este puesto con los datos de su perfil. Usted revisa cada cambio antes de aceptarlo."}
          </p>
          {para && <p className="mt-1.5 truncate text-[12px] font-semibold text-[#007fae]">{para}</p>}
        </div>
      </div>
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 sm:grid-cols-2">
        <Link href="/dashboard/profesional?tab=cv" onClick={() => guardar("cv")} data-testid="preparar-cv"
          className={cn(boton, "bg-[#009FD9] text-white hover:bg-[#0089bb]")}>
          <Sparkles className="h-4 w-4 shrink-0" /><span className="truncate">{en ? "Tailor my resume" : "Adaptar mi currículum"}</span>
        </Link>
        <Link href="/dashboard/profesional?tab=carta" onClick={() => guardar("carta")} data-testid="preparar-carta"
          className={cn(boton, "border border-[#b9d9e8] bg-white text-[#007fae] hover:bg-[#f0f8fc]")}>
          <Mail className="h-4 w-4 shrink-0" /><span className="truncate">{en ? "Write my letter" : "Escribir mi carta"}</span>
        </Link>
      </div>
    </section>
  );
}
