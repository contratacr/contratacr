"use client";
import { CABECERA_TITULO } from "@/components/layout/cabecera";

import { useTranslations } from "next-intl";
import { ArrowLeft } from "lucide-react";
import { useRouter } from "@/i18n/navigation";

export default function LoadingProject() {
  const t = useTranslations("publicarProyecto");
  const router = useRouter();
  return (
    <section aria-busy="true" className="fixed inset-0 z-[100] flex flex-col bg-white sm:inset-auto sm:relative sm:min-h-[60vh]">
      <header className="relative border-b bg-white px-14 py-4 text-center">
        <button type="button" aria-label={t("dismiss")} onClick={() => router.back()} className="absolute left-4 top-2 flex h-10 w-10 items-center justify-center"><ArrowLeft className="h-5 w-5" /></button>
        <h2 className={CABECERA_TITULO}>{t("title")}</h2>
      </header>
      <div className="mx-auto w-full max-w-2xl space-y-6 p-5" aria-hidden="true">
        {[1, 2, 3, 4].map((field) => <div key={field} className="space-y-3"><div className="h-4 w-36 animate-pulse rounded bg-slate-200" /><div className={`${field === 2 ? "h-28" : "h-12"} animate-pulse rounded-xl bg-white`} /></div>)}
      </div>
    </section>
  );
}
