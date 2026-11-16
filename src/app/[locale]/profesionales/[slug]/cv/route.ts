import { getProfessionalBySlug } from '@/lib/queries/professionals';
import { fail, servirCv } from '@/lib/cv/servir-cv';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * EL CV CON UN ENLACE QUE SE PUEDE COMPARTIR (15-nov-2026):
 * contratacr.com/<perfil>/cv en vez de /api/professional-cv?professionalId=<uuid>.
 * Abre el PDF en el navegador; con ?descargar lo baja como "CV-<perfil>.pdf".
 * Las reglas de quién lo puede ver son las mismas de la API (lib/cv/servir-cv).
 */
export async function GET(req: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!/^[a-z0-9][a-z0-9-]{2,80}$/i.test(slug)) return fail('CV no disponible.', 404);
  const pro = await getProfessionalBySlug(slug.toLowerCase()).catch(() => null);
  if (!pro?.id) return fail('CV no disponible.', 404);
  const corto = String(pro.slug ?? slug).replace(/-[a-z0-9]{8}$/, '');
  return servirCv(req, { id: pro.id, descargar: new URL(req.url).searchParams.has('descargar'), nombre: `CV-${corto}` });
}
