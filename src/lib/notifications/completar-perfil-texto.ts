// Texto del aviso "Complete su perfil" (18-nov-2026). Sin dependencias del
// servidor: lo usan el registro y la lista de notificaciones del navegador.
export type FaltaDelPerfil = "foto" | "descripcion" | "servicios";

export function textoCompletarPerfil(faltan: FaltaDelPerfil[], idioma: "es" | "en"): string {
  const nombres = idioma === "en"
    ? { foto: "your photo", descripcion: "a description", servicios: "your services" }
    : { foto: "su foto", descripcion: "una descripción", servicios: "sus servicios" };
  const lista = faltan.map((f) => nombres[f]);
  const unidos = lista.length <= 1 ? lista.join("") : `${lista.slice(0, -1).join(", ")} ${idioma === "en" ? "and" : "y"} ${lista[lista.length - 1]}`;
  const conMayuscula = (t: string) => t.charAt(0).toUpperCase() + t.slice(1);
  return idioma === "en"
    ? `Add ${unidos} so clients can learn what you offer.`
    : `${conMayuscula(`agregue ${unidos}`)} para que los clientes conozcan lo que ofrece.`;
}
