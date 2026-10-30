// El enlace compartido usa el slug comercial cuando hay nombre de negocio.
//
// Los slugs personales antiguos traen un sufijo aleatorio (-977u5iku) que hace falta para
// evitar choques en la base, pero no para el enlace: el middleware manda la
// forma corta al perfil y `getProfessionalBySlug` la resuelve mientras no haya
// dos profesionales con el mismo nombre. La forma larga sigue funcionando, así
// que los enlaces ya compartidos y lo indexado en Google no se rompen.
// Los comerciales conservan su identificador estable de 10 (o 32) caracteres:
// dos negocios con el mismo nombre siempre comparten enlaces distintos.
export function enlacePerfil(slug: string, baseUrl?: string): string {
  let base = (baseUrl || process.env.NEXT_PUBLIC_APP_URL || "https://contratacr.com").replace(/\/$/, "");
  // Los despliegues de vista previa corren en …vercel.app. Ese enlace no se
  // comparte con nadie: si sale de ahí, se manda al dominio de verdad.
  if (/\.vercel\.app$/i.test(base.replace(/^https?:\/\//, "").split("/")[0])) {
    base = "https://contratacr.com";
  }
  return `${base}/${String(slug ?? "").replace(/-[a-z0-9]{8}$/, "")}`;
}
