import { PerfilSkeleton } from "@/components/ui/section-skeletons";

// Al tocar una ficha (desde una marca, una tarjeta o la búsqueda) el esqueleto
// sale AL INSTANTE mientras el servidor arma el perfil (1-2 s en producción).
// Aquí sí puede vivir una frontera de espera: la ficha inexistente responde 200
// con noindex a propósito, no 404 (ver contratacr-estado-de-la-respuesta).
export default function Loading() {
  return <PerfilSkeleton />;
}
