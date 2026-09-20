/**
 * La imagen con la que se ve un enlace de ContrataCR al compartirlo (WhatsApp,
 * LinkedIn, Facebook, X): la tarjeta de 1200×630 con el logo de los dos azules
 * sobre blanco, la misma de la portada.
 *
 * Hace falta ponerla A MANO en cada página que defina su propio `openGraph` o
 * `twitter`: Next NO mezcla esos objetos con los del layout, los REEMPLAZA. Una
 * página que solo ponía `openGraph: { title, description }` perdía la imagen, y
 * sin imagen la red social cae al ícono del sitio —el símbolo con la R blanca,
 * que sobre el fondo blanco de la tarjeta no se ve—. Así salían /buscar y las
 * páginas por oficio, justo las que más se comparten.
 */
export function imagenSocial(locale: string) {
  const IDIOMAS = ["es", "en"];
  const url = `/${IDIOMAS.includes(locale) ? locale : IDIOMAS[0]}/opengraph-image`;
  return {
    openGraph: { images: [{ url, width: 1200, height: 630, alt: "ContrataCR" }] },
    twitter: { card: "summary_large_image" as const, images: [url] },
  };
}
