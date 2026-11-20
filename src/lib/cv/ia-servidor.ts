import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { safeGetUser } from "@/lib/supabase/get-user";
import { createAdminClient } from "@/lib/supabase/admin";
import type { CvDocumento } from "./documento";
import {
  LIMITE_DIARIO, MAX_OFERTA, MODELO_IA_CV, cvParaIa, leerJson, promptAdaptar, promptCarta, promptMejorar,
  validarAdaptacion, validarCarta, validarMejora, type AccionIa,
} from "./ia";

/**
 * EL SERVIDOR DE LA IA DEL CV (20-nov-2026): /api/cv/ai/{adaptar,mejorar,carta}.
 *  1. Sesión obligatoria.
 *  2. Límite por cuenta y por día (LIMITE_DIARIO), en el mismo contador de
 *     Postgres que el resto de los límites (lib/rate-limit): no se pierde
 *     entre instancias del Worker.
 *  3. Cuerpo acotado (64 KB) y validado; al modelo va solo `cvParaIa`.
 *  4. Workers AI con salida JSON; si no viene el JSON pedido, se le pide una
 *     vez que lo corrija. Lo que vuelve pasa por los validadores de lib/cv/ia
 *     (los que descartan lo inventado).
 *  5. Se registra acción, modelo, tiempo, tokens y neuronas; nunca el texto.
 * Sin el binding (next dev, pruebas) responde 503 «no_disponible» y el editor
 * sigue funcionando a mano.
 */

type Mensaje = { role: "system" | "user" | "assistant"; content: string };
type WorkersAi = { run(model: string, input: Record<string, unknown>): Promise<unknown> };
type Uso = { prompt_tokens?: number; completion_tokens?: number; neurons?: number };

const DIA = 86_400_000;
const sinCache = { "Cache-Control": "no-store, private" };
const fallo = (status: number, error: string, extra: Record<string, unknown> = {}) => Response.json({ error, ...extra }, { status, headers: sinCache });

/**
 * Límite por cuenta y por día en el contador compartido de Postgres
 * (public.app_rate_limit_take, migración 269): en Cloudflare cada instancia
 * tiene su propia memoria, así que un contador en memoria no limitaría nada.
 * A la base solo llega un HMAC de la clave, nunca el id de la cuenta. Si el
 * contador no responde, falla cerrado: la IA no corre sin límite.
 */
async function tomarDelLimite(clave: string, limite: number, ventanaMs: number): Promise<Response | null> {
  try {
    const secreto = process.env.RATE_LIMIT_PEPPER || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
    if (secreto.length < 32) throw new Error("secret");
    const llave = await crypto.subtle.importKey("raw", new TextEncoder().encode(secreto), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const firma = await crypto.subtle.sign("HMAC", llave, new TextEncoder().encode(`ccr-rate-limit:v1:key:${clave}`));
    const hash = Array.from(new Uint8Array(firma), (b) => b.toString(16).padStart(2, "0")).join("");
    const { data, error } = await createAdminClient()
      .rpc("app_rate_limit_take", { p_key: hash, p_limit: Math.trunc(limite), p_window_ms: Math.trunc(ventanaMs) })
      .abortSignal(AbortSignal.timeout(4000));
    const veredicto = data as { allowed?: unknown; retryAfter?: unknown } | null;
    if (error || !veredicto || typeof veredicto.allowed !== "boolean") throw new Error("reply");
    if (veredicto.allowed) return null;
    return Response.json({ error: "limite_diario" }, { status: 429, headers: { ...sinCache, "Retry-After": String(Math.max(1, Number(veredicto.retryAfter) || 60)) } });
  } catch (e) {
    console.error("[cv-ai] limiter unavailable:", e instanceof Error ? e.message : "unknown");
    return Response.json({ error: "no_disponible" }, { status: 503, headers: { ...sinCache, "Retry-After": "5" } });
  }
}

/** JSON del cuerpo con tope de bytes (se corta la lectura, no solo se mide al final). */
async function jsonAcotado(req: Request, maxBytes: number): Promise<unknown> {
  if (!req.headers.get("content-type")?.toLowerCase().startsWith("application/json") || !req.body) throw new Error("body");
  const declarado = Number(req.headers.get("content-length") ?? "0");
  if (declarado > maxBytes) throw new Error("big");
  const lector = req.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) { await lector.cancel(); throw new Error("big"); }
    trozos.push(value);
  }
  const todo = new Uint8Array(total);
  let pos = 0;
  for (const t of trozos) { todo.set(t, pos); pos += t.byteLength; }
  return JSON.parse(new TextDecoder().decode(todo));
}

const Entrada = z.object({ title: z.string().max(200), organization: z.string().max(200), period: z.string().max(80), description: z.string().max(3000), location: z.string().max(120).optional(), hidden: z.boolean().optional() });
const CvEntrada = z.object({
  idioma: z.enum(["es", "en"]),
  titular: z.string().max(200),
  resumen: z.string().max(2000),
  experiencia: z.array(Entrada).max(20),
  educacion: z.array(Entrada).max(20),
  proyectos: z.array(Entrada).max(20).optional(),
  voluntariado: z.array(Entrada).max(20).optional(),
  habilidades: z.array(z.string().max(80)).max(30),
  sugeridas: z.array(z.string().max(80)).max(60),
  certificaciones: z.array(z.string().max(200)).max(20),
  idiomas: z.array(z.string().max(80)).max(10),
}).passthrough();
const Oferta = z.string().trim().min(80).max(MAX_OFERTA);
const CUERPOS = {
  adaptar: z.object({ cv: CvEntrada, oferta: Oferta }),
  mejorar: z.object({ texto: z.string().trim().min(15).max(3000), tipo: z.enum(["resumen", "logros"]), idioma: z.enum(["es", "en"]), contexto: z.string().max(400).default("") }),
  carta: z.object({ cv: CvEntrada, oferta: Oferta, puesto: z.string().max(160).default(""), empresa: z.string().max(160).default(""), destinatario: z.string().max(160).default("") }),
} as const;

async function binding(): Promise<WorkersAi | null> {
  try {
    const { getCloudflareContext } = await import("@opennextjs/cloudflare");
    // La variante síncrona, como el asistente: fuera del Worker lanza y se
    // responde «no disponible» en vez de levantar un proxy local de wrangler.
    return (getCloudflareContext().env as { AI?: WorkersAi }).AI ?? null;
  } catch {
    return null;
  }
}

async function correr(ai: WorkersAi, mensajes: Mensaje[], maxTokens: number): Promise<{ contenido: string | null; uso: Uso }> {
  const resultado = await Promise.race([
    ai.run(MODELO_IA_CV, { messages: mensajes, max_tokens: maxTokens, temperature: 0.3, response_format: { type: "json_object" } }),
    new Promise<null>((ok) => setTimeout(() => ok(null), 55_000)),
  ]);
  const r = (resultado ?? {}) as { choices?: { message?: { content?: unknown } }[]; response?: unknown; usage?: Uso };
  const crudo = r.choices?.[0]?.message?.content ?? r.response ?? null;
  return { contenido: typeof crudo === "string" ? crudo : crudo ? JSON.stringify(crudo) : null, uso: r.usage ?? {} };
}

/** Corre el modelo y valida; si la forma no sirve, pide una corrección (una sola vez). */
async function conCorreccion<T>(ai: WorkersAi, p: { system: string; user: string }, maxTokens: number, validar: (j: unknown) => T | null) {
  const mensajes: Mensaje[] = [{ role: "system", content: p.system }, { role: "user", content: p.user }];
  const usos: Uso[] = [];
  let { contenido, uso } = await correr(ai, mensajes, maxTokens);
  usos.push(uso);
  let valido = validar(leerJson(contenido));
  if (!valido) {
    mensajes.push({ role: "assistant", content: contenido ?? "" }, { role: "user", content: "Tu respuesta no tenía la forma pedida. Devuelve SOLO el JSON con exactamente los campos indicados, con las mismas reglas." });
    ({ contenido, uso } = await correr(ai, mensajes, maxTokens));
    usos.push(uso);
    valido = validar(leerJson(contenido));
  }
  const total = usos.reduce((a, u) => ({ prompt_tokens: (a.prompt_tokens ?? 0) + (u.prompt_tokens ?? 0), completion_tokens: (a.completion_tokens ?? 0) + (u.completion_tokens ?? 0), neurons: (a.neurons ?? 0) + (u.neurons ?? 0) }), {} as Uso);
  return { valido, uso: total, intentos: usos.length };
}

export async function manejarIaCv(req: Request, accion: AccionIa): Promise<Response> {
  const user = await safeGetUser(await createClient());
  if (!user) return fallo(401, "sesion");

  let crudo: unknown;
  try { crudo = await jsonAcotado(req, 64_000); } catch { return fallo(400, "invalido"); }
  const cuerpo = CUERPOS[accion].safeParse(crudo);
  if (!cuerpo.success) return fallo(400, "invalido");

  const ai = await binding();
  if (!ai) return fallo(503, "no_disponible");

  // Se cuenta antes de llamar al modelo: un intento fallido también gasta.
  const limitado = await tomarDelLimite(`cv-ai:${accion}:${user.id}`, LIMITE_DIARIO[accion], DIA);
  if (limitado) {
    return limitado.status === 429
      ? fallo(429, "limite", { limite: LIMITE_DIARIO[accion], retryAfter: Number(limitado.headers.get("Retry-After")) || 3600 })
      : fallo(503, "no_disponible");
  }

  const inicio = Date.now();
  let datos: Record<string, unknown> | null = null;
  let uso: Uso = {};
  let intentos = 0;
  let descartadas = 0;
  try {
    if (accion === "adaptar") {
      const { cv, oferta } = cuerpo.data as z.infer<typeof CUERPOS.adaptar>;
      const f = cvParaIa(cv as unknown as CvDocumento);
      const r = await conCorreccion(ai, promptAdaptar(f, oferta), 4000, (j) => validarAdaptacion(j, f));
      ({ uso, intentos } = r);
      if (r.valido) { datos = r.valido; descartadas = r.valido.descartadas; }
    } else if (accion === "mejorar") {
      const { texto, tipo, idioma, contexto } = cuerpo.data as z.infer<typeof CUERPOS.mejorar>;
      const r = await conCorreccion(ai, promptMejorar(texto, tipo, idioma, contexto), 2000, (j) => validarMejora(j, texto, contexto, tipo, idioma));
      ({ uso, intentos } = r);
      if (r.valido) { datos = r.valido; descartadas = r.valido.descartadas; }
    } else {
      const { cv, oferta, puesto, empresa, destinatario } = cuerpo.data as z.infer<typeof CUERPOS.carta>;
      const f = cvParaIa(cv as unknown as CvDocumento);
      const d = { puesto, empresa, destinatario };
      const r = await conCorreccion(ai, promptCarta(f, oferta, d), 3000, (j) => validarCarta(j, f, oferta, d));
      ({ uso, intentos } = r);
      if (r.valido) { datos = r.valido; descartadas = r.valido.descartadas; }
    }
  } catch (error) {
    console.warn("[cv-ia] modelo no disponible", accion, error instanceof Error ? error.message.split("\n")[0] : "desconocido");
    return fallo(503, "no_disponible");
  } finally {
    // Sin texto ni identidad: solo lo que hace falta para costo y calidad.
    console.log(JSON.stringify({ evento: "cv-ia", accion, modelo: MODELO_IA_CV, ms: Date.now() - inicio, intentos, ok: !!datos, descartadas, prompt_tokens: uso.prompt_tokens ?? 0, completion_tokens: uso.completion_tokens ?? 0, neuronas: Math.round((uso.neurons ?? 0) * 10) / 10 }));
  }
  if (!datos) return fallo(502, "respuesta");
  return Response.json(datos, { headers: sinCache });
}
