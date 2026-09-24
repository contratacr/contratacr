/**
 * EL LIENZO MIENTRAS CARGA UNA PANTALLA.
 *
 * Estaba en un `<Suspense>` del layout RAÍZ, es decir por encima de TODAS las
 * páginas, y eso rompía algo que no se veía: con una frontera de espera arriba,
 * la respuesta sale con su estado —200— antes de que la página llegue a decir
 * que ese contenido no existe. Una dirección inventada
 * (`/es/servicios/zzz`, `/es/promociones/<id que no existe>`) respondía
 * «200, todo bien» mientras enseñaba un 404 en pantalla. Google llama a eso un
 * falso 404 y es de lo que peor le sienta a un sitio que está peleando por
 * indexarse.
 *
 * Así que la espera ya no vive arriba de todo, sino SOLO en las pantallas
 * privadas y pesadas —las que de verdad tardan y que además Google no indexa—,
 * con un `loading.tsx` por sección. Las páginas públicas de contenido
 * (servicios, empleos, promociones, proyectos, fichas) se quedaron sin
 * frontera: tardan lo mismo, porque están pre-generadas, y ahora sí pueden
 * responder 404 cuando no existen.
 *
 * Ninguna espera muestra la marca: en la app la marca es del splash nativo y en
 * la web el logotipo a pantalla completa se leía como otra pantalla de carga.
 * Se pinta el lienzo con la barra y el contenido llega con esqueletos.
 */
export function LienzoDeRuta() {
  return (
    <main className="ccr-page-route-loading fixed inset-0 z-[100000] bg-[#f4f7fa]" aria-busy="true" role="status">
      <div className="h-16 bg-white shadow-[0_1px_0_#e5e7eb]" />
      <span className="sr-only">Cargando...</span>
    </main>
  );
}

export default LienzoDeRuta;
