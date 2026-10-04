import { ClipboardList } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * LA INVITACIÓN A PUBLICAR UN PROYECTO, igual en todo el app (4-oct-2026).
 * Aparece donde la persona no encontró o no se decidió: el final de los
 * resultados, el vacío de una búsqueda. Lleva el servicio y el lugar ya puestos
 * en el formulario, y quita el miedo en una línea.
 */
export function TarjetaPublicarProyecto({
  titulo, texto, boton, pie, categoria, provincia, canton, className,
}: {
  titulo: string; texto: string; boton: string; pie: string;
  categoria?: string | null; provincia?: string | null; canton?: string | null; className?: string;
}) {
  const p = new URLSearchParams();
  if (categoria) p.set("categoria", categoria);
  if (provincia) p.set("provincia", provincia);
  if (canton) p.set("canton", canton);
  const href = `/publicar-proyecto${p.toString() ? `?${p.toString()}` : ""}`;
  return (
    <div data-tarjeta-publicar-proyecto className={cn("rounded-2xl border border-[#d9ecf6] bg-[linear-gradient(135deg,#f3fbff_0%,#ffffff_70%)] p-5 text-center", className)}>
      <span className="ccr-caja-icono mx-auto grid h-12 w-12 place-items-center rounded-2xl"><ClipboardList className="h-6 w-6" strokeWidth={1.7} /></span>
      <p className="mt-3 text-[17px] font-extrabold text-[#162543]">{titulo}</p>
      <p className="mx-auto mt-1 max-w-sm text-[14px] leading-snug text-[#526277]">{texto}</p>
      <Link href={href} className="mt-4 inline-flex h-11 items-center justify-center rounded-full bg-[#009FD9] px-6 text-sm font-bold text-white transition-colors hover:bg-[#0089bb]">
        {boton}
      </Link>
      <p className="mt-2.5 text-[12px] font-semibold text-[#7a8797]">{pie}</p>
    </div>
  );
}
