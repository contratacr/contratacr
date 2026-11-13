// EDITAR UNA PUBLICACIÓN DESDE EL PANEL (empleos, promociones y proyectos).
// Un administrador corrige el texto que se ve —un título con un error de
// dedo, como «Ayudannte»— sin pedirle al dueño que lo haga. Solo título y
// descripción: precio, salario, fotos o ubicación siguen siendo del dueño.
// Los límites son los mismos que aplica el formulario de cada sección, así lo
// que guarda el panel siempre cabe en lo que la base y el formulario aceptan.
// Este archivo no importa nada para que las pruebas lo puedan transpilar solo.

export type EditablePublicationKind = "job" | "offer" | "project";

export const PUBLICATION_EDIT_LIMITS: Record<EditablePublicationKind, { title: [number, number]; description: [number, number] }> = {
  job: { title: [3, 120], description: [30, 5000] },
  offer: { title: [3, 120], description: [20, 3000] },
  project: { title: [3, 80], description: [1, 300] },
};

export const PUBLICATION_TABLE: Record<EditablePublicationKind, string> = {
  job: "job_posts",
  offer: "professional_offers",
  project: "projects",
};

export type PublicationEdit = { title: string; description: string };

/** Limpia y valida lo que manda el panel. Devuelve el error en español. */
export function validatePublicationEdit(kind: unknown, input: { title?: unknown; description?: unknown }):
  | { ok: true; kind: EditablePublicationKind; value: PublicationEdit }
  | { ok: false; error: string } {
  if (kind !== "job" && kind !== "offer" && kind !== "project") return { ok: false, error: "Tipo de publicación no válido." };
  const limits = PUBLICATION_EDIT_LIMITS[kind];
  const title = typeof input.title === "string" ? input.title.replace(/\s+/g, " ").trim() : "";
  const description = typeof input.description === "string" ? input.description.replace(/\r\n/g, "\n").trim() : "";
  if (title.length < limits.title[0] || title.length > limits.title[1]) {
    return { ok: false, error: `El título debe tener entre ${limits.title[0]} y ${limits.title[1]} caracteres.` };
  }
  if (description.length < limits.description[0] || description.length > limits.description[1]) {
    return { ok: false, error: `La descripción debe tener entre ${limits.description[0]} y ${limits.description[1]} caracteres.` };
  }
  return { ok: true, kind, value: { title, description } };
}
