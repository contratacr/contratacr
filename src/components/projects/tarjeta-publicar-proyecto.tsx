import { ClipboardList, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";

/**
 * LA INVITACIÓN A PUBLICAR UN PROYECTO, al final de los resultados (4-oct-2026).
 * Lleva el servicio y el lugar ya puestos en el formulario. Sin la línea
 * «Gratis · Tu número no se publica»: una tarjeta de la lista no lleva pie.
 *
 * Tiene la MISMA forma que la tarjeta de un profesional (8-oct-2026): el ícono
 * donde va la foto, el título donde va el nombre y el botón a todo el ancho
 * donde va «Contactar por WhatsApp». Como cuadro centrado con degradado se leía
 * como un anuncio pegado a la lista. Sin estrellas, precio ni zona: que nadie
 * la confunda con un profesional más. El botón dice «Publicar proyecto» para
 * que la palabra de la sección se vuelva conocida. Sin la sombra de las
 * tarjetas: va siempre de última y debajo queda blanco, donde la sombra se veía
 * como una mancha.
 */
export function TarjetaPublicarProyecto({
  titulo, texto, boton, categoria, provincia, canton, className,
}: {
  titulo: string; texto: string; boton: string;
  categoria?: string | null; provincia?: string | null; canton?: string | null; className?: string;
}) {
  const p = new URLSearchParams();
  if (categoria) p.set("categoria", categoria);
  if (provincia) p.set("provincia", provincia);
  if (canton) p.set("canton", canton);
  const href = `/publicar-proyecto${p.toString() ? `?${p.toString()}` : ""}`;
  return (
    <article
      data-tarjeta-publicar-proyecto
      className={cn(
        "flex min-w-0 flex-col gap-3 bg-white px-4 py-3 lg:grid lg:grid-cols-[minmax(0,1fr)_292px] lg:items-center lg:gap-5 lg:rounded-2xl lg:border lg:border-[#e5e7eb] lg:p-4 lg:shadow-none",
        className,
      )}
    >
      <div className="flex min-w-0 items-start gap-2.5 lg:gap-3">
        <span className="grid h-[52px] w-[52px] shrink-0 place-items-center rounded-full bg-[#EBF5FB] text-[#009FD9] lg:h-16 lg:w-16">
          <ClipboardList className="h-6 w-6 lg:h-7 lg:w-7" strokeWidth={1.8} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-bold leading-[1.1] text-[#111827]">{titulo}</p>
          <p className="mt-1.5 text-[13px] leading-snug text-[#526277]">{texto}</p>
        </div>
      </div>
      <div className="lg:flex lg:min-h-full lg:items-center lg:border-l lg:border-[#e5e7eb] lg:pl-4">
        <Link
          href={href}
          className="inline-flex h-11 w-full items-center justify-center gap-1.5 rounded-full bg-[#009FD9] text-[13px] font-bold text-white transition-colors hover:bg-[#0089bb]"
        >
          <Plus className="h-4 w-4" strokeWidth={2.4} />
          {boton}
        </Link>
      </div>
    </article>
  );
}
