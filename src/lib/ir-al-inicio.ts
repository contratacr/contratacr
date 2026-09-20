/**
 * Deja la pantalla arriba del todo.
 *
 * Una sección SIEMPRE se abre desde su comienzo. Al entrar, salir y volver a
 * entrar —a Contactar soporte, a editar un servicio, a un caso— la pantalla se
 * quedaba donde estaba, así que la sección abría por la mitad.
 *
 * Se mueven las dos cosas que desplazan en el app: la ventana y el cuerpo del
 * panel, que en algunos anchos tiene su propio desplazamiento.
 *
 * «instant» y no «auto»: `auto` obedece al CSS, y el CSS pide `smooth` para los
 * enlaces internos; con eso, abrir una sección se veía SUBIR en vez de abrir
 * arriba. Se repite en el cuadro siguiente porque el contenido nuevo puede
 * llegar después y devolver el desplazamiento.
 */
export function irAlInicio() {
  if (typeof window === "undefined") return;
  const arriba = () => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector("main.ccr-dashboard-main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
    document.querySelector("main")?.scrollTo({ top: 0, left: 0, behavior: "instant" });
  };
  arriba();
  requestAnimationFrame(arriba);
}
