import { enforceRateLimit } from '@/lib/rate-limit';
import { scanUpload } from '@/lib/moderation/files';
import { context, fail, json, metadata, servirCv } from '@/lib/cv/servir-cv';
import { CV_BUCKET, CV_FILE_MAX, cvFileType } from '@/lib/cv/file-validation';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const GET = (req: Request) => servirCv(req);
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
