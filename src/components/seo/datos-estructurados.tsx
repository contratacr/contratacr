/**
 * Datos estructurados (JSON-LD) para que Google entienda la página.
 *
 * El sitio solo los tenía en la portada. Sin ellos un buscador ve texto suelto:
 * no sabe que una ficha es un negocio local con calificación, ni que una página
 * por oficio es una lista de servicios, así que no puede mostrar estrellas ni
 * migas de pan en los resultados.
 *
 * Es un componente de servidor: solo escribe una etiqueta.
 */
export function DatosEstructurados({ datos }: { datos: unknown }) {
  if (!datos) return null;
  return (
    <script
      type="application/ld+json"
      // El contenido lo arma el servidor con datos ya saneados; sustituir el
      // signo de menor que por su escape evita que un nombre con etiquetas
      // cierre el bloque. El escape se arma con `fromCharCode` para no dejar
      // una secuencia escapada suelta en el archivo.
      dangerouslySetInnerHTML={{ __html: JSON.stringify(datos).split("<").join(`${String.fromCharCode(92)}u003c`) }}
    />
  );
}
