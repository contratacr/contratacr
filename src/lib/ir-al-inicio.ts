import { olvidarDesplazamientoGuardado } from "@/lib/body-scroll-lock";

/**
 * Deja la pantalla arriba del todo. Y SE ASEGURA DE QUE SE QUEDE.
 *
 * Una sección SIEMPRE se abre desde su comienzo. Esto se intentó arreglar
 * muchas veces poniendo más llamadas a `scrollTo(0)` en más sitios, y en el
 * iPhone seguía abriendo a media altura. El motivo es que el problema NO era
 * la falta de llamadas: era que algo las deshacía justo después. Son tres
 * cosas, y ninguna se reproduce en las pruebas de escritorio:
 *
 * 1. LA INERCIA. WebKit descarta un desplazamiento programático mientras queda
 *    inercia de un deslizamiento del dedo. Isaac desliza la lista y toca una
 *    sección enseguida: el `scrollTo(0)` se ejecuta, WebKit lo ignora y la
 *    deceleración termina de bajar la pantalla. En Playwright no pasa nunca
 *    porque un `scrollTo` de prueba no tiene inercia. Por eso «no se arregla».
 * 2. EL CANDADO DEL CUERPO. Con un menú o una ventana encima, el cuerpo queda
 *    en `position: fixed` y la ventana YA está en 0: el `scrollTo(0)` de la
 *    sección nueva no hace nada, y al cerrarse el menú el candado devuelve la
 *    altura que había guardado.
 * 3. LA MEMORIA DEL NAVEGADOR. Safari vuelve a aplicar por su cuenta el
 *    desplazamiento de la entrada de historial, y lo hace después de nuestros
 *    efectos.
 *
 * Contra las tres: se desactiva la memoria del navegador, se le dice al candado
 * que no restaure, y se INSISTE durante medio segundo mientras la pantalla no
 * esté arriba. La insistencia se corta en cuanto el dedo ARRASTRA, así que nunca
 * pelea contra un desplazamiento querido por quien lo usa; el toque que abre la
 * sección no cuenta, porque un toque no desplaza.
 */

const MS_DE_INSISTENCIA = 600;
/** Debajo de esto, una llamada es la REPETICIÓN de la anterior, no una apertura nueva. */
const MS_DE_LA_MISMA_APERTURA = 800;

let cuadro: number | null = null;
let soltarEscuchas: (() => void) | null = null;
let ultimoArrastre = -Infinity;
let ultimaLlamada = -Infinity;
let aperturaEnCurso = -Infinity;
let vigilandoGestos = false;

// ARRASTRAR, no tocar. El toque que ABRE la sección no debe contar como «el
// usuario está desplazando»: solo cuentan los gestos que mueven la pantalla.
const GESTOS_QUE_DESPLAZAN = ["touchmove", "wheel"] as const;
const TECLAS_QUE_DESPLAZAN = new Set([
  "ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " ",
]);

function vigilarGestos() {
  if (vigilandoGestos || typeof window === "undefined") return;
  vigilandoGestos = true;
  const anotar = () => { ultimoArrastre = performance.now(); };
  GESTOS_QUE_DESPLAZAN.forEach((g) => window.addEventListener(g, anotar, { passive: true, capture: true }));
  window.addEventListener("keydown", (e) => { if (TECLAS_QUE_DESPLAZAN.has(e.key)) anotar(); }, { capture: true });
}

/** Corta la insistencia: la usa quien SÍ quiere mover la pantalla a otro sitio. */
export function noInsistirArriba() {
  if (cuadro !== null) {
    cancelAnimationFrame(cuadro);
    cuadro = null;
  }
  soltarEscuchas?.();
  soltarEscuchas = null;
}

function arriba() {
  // «instant» y no «auto»: `auto` obedece al CSS, y el CSS pide `smooth` para
  // los enlaces internos; con eso, abrir una sección se veía SUBIR en vez de
  // abrir arriba.
  const a: ScrollToOptions = { top: 0, left: 0, behavior: "instant" };
  window.scrollTo(a);
  document.scrollingElement?.scrollTo(a);
  // El panel también desplaza su propio cuerpo en algunos anchos: moviendo solo
  // la ventana, la sección abría a media altura.
  document.querySelector("main.ccr-dashboard-main")?.scrollTo(a);
  document.querySelector("main")?.scrollTo(a);
}

function estaArriba() {
  if (window.scrollY > 0) return false;
  if ((document.scrollingElement?.scrollTop ?? 0) > 0) return false;
  if ((document.querySelector("main")?.scrollTop ?? 0) > 0) return false;
  return true;
}

export function irAlInicio() {
  if (typeof window === "undefined") return;

  vigilarGestos();

  // Abrir una sección dispara varias llamadas seguidas (al pintar, a los 160 ms
  // por si el contenido llegó tarde, al cambiar la ruta). Todas ellas son LA
  // MISMA apertura. Si entre medias el dedo arrastró, el mando ya es del
  // usuario y las repeticiones se callan: si no, le arrancarían la pantalla de
  // las manos. Una apertura NUEVA, en cambio, siempre sube —aunque venga justo
  // después de un deslizamiento, que es precisamente el caso que fallaba.
  const ahora = performance.now();
  if (ahora - ultimaLlamada >= MS_DE_LA_MISMA_APERTURA) aperturaEnCurso = ahora;
  ultimaLlamada = ahora;
  if (ultimoArrastre > aperturaEnCurso) return;

  noInsistirArriba();

  // (2) Que soltar el menú o la ventana no devuelva la pantalla abajo.
  olvidarDesplazamientoGuardado();

  // (3) Que Safari no reponga el desplazamiento guardado de la entrada de
  //     historial. La app ya estrena arriba en cada cambio de ruta, así que su
  //     memoria nunca aportó nada y sí deshacía esto.
  try {
    if ("scrollRestoration" in history) history.scrollRestoration = "manual";
  } catch {
    /* algunos navegadores lo bloquean; el resto del arreglo sigue valiendo */
  }

  arriba();

  // (1) Insistir mientras dure la inercia. Y parar al primer gesto.
  const hasta = performance.now() + MS_DE_INSISTENCIA;
  const cortar = () => noInsistirArriba();
  GESTOS_QUE_DESPLAZAN.forEach((g) => window.addEventListener(g, cortar, { passive: true, capture: true }));
  soltarEscuchas = () => GESTOS_QUE_DESPLAZAN.forEach((g) => window.removeEventListener(g, cortar, { capture: true }));

  const paso = () => {
    if (performance.now() > hasta) {
      noInsistirArriba();
      return;
    }
    if (!estaArriba()) arriba();
    cuadro = requestAnimationFrame(paso);
  };
  cuadro = requestAnimationFrame(paso);
}
