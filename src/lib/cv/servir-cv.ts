import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { quarantinedPaths } from '@/lib/moderation/files';
import { CV_BUCKET, CV_FILE_MAX } from '@/lib/cv/file-validation';

/**
 * Leer el CV adjunto de un profesional. Lo usan /api/professional-cv y el
 * enlace corto contratacr.com/<perfil>/cv: las dos direcciones pasan por las
 * mismas reglas (suspendido, oculto, CV retirado, cuarentena).
 */
export const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, noarchive' };
export const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
export const fail = (message: string, status: number) => json({ error: message }, status);
export const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CvFile = { professional_id: string; path: string; mime: string; size: number; visible: boolean; version: string };
export const metadata = (row: CvFile | null) => row ? { visible: row.visible, version: row.version, name: row.mime === 'application/pdf' ? 'CV.pdf' : 'CV.docx' } : null;
export async function context(req: Request, writing: boolean, idDado?: string) {
  const url = new URL(req.url), id = idDado ?? (url.searchParams.get('professionalId') || '');
  if (!uuid.test(id)) return { error: fail('Perfil inválido.', 400) } as const;
  if (writing && (req.headers.get('origin') !== url.origin || req.headers.get('sec-fetch-site') === 'cross-site')) return { error: fail('Solicitud no permitida.', 403) } as const;
  const client = await createClient();
  const { data: { user } } = await client.auth.getUser();
  if (writing && !user) return { error: fail('Iniciá sesión.', 401) } as const;
  const db = createAdminClient();
  const { data: pro, error } = await db.from('professionals').select('id, profile_id, is_banned, oculto_del_buscador, profiles(is_disabled)').eq('id', id).maybeSingle();
  if (error) return { error: fail('No se pudo consultar el perfil.', 503) } as const;
  const owner = !!pro && user?.id === pro.profile_id;
  const profile = Array.isArray(pro?.profiles) ? pro.profiles[0] : pro?.profiles;
  if (!pro || pro.is_banned || profile?.is_disabled || (!owner && pro.oculto_del_buscador)) return { error: fail('CV no disponible.', 404) } as const;
  if (writing && !owner) return { error: fail('No podés modificar este CV.', 403) } as const;
  const result = await db.from('professional_cv_files').select('*').eq('professional_id', id).maybeSingle();
  if (result.error) return { error: fail('El servicio de CV no está disponible.', 503) } as const;
  return { db, id, owner, user, row: result.data as CvFile | null } as const;
}
export async function servirCv(req: Request, opciones: { id?: string; descargar?: boolean; nombre?: string } = {}) {
  try {
    const c = await context(req, false, opciones.id); if ('error' in c) return c.error;
    const { db, row, owner } = c;
    if ((!row || !row.visible) && !owner) return fail('CV no disponible.', 404);
    if (new URL(req.url).searchParams.get('metadata') === '1') return json({ file: metadata(row) });
    if (!row) return fail('CV no disponible.', 404);
    if ((await quarantinedPaths(db, CV_BUCKET, [row.path])).has(row.path)) return fail('CV no disponible.', 404);
    const { data, error } = await db.storage.from(CV_BUCKET).download(row.path);
    if (error || !data || data.size > CV_FILE_MAX) return fail('CV no disponible.', 404);
    // Check again after retrieval: withdrawing or replacing the CV invalidates in-flight reads.
    const latest = await db.from('professional_cv_files').select('version, visible').eq('professional_id', c.id).maybeSingle();
    if (latest.error || latest.data?.version !== row.version || (!owner && !latest.data.visible)) return fail('CV no disponible.', 404);
    return new Response(data, { headers: { ...headers, 'Content-Type': row.mime, 'Content-Length': String(data.size), 'Content-Disposition': `${row.mime === 'application/pdf' && !opciones.descargar ? 'inline' : 'attachment'}; filename="${opciones.nombre ? `${opciones.nombre}.${row.mime === 'application/pdf' ? 'pdf' : 'docx'}` : metadata(row)!.name}"`, 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } });
  } catch { return fail('No se pudo abrir el CV.', 503); }
}
