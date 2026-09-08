"use client";

import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { useLocale } from "next-intl";
import { useRouter } from "@/i18n/navigation";
import { BookingModal } from "@/components/booking/booking-modal";
import { PanelListSkeleton } from "@/components/ui/content-loading";
import { getCategoryLabel } from "@/lib/data/categories";

/**
 * Reservar una cita como PÁGINA propia, no como capa sobre /buscar o sobre el
 * perfil. Vivir encima de otra pantalla arrastraba todos sus problemas: el
 * fondo de la página de atrás asomando por cualquier hueco, el apilado de esa
 * pantalla y el teclado encogiendo la capa. Con ruta propia además se puede
 * compartir el enlace y volver con el gesto de atrás del teléfono.
 */
export default function ReservarPage() {
  const params = useParams<{ slug: string }>();
  const searchParams = useSearchParams();
  const router = useRouter();
  const locale = useLocale();
  const [pro, setPro] = useState<Parameters<typeof BookingModal>[0]["professional"] | null>(null);
  const [noEncontrado, setNoEncontrado] = useState(false);

  const slug = typeof params?.slug === "string" ? params.slug : "";
  useEffect(() => {
    if (!slug) return;
    let vivo = true;
    void (async () => {
      const res = await fetch(`/api/professionals/${slug}`);
      if (!vivo) return;
      if (!res.ok) { setNoEncontrado(true); return; }
      setPro(await res.json());
    })();
    return () => { vivo = false; };
  }, [slug]);

  useEffect(() => {
    if (noEncontrado) router.replace(`/profesionales/${slug}`);
  }, [noEncontrado, router, slug]);

  // La pantalla es la reserva entera: la barra de la app y la de pestañas
  // sobran mientras dura (como en Publicar empleo).
  useEffect(() => {
    document.body.classList.add("ccr-booking-route");
    document.documentElement.classList.add("ccr-booking-route");
    return () => {
      document.body.classList.remove("ccr-booking-route");
      document.documentElement.classList.remove("ccr-booking-route");
    };
  }, []);

  if (!pro) {
    return (
      <div className="min-h-[100dvh] bg-[#f4f7fa] px-4 py-6">
        <PanelListSkeleton rows={3} />
      </div>
    );
  }

  // La flecha devuelve a DONDE SE VENÍA: /buscar, el perfil o lo que fuera.
  // Antes llevaba siempre al perfil, aunque uno hubiera entrado desde la
  // búsqueda, y se perdían los resultados y la posición.
  function volver() {
    const desde = searchParams.get("desde");
    if (desde && desde.startsWith("/") && !desde.startsWith("//")) { router.push(desde); return; }
    if (typeof window !== "undefined" && window.history.length > 1) { router.back(); return; }
    router.push(`/profesionales/${slug}`);
  }

  const categoria = searchParams.get("servicio");
  return (
    <BookingModal
      asPage
      open
      professional={pro}
      categoryName={categoria ? getCategoryLabel(categoria, locale) : getCategoryLabel(pro.categoryId, locale)}
      onClose={volver}
      initialCategoryId={categoria}
      initialDate={searchParams.get("fecha") ?? undefined}
      initialTime={searchParams.get("hora") ?? undefined}
      initialLocationId={searchParams.get("lugar")}
      initialLocationLabel={searchParams.get("lugarNombre")}
    />
  );
}
