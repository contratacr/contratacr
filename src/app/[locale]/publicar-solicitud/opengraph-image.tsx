import { OG_TAMANO, OG_TIPO, tarjetaDeSeccion } from "@/lib/seo/tarjeta-de-seccion";

export const size = OG_TAMANO;
export const contentType = OG_TIPO;
export const revalidate = 86400;

export default async function Image({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return tarjetaDeSeccion(locale, "seccionPublicar");
}
