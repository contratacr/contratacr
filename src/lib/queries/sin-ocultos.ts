/**
 * «No sale en el buscador» son dos cosas: sancionado (`is_banned`) y oculto a
 * propósito (`oculto_del_buscador`, las cuentas internas). Este ayudante aplica
 * la segunda y REINTENTA sin ella si la columna todavía no existe: la migración
 * y el despliegue del código nunca llegan en el mismo instante, y una portada
 * sin cuenta de oferta se nota más que una cuenta interna de más por un minuto.
 */
export async function sinOcultos<T extends { error: unknown }>(
  consulta: (excluirOcultos: boolean) => PromiseLike<T>,
): Promise<T> {
  const primera = await consulta(true);
  const mensaje = (primera.error as { message?: string } | null)?.message ?? "";
  if (primera.error && /oculto_del_buscador|column|schema cache|PGRST204/i.test(mensaje)) {
    return consulta(false);
  }
  return primera;
}
