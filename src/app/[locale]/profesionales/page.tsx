import { permanentRedirect } from "next/navigation";

/**
 * Recortar la dirección hacia arriba es un gesto normal: alguien que está en
 * `/profesionales/juan-perez-k3d9f2a1` borra el último tramo para ver «todos
 * los profesionales». Eso daba «página no encontrada», aunque la ruta figura
 * como pública en el middleware y en RUTAS_DEL_SITIO.
 *
 * No hay índice de profesionales —el buscador ES el índice—, así que lleva
 * ahí. Permanente (308), para que Google no se quede con las dos.
 */
export default async function ProfesionalesRedirect({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  permanentRedirect(`/${locale}/buscar`);
}
