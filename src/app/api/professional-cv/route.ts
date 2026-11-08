import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { enforceRateLimit } from '@/lib/rate-limit';
import { quarantinedPaths, scanUpload } from '@/lib/moderation/files';
import { CV_BUCKET, CV_FILE_MAX, cvFileType } from '@/lib/cv/file-validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
const headers = { 'Cache-Control': 'private, no-store, max-age=0', 'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, noarchive' };
const json = (data: unknown, status = 200) => Response.json(data, { status, headers });
const fail = (message: string, status: number) => json({ error: message }, status);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
type CvFile = { professional_id: string; path: string; mime: string; size: number; visible: boolean; version: string };
const metadata = (row: CvFile | null) => row ? { visible: row.visible, version: row.version, name: row.mime === 'application/pdf' ? 'CV.pdf' : 'CV.docx' } : null;
async function context(req: Request, writing: boolean) {
  const url = new URL(req.url), id = url.searchParams.get('professionalId') || '';
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
export async function GET(req: Request) {
  try {
    const c = await context(req, false); if ('error' in c) return c.error;
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
    return new Response(data, { headers: { ...headers, 'Content-Type': row.mime, 'Content-Length': String(data.size), 'Content-Disposition': `${row.mime === 'application/pdf' ? 'inline' : 'attachment'}; filename="${metadata(row)!.name}"`, 'Content-Security-Policy': "sandbox; default-src 'none'; frame-ancestors 'none'", 'Referrer-Policy': 'no-referrer' } });
  } catch { return fail('No se pudo abrir el CV.', 503); }
}
async function boundedBody(req: Request, limit: number) {
  if (Number(req.headers.get('content-length')) > limit) throw new Error('size');
  const reader = req.body?.getReader(); if (!reader) throw new Error('body');
  const parts: Uint8Array[] = []; let size = 0;
  while (true) { const { done, value } = await reader.read(); if (done) break; size += value.length; if (size > limit) { await reader.cancel(); throw new Error('size'); } parts.push(value); }
  const bytes = new Uint8Array(size); let at = 0; for (const part of parts) { bytes.set(part, at); at += part.length; } return bytes;
}
export async function POST(req: Request) {
  const rate = enforceRateLimit(req, 'professional-cv-upload', 8, 60_000); if (rate) return rate;
  try {
    const c = await context(req, true); if ('error' in c) return c.error;
    let form: FormData;
    try { const body = await boundedBody(req, CV_FILE_MAX + 65536); form = await new Request(req.url, { method: 'POST', headers: { 'Content-Type': req.headers.get('content-type') || '' }, body }).formData(); } catch { return fail('Usá un PDF o DOCX de hasta 5 MB.', 400); }
    const file = form.get('file'), expected = form.get('version') || null;
    if (!(file instanceof File) || form.get('share') !== 'true') return fail('Confirmá que querés mostrar el CV en tu perfil.', 400);
    if ((c.row?.version || null) !== expected) return fail('El CV cambió. Recargá e intentá de nuevo.', 409);
    const bytes = new Uint8Array(await file.arrayBuffer());
    let kind; try { kind = cvFileType(bytes, file.name); } catch (e) { return fail(e instanceof Error ? e.message : 'Archivo inválido.', 400); }
    try { await scanUpload(bytes); } catch { return fail('El archivo no pudo superar el análisis. Intentá más tarde.', 422); }
    const version = crypto.randomUUID(), path = `${c.user!.id}/${c.id}/${version}.${kind.extension}`;
    const store = c.db.storage.from(CV_BUCKET);
    const uploaded = await store.upload(path, bytes, { contentType: kind.mime, upsert: false, cacheControl: '0' });
    if (uploaded.error) return fail('No se pudo guardar el archivo.', 503);
    const row = { professional_id: c.id, path, mime: kind.mime, size: bytes.length, visible: true, version };
    const save = c.row ? await c.db.from('professional_cv_files').update(row).eq('professional_id', c.id).eq('version', c.row.version).select('professional_id').maybeSingle() : await c.db.from('professional_cv_files').insert(row).select('professional_id').single();
    if (save.error || !save.data) { await store.remove([path]); return fail('No se pudo actualizar el CV. Recargá e intentá de nuevo.', 409); }
    if (c.row) { const removed = await store.remove([c.row.path]); if (removed.error) console.warn('[professional-cv] Previous private object cleanup pending'); }
    return json({ file: metadata(row) });
  } catch { return fail('No se pudo guardar el CV.', 503); }
}
async function mutate(req: Request, removing: boolean) {
  const rate = enforceRateLimit(req, 'professional-cv-change', 30, 60_000); if (rate) return rate;
  try {
    const c = await context(req, true); if ('error' in c) return c.error;
    let body; try { body = JSON.parse(new TextDecoder().decode(await boundedBody(req, 2048))); } catch { return fail('Solicitud inválida.', 400); }
    if (!c.row || c.row.version !== body?.version) return fail('El CV cambió. Recargá e intentá de nuevo.', 409);
    if (removing) {
      const removed = await c.db.storage.from(CV_BUCKET).remove([c.row.path]);
      if (removed.error) return fail('No se pudo retirar el archivo. Intentá nuevamente.', 503);
      const result = await c.db.from('professional_cv_files').delete().eq('professional_id', c.id).eq('version', body.version).select('professional_id').maybeSingle();
      if (result.error || !result.data) return fail('El CV cambió. Recargá e intentá de nuevo.', 409);
      return json({ file: null });
    }
    if (typeof body.visible !== 'boolean') return fail('Solicitud inválida.', 400);
    const version = crypto.randomUUID();
    const result = await c.db.from('professional_cv_files').update({ visible: body.visible, version }).eq('professional_id', c.id).eq('version', body.version).select('professional_id').maybeSingle();
    if (result.error || !result.data) return fail('El CV cambió. Recargá e intentá de nuevo.', 409);
    return json({ file: metadata({ ...c.row, visible: body.visible, version }) });
  } catch { return fail('No se pudo actualizar el CV.', 503); }
}
export const PATCH = (req: Request) => mutate(req, false);
export const DELETE = (req: Request) => mutate(req, true);
