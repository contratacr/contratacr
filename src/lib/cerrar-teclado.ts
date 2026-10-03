/**
 * CERRAR EL TECLADO AL DESLIZAR UNA LISTA, como hacen las apps del iPhone.
 * Con el teclado abierto, Safari mueve la vista en lugar de la lista que está
 * debajo del dedo y la lista no baja. Al empezar a deslizar se suelta el campo:
 * el teclado se va y la lista se mueve con normalidad.
 */
export function cerrarTecladoAlDeslizar() {
  const activo = document.activeElement;
  if (activo instanceof HTMLInputElement || activo instanceof HTMLTextAreaElement) activo.blur();
}
