import { headers } from "next/headers";
import { Compass, Search } from "lucide-react";
import { ErrorScreen, errorPrimaryBtn, errorSecondaryBtn } from "@/components/error/error-screen";

/**
 * LA PANTALLA DE «NO EXISTE» PARA LO QUE NO ES NINGUNA RUTA.
 *
 * Antes este archivo hacía `redirect("/es")`. Nunca se notó porque el
 * `<Suspense>` que había encima de todas las páginas mandaba la respuesta antes
 * de que el redirect llegara a ejecutarse, y el visitante veía un 404. Al
 * quitar esa frontera el redirect empezó a correr de verdad, y mandar TODA
 * dirección desconocida a la portada es exactamente el patrón que Google marca
 * como falso 404: al buscador le dice «esto existe y es la portada», y termina
 * desconfiando de todas las direcciones del sitio.
 *
 * Una dirección que no existe responde 404 y lo dice en pantalla, con salida
 * hacia la portada y el buscador.
 *
 * Sin `next-intl` a mano: esto se pinta FUERA de `[locale]`, donde no hay
 * catálogo de textos cargado. El idioma lo pone el middleware en la petición,
 * igual que el layout raíz.
 */
export default async function NotFound() {
  const en = (await headers()).get("x-ccr-locale") === "en";
  return (
    <ErrorScreen
      code="404"
      icon={<Compass className="h-7 w-7" />}
      title={en ? "We couldn't find that page" : "No encontramos esa página"}
      message={
        en
          ? "The address may have changed or no longer exists. You can go back home or search for a professional."
          : "La dirección puede haber cambiado o ya no existe. Podés volver al inicio o buscar un profesional."
      }
    >
      <a href={en ? "/en" : "/es"} className={errorPrimaryBtn}>
        {en ? "Go home" : "Ir al inicio"}
      </a>
      <a href={en ? "/en/buscar" : "/es/buscar"} className={errorSecondaryBtn}>
        <Search className="h-4 w-4" /> {en ? "Search professionals" : "Buscar profesionales"}
      </a>
    </ErrorScreen>
  );
}
