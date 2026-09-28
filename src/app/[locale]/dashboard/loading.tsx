import { PanelSkeleton } from "@/components/ui/section-skeletons";

/**
 * El panel espera con SU forma, no con el lienzo genérico.
 *
 * Con el lienzo de ruta se veían dos esperas distintas seguidas —barra blanca
 * sobre gris y después el esqueleto del panel— y el cambio entre las dos se
 * lee como un parpadeo. Usando el mismo dibujo que pinta la pantalla mientras
 * carga, la espera es una sola y nada salta al llegar.
 */
export default function Cargando() {
  return <PanelSkeleton />;
}
