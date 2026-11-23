import { OG_TAMANO, OG_TIPO, tarjetaGeneral } from "@/lib/seo/tarjeta-de-seccion";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const alt = "ContrataCR";
export const revalidate = 86400;

// La tarjeta general: la portada y toda página sin tarjeta propia. Marca y
// mensaje al centro, para que se vea bien ancha y recortada al cuadrado.
export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return tarjetaGeneral(locale);
}
