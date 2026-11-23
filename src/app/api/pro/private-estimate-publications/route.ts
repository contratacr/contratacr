import {createHash} from 'node:crypto';
import {z} from 'zod';
import {createClient} from '@/lib/supabase/server';
import {safeGetUser} from '@/lib/pro/workspace-user';
import {createAdminClient} from '@/lib/supabase/admin';
import {getApiAdmin} from '@/lib/auth/admin';
import {enforceRateLimit} from '@/lib/rate-limit';
import {
  canonicalPrivateEstimatePublicationInput,
  privateEstimatePublicationBindingsSchema,
  privateEstimatePublicationContextSchema,
  privateEstimatePublicationDetailSchema,
  privateEstimatePublicationHistorySchema,
  privateEstimatePublicationMutationSchema,
  privateEstimatePublicationPageSchema,
  privateEstimateProjectQuotesSchema,
  privateEstimatePublicationReceiptSchema,
  privateEstimatePublicationResultSchema,
  type PrivateEstimatePublicationMutation,
  type PrivateEstimatePublicationResult,
} from '@/lib/pro/private-estimate-publications';
import {proCustomerReader,proRequestOrigin} from '@/lib/pro/route-common';
import {sendTransactionalEmail,settleTransactionalEmail,transactionalAccount,transactionalEmailLocaleOf,transactionalPublicationOwner,type TransactionalEmailReport} from '@/lib/pro/transactional-email';
import {prefijoDeIdioma} from '@/lib/prefijo-de-idioma';
import {PRO_ENABLED} from '@/lib/pro/enabled';

const headers = {
  'Cache-Control': 'no-store, private',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
};
const uuid = z.string().uuid();
const local = () => PRO_ENABLED;
const fail = (status: number, code: string, error: string) => Response.json({code, error}, {status, headers});
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');

function databaseError(error: {code?: string}) {
  if (['40001', '23505'].includes(error.code ?? '')) return fail(409, 'conflict', 'Los datos cambiaron. Revise la versión antes de continuar.');
  if (error.code === '42501') return fail(403, 'forbidden', 'No tiene acceso a esta operación.');
  if (error.code === 'P0002') return fail(404, 'not_found', 'No disponible.');
  if (error.code === '54000') return fail(429, 'limit', 'Se alcanzó el límite de esta operación.');
  if (['22023', '22007', '22008', '22021', '23514', '22P02'].includes(error.code ?? '')) return fail(400, 'invalid_input', 'Revise los datos.');
  return fail(503, 'unavailable', 'No se pudo completar la operación.');
}

async function actor(req: Request, writing = false) {
  const user = await safeGetUser(await createClient());
  if (!user) return {error: fail(401, 'unauthenticated', 'Inicie sesión.')};
  const expected = req.headers.get('x-pro-expected-actor');
  if ((writing || expected !== null) && (!uuid.safeParse(expected).success || expected !== user.id)) {
    return {error: fail(403, 'forbidden', 'La cuenta cambió.')};
  }
  const db = createAdminClient();
  const profile = await db.from('profiles').select('is_disabled,role').eq('id', user.id).maybeSingle();
  if (profile.error) return {error: fail(503, 'unavailable', 'No se pudo comprobar el acceso.')};
  if (!profile.data || profile.data.is_disabled || profile.data.role === 'admin' && !await getApiAdmin()) {
    return {error: fail(403, 'forbidden', 'Sin acceso.')};
  }
  return {user, db};
}

const querySchema = z.discriminatedUnion('view', [
  z.object({view: z.literal('context'), estimateId: uuid}).strict(),
  z.object({view: z.literal('bindings'), estimateId: uuid, after: uuid.optional()}).strict(),
  z.object({view: z.literal('detail'), publicationId: uuid}).strict(),
  z.object({view: z.literal('history'), publicationId: uuid, after: uuid.optional()}).strict(),
  z.object({view: z.literal('list'), side: z.enum(['owner', 'client']), estimateId: uuid.optional(), after: uuid.optional()}).strict(),
  z.object({view: z.literal('action'), actionId: uuid}).strict(),
  // Round 7A: the customer's project page (the owner's «Customer view» preview reads it as that customer).
  z.object({view: z.literal('project'), requestId: uuid}).strict(),
]);

const ownerActions = new Set(['publish', 'withdraw', 'respond_changes', 'rotate_code']);
function safeScope(publication: {estimateId: string | null; recipientBound?: boolean}, side: 'owner' | 'client') {
  return side === 'client' ? publication.estimateId === null && publication.recipientBound !== false : publication.estimateId !== null;
}
function safeResultScope(result: PrivateEstimatePublicationResult) {
  return safeScope(result.publication, ownerActions.has(result.action) ? 'owner' : 'client');
}

export async function GET(req: Request) {
  if (!local()) return new Response(null, {status: 404, headers});
  try {
    const a = await actor(req);
    if (a.error) return a.error;
    const raw: Record<string, string> = {};
    for (const [key, value] of new URL(req.url).searchParams) {
      if (key in raw) return fail(400, 'invalid_input', 'Consulta inválida.');
      raw[key] = value;
    }
    const parsed = querySchema.safeParse(raw);
    if (!parsed.success) return fail(400, 'invalid_input', 'Consulta inválida.');
    const q = parsed.data;
    if (q.view === 'context') {
      const result = await a.db.rpc('pro_private_estimate_publication_context', {p_actor: a.user.id, p_estimate: q.estimateId});
      if (result.error) return databaseError(result.error);
      if (!result.data) return fail(404, 'not_found', 'No disponible.');
      const data = privateEstimatePublicationContextSchema.parse(result.data);
      if (data.estimateId !== q.estimateId) return fail(503, 'unavailable', 'No se pudo comprobar la cotización.');
      return Response.json(data, {headers});
    }
    if (q.view === 'project') {
      const reader = await proCustomerReader(a.db, a.user.id, q.requestId);
      const result = await a.db.rpc('pro_client_project_quotes_read', {p_actor: reader, p_request: q.requestId});
      if (result.error) return databaseError(result.error);
      return Response.json(privateEstimateProjectQuotesSchema.parse(result.data), {headers});
    }
    if (q.view === 'bindings') {
      const result = await a.db.rpc('pro_private_estimate_publication_bindings', {p_actor: a.user.id, p_estimate: q.estimateId, p_after: q.after ?? null});
      if (result.error) return databaseError(result.error);
      return Response.json(privateEstimatePublicationBindingsSchema.parse(result.data), {headers});
    }
    if (q.view === 'action') {
      const result = await a.db.rpc('pro_private_estimate_publication_action_read', {p_actor: a.user.id, p_action: q.actionId});
      if (result.error) return databaseError(result.error);
      const data = privateEstimatePublicationReceiptSchema.parse(result.data);
      if (data.receipt && !safeResultScope(data.receipt.result)) return fail(503, 'unavailable', 'No se pudo comprobar el recibo.');
      return Response.json(data, {headers});
    }
    if (q.view === 'list') {
      if (q.side === 'client' && q.estimateId) return fail(400, 'invalid_input', 'Consulta inválida.');
      const result = await a.db.rpc('pro_private_estimate_publication_list', {p_actor: a.user.id, p_side: q.side, p_after: q.after ?? null, p_estimate: q.estimateId ?? null});
      if (result.error) return databaseError(result.error);
      const data = privateEstimatePublicationPageSchema.parse(result.data);
      if (data.items.some(item => !safeScope(item, q.side) || q.estimateId && item.estimateId !== q.estimateId)) {
        return fail(503, 'unavailable', 'No se pudo comprobar la lista.');
      }
      return Response.json(data, {headers});
    }
    if (q.view === 'history') {
      const result = await a.db.rpc('pro_private_estimate_publication_history', {p_actor: a.user.id, p_publication: q.publicationId, p_after: q.after ?? null});
      if (result.error) return databaseError(result.error);
      return Response.json(privateEstimatePublicationHistorySchema.parse(result.data), {headers});
    }
    const result = await a.db.rpc('pro_private_estimate_publication_read', {p_actor: a.user.id, p_publication: q.publicationId});
    if (result.error) return databaseError(result.error);
    if (!result.data) return fail(404, 'not_found', 'No disponible.');
    const data = privateEstimatePublicationDetailSchema.parse(result.data);
    if (data.publication.publicationId !== q.publicationId || !safeScope(data.publication, data.side)
      || data.side === 'client' && data.recipient !== null) {
      return fail(503, 'unavailable', 'No se pudo comprobar el documento.');
    }
    return Response.json(data, {headers});
  } catch {
    return fail(503, 'unavailable', 'No se pudieron cargar las cotizaciones compartidas.');
  }
}

async function boundedBody(req: Request) {
  if (!req.headers.get('content-type')?.toLowerCase().startsWith('application/json')) throw Error('JSON required');
  const reader = req.body?.getReader();
  if (!reader) throw Error('Body required');
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > 32768) {await reader.cancel(); throw new RangeError('Body too large');}
      chunks.push(chunk.value);
    }
  } finally {reader.releaseLock();}
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {bytes.set(chunk, offset); offset += chunk.byteLength;}
  return JSON.parse(new TextDecoder('utf-8', {fatal: true}).decode(bytes));
}

function secretInput(input: PrivateEstimatePublicationMutation) {
  if (input.action === 'publish' && input.recipient.kind === 'claim') {
    const {code, ...recipient} = input.recipient;
    return {...input, recipient: {...recipient, codeHash: sha256(code)}};
  }
  if (input.action === 'claim' || input.action === 'rotate_code') {
    const {code, ...rest} = input;
    return {...rest, codeHash: sha256(code)};
  }
  return input;
}

function validResult(input: PrivateEstimatePublicationMutation, result: PrivateEstimatePublicationResult) {
  const publication = result.publication;
  if (result.action !== input.action) return false;
  if (!safeResultScope(result)) return false;
  if ('publicationId' in input && publication.publicationId !== input.publicationId) return false;
  if ('contentHash' in input && publication.contentHash !== input.contentHash) return false;
  if ('revision' in input && publication.revision !== input.revision + 1) return false;
  const status = input.action === 'publish'
    ? input.recipient.kind === 'claim' ? 'awaiting_claim' : 'shared'
    : ({claim: 'shared', rotate_code: 'awaiting_claim', accept: 'accepted', decline: 'declined', withdraw: 'withdrawn', request_changes: 'changes_requested', respond_changes: 'changes_requested'} as const)[input.action];
  if (publication.status !== status) return false;
  return input.action !== 'publish' || publication.estimateId === input.estimateId
    && publication.estimateRevision === input.estimateRevision && publication.revision === 1;
}

// Launch fix I5: e-mail after a successful share / accept / decline (mock outbox by default, Brevo sandbox only on
// an explicit flag). Never blocks or fails the action; the outcome travels in the X-Pro-Email header (no address,
// no code), so the strict result schema is unchanged. The access code never goes into the e-mail.
async function publicationEmail(req: Request, db: ReturnType<typeof createAdminClient>, actorId: string, input: PrivateEstimatePublicationMutation, data: PrivateEstimatePublicationResult): Promise<TransactionalEmailReport | null> {
  const locale = transactionalEmailLocaleOf(req), prefix = proRequestOrigin(req) + prefijoDeIdioma(locale);
  const content = data.publication.content;
  if (input.action === 'publish') {
    const to = input.recipient.kind === 'claim' ? input.recipient.email : (await transactionalAccount(db, input.recipient.recipientId))?.email;
    return sendTransactionalEmail({kind: 'quote_shared', eventId: input.actionId, to, locale, actorId, revealRecipient: input.recipient.kind === 'claim',
      data: {actorName: content.issuer.issuerName, subjectName: content.title, link: prefix + '/dashboard/cotizaciones'}});
  }
  if (input.action !== 'accept' && input.action !== 'decline') return null;
  const owner = await transactionalPublicationOwner(db, data.publication.publicationId);
  const account = owner ? await transactionalAccount(db, owner) : null;
  return sendTransactionalEmail({kind: input.action === 'accept' ? 'quote_accepted' : 'quote_declined', eventId: input.actionId, to: account?.email, locale, actorId, revealRecipient: false,
    data: {actorName: content.customer.name || (await transactionalAccount(db, actorId))?.name || '', subjectName: content.title, link: prefix + '/dashboard/profesional?tab=quotes'}});
}

export async function POST(req: Request) {
  if (!local()) return new Response(null, {status: 404, headers});
  if (req.headers.get('origin') !== `${new URL(req.url).protocol}//${req.headers.get('host') || new URL(req.url).host}`) {
    return fail(403, 'forbidden', 'Origen no autorizado.');
  }
  try {
    const a = await actor(req, true);
    if (a.error) return a.error;
    const limited = await enforceRateLimit(req, 'private-estimate-publications-' + a.user.id, 60, 60000);
    if (limited) return limited;
    let input: PrivateEstimatePublicationMutation;
    try {input = privateEstimatePublicationMutationSchema.parse(await boundedBody(req));}
    catch (error) {return fail(error instanceof RangeError ? 413 : 400, 'invalid_input', 'Revise los datos.');}
    const verifiedEmail = a.user.email_confirmed_at && a.user.email ? a.user.email.trim().toLowerCase() : null;
    const result = await a.db.rpc('pro_private_estimate_publication_mutate', {
      p_actor: a.user.id,
      p_input: secretInput(input),
      p_input_hash: sha256(canonicalPrivateEstimatePublicationInput(input)),
      p_verified_email: verifiedEmail,
    });
    if (result.error) return databaseError(result.error);
    const data = privateEstimatePublicationResultSchema.parse(result.data);
    if (!validResult(input, data)) return fail(503, 'unavailable', 'No se pudo comprobar el resultado.');
    if (!['publish', 'accept', 'decline'].includes(input.action)) return Response.json(data, {headers});
    const email = await settleTransactionalEmail(async () => await publicationEmail(req, a.db, a.user.id, input, data) ?? {mode: 'mock', status: 'no_recipient', to: null});
    return Response.json(data, {headers: {...headers, 'X-Pro-Email': email.mode + ':' + email.status}});
  } catch {
    return fail(503, 'unavailable', 'No se pudo comprobar el guardado. Consulte el resultado antes de reintentar.');
  }
}
