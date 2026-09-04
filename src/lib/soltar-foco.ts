// iOS dibuja su burbuja de autocorrección ("Nutrí ×") FUERA del documento,
// atada al campo que tiene el foco. Si ese campo se desmonta sin soltar el
// foco —al elegir de una lista, al cerrar una hoja de búsqueda, al enviar una
// sugerencia— la burbuja se queda huérfana flotando sobre la pantalla
// siguiente. Soltar el foco antes de desmontar la retira con el campo.
export function soltarFoco() {
  if (typeof document === "undefined") return;
  const enfocado = document.activeElement;
  if (enfocado instanceof HTMLElement) enfocado.blur();
}
