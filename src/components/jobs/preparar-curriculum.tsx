"use client";

import { FileUser } from "lucide-react";
import { useLocale } from "next-intl";
import { Link } from "@/i18n/navigation";
import type { JobPost } from "@/lib/jobs";

/**
 * «PREPARAR MI CURRÍCULUM PARA ESTE PUESTO», al pie de cada vacante.
 * Es el momento de más intención: quien lee una vacante está por postularse.
 * Le pasa al generador el puesto, la empresa y el texto de la vacante para
 * que la carta salga dirigida y las habilidades que pide queden primero.
 * Va por el almacenamiento de la sesión y no por la dirección: el texto de una vacante no
 * cabe en un enlace y no tiene por qué quedar en el historial.
 */
export const VACANTE_PARA_CURRICULUM = "ccr:cv-vacante:v1";

export function PrepararCurriculum({ job }: { job: Pick<JobPost, "title" | "description" | "requirements" | "responsibilities" | "employer_name"> }) {
  const en = useLocale() === "en";
  const guardar = () => {
    try {
      window.sessionStorage.setItem(VACANTE_PARA_CURRICULUM, JSON.stringify({
        puesto: job.title,
        empresa: job.employer_name ?? "",
        texto: [job.title, job.description, ...(job.requirements ?? []), ...(job.responsibilities ?? [])].filter(Boolean).join("\n").slice(0, 6000),
      }));
    } catch { /* sin almacenamiento: el generador abre igual, sin la vacante */ }
  };
  return (
    <section className="mt-7 flex flex-col gap-3 rounded-2xl border border-[#d9e8f2] bg-[#f5fafd] p-4 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex min-w-0 gap-3">
        <span className="ccr-caja-icono grid h-10 w-10 shrink-0 place-items-center rounded-xl"><FileUser className="h-5 w-5" /></span>
        <div className="min-w-0">
          <p className="text-[15px] font-black text-[#162543]">{en ? "Apply with a ready resume" : "Postulate con tu currículum listo"}</p>
          <p className="mt-0.5 text-[13px] leading-5 text-[#52627a]">{en ? "We prefill it from your profile and put first the skills this job asks for. Free." : "Lo prellenamos con tu perfil y ponemos primero las habilidades que pide este puesto. Gratis."}</p>
        </div>
      </div>
      <Link href="/dashboard/profesional?tab=cv" onClick={guardar} className="inline-flex h-11 shrink-0 items-center justify-center rounded-full border border-[#b9d9e8] bg-white px-5 text-sm font-bold text-[#007fae] transition hover:bg-[#f1f9fc]">
        {en ? "Prepare my resume" : "Preparar mi currículum"}
      </Link>
    </section>
  );
}
