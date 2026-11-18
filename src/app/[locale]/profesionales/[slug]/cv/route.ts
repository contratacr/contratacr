import { getProfessionalBySlug } from '@/lib/queries/professionals';
import { context, fail, headers, servirCv } from '@/lib/cv/servir-cv';
import { cvPublico } from '@/lib/cv/cv-publico';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * EL CV CON UN ENLACE QUE SE PUEDE COMPARTIR (15-nov-2026):
 * contratacr.com/<perfil>/cv en vez de /api/professional-cv?professionalId=<uuid>.
 * Abre el PDF en el navegador; con ?descargar lo baja como "CV-<perfil>.pdf".
 * Las reglas de quién lo puede ver son las mismas de la API (lib/cv/servir-cv).
 *
 * UN SOLO CURRÍCULUM (16-nov-2026): si el profesional subió su archivo y lo
 * muestra, sale ese. Si no, el PDF se arma con lo que el perfil ya muestra en
 * la pestaña Currículum (lib/cv/cv-publico), con el diseño del generador.
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string; locale?: string }> }) {
  const { slug, locale } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(slug)) return fail('CV no disponible.', 404);
  const pro = await getProfessionalBySlug(slug.toLowerCase()).catch(() => null);
  if (!pro?.id) return fail('CV no disponible.', 404);
  const corto = String(pro.slug ?? slug).replace(/-[a-z0-9]{8}$/, '');
  const descargar = new URL(req.url).searchParams.has('descargar');
  const c = await context(req, false, pro.id); if ('error' in c) return c.error;
  if (c.row?.visible) return servirCv(req, { id: pro.id, descargar, nombre: `CV-${corto}` });
  const cv = cvPublico(pro, locale?.startsWith('en') ? 'en' : 'es');
  if (!cv) return fail('CV no disponible.', 404);
  try {
    const { pdfDelCvEnBytes } = await import('@/lib/cv/pdf-documento');
    const bytes = await pdfDelCvEnBytes(cv);
    return new Response(bytes, { headers: { ...headers, 'Content-Type': 'application/pdf', 'Content-Length': String(bytes.byteLength), 'Content-Disposition': `${descargar ? 'attachment' : 'inline'}; filename="CV-${corto}.pdf"`, 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } });
  } catch { return fail('No se pudo abrir el CV.', 503); }
}
