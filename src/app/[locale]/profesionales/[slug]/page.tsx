import { getProfessionalBySlug } from "@/lib/queries/professionals";
import ProfileClient from "./profile-client";

// La ficha se arma en el SERVIDOR y el navegador la recibe pintada.
//
// Antes esta ruta era un componente de cliente que pedía el perfil al montar:
// hasta que respondía solo había un esqueleto (primer pintado a los 2,6 s en un
// teléfono, medido en producción) y el HTML que recibía Google no traía ni el
// nombre ni los servicios, solo los metadatos de la cabecera. El dato ya estaba
// aquí: la cabecera lo consulta para los metadatos con una consulta cacheada
// cinco minutos, así que traerlo de nuevo no cuesta una lectura más.
//
// El componente de cliente sigue siendo el mismo y revalida en silencio al
// montar; lo único que cambia es que arranca con la ficha puesta.
export const revalidate = 300;

export default async function ProfilePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const ficha = await getProfessionalBySlug(slug);
  return <ProfileClient fichaInicial={ficha} />;
}
