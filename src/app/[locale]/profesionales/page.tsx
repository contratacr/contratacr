/**
 * /profesionales ES la búsqueda de profesionales (antes vivía en /buscar). El
 * middleware ya reescribe esta dirección a la página de búsqueda; este archivo
 * es el respaldo para cualquier navegación que llegue sin pasar por él.
 */
export { default, generateMetadata } from "../buscar/page";
