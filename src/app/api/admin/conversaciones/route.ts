import { NextResponse } from "next/server";
import { z } from "zod";
import { getApiAdmin } from "@/lib/auth/admin";
import { createClient } from "@/lib/supabase/server";
import { enforceRateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "Pragma": "no-cache" };
const querySchema = z.object({
  offset: z.coerce.number().int().min(0).max(100000).default(0),
  side: z.enum(["all", "professional", "client"]).default("all"),
  hours: z.coerce.number().refine(n => [0,24,48].includes(n)).default(0),
});

export async function GET(request: Request) {
  if (!(await getApiAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  const params=new URL(request.url).searchParams;
  if(params.get("history")==="1") {
    const id=z.string().uuid().safeParse(params.get("conversation"));
    if(!id.success)return NextResponse.json({error:"Conversación inválida"},{status:400,headers});
    const {data,error}=await (await createClient()).rpc("admin_chat_access_history",{p_conversation:id.data});
    return error?NextResponse.json({error:"No se pudo consultar el registro."},{status:403,headers}):NextResponse.json({rows:data},{headers});
  }
  if(params.has("conversation")) {
    const ids=z.object({conversation:z.string().uuid(),report:z.string().uuid()}).safeParse(Object.fromEntries(params));
    if(!ids.success)return NextResponse.json({error:"Caso inválido"},{status:400,headers});
    const {data,error}=await (await createClient()).rpc("admin_chat_case_metadata",{p_conversation:ids.data.conversation,p_report:ids.data.report});
    return error?NextResponse.json({error:"Caso no disponible"},{status:403,headers}):NextResponse.json(data,{headers});
  }
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Filtros inválidos" }, { status: 400, headers });
  const db = await createClient();
  const { data, error } = await db.rpc("admin_chat_waiting", {
    p_offset: parsed.data.offset, p_side: parsed.data.side, p_hours: parsed.data.hours,
  });
  if (error) return NextResponse.json({ error: "No se pudo cargar el seguimiento de conversaciones." }, { status: 503, headers });
  return NextResponse.json(data, { headers });
}

const reviewSchema = z.object({
  conversation: z.string().uuid(), ticket: z.string().uuid().nullable(), report:z.string().uuid().nullable().default(null), reason: z.string().trim().min(15).max(500),
  offset: z.number().int().min(0).max(100000).default(0),
}).strict().refine(p=>!!p.ticket !== !!p.report);

export async function POST(request: Request) {
  if (!(await getApiAdmin())) return NextResponse.json({ error: "No autorizado" }, { status: 403, headers });
  const limited = enforceRateLimit(request, "admin-chat-review", 20, 60_000);
  if (limited) return limited;
  // A review is a logged action; reject cross-origin requests even with cookies.
  if (request.headers.get("origin") !== new URL(request.url).origin) {
    return NextResponse.json({ error: "Origen no autorizado" }, { status: 403, headers });
  }
  const parsed = reviewSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Indica un caso y un motivo de al menos 15 caracteres." }, { status: 400, headers });
  const db = await createClient();
  const { data, error } = await db.rpc("admin_chat_review", {
    p_conversation: parsed.data.conversation, p_ticket: parsed.data.ticket,
    p_reason: parsed.data.reason, p_offset: parsed.data.offset,
    p_report:parsed.data.report,
  });
  if (error) return NextResponse.json({ error: "No se abrió el contenido. Requiere permiso de revisión, un caso abierto de un participante y auditoría disponible." }, { status: 403, headers });
  return NextResponse.json(data, { headers });
}
