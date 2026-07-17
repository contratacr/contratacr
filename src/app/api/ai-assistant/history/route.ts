import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const MAX_MESSAGES = 30;

function safeMessages(value: unknown) {
  if (!Array.isArray(value)) return [];
  return value.slice(-MAX_MESSAGES).filter((item) => {
    if (!item || typeof item !== "object") return false;
    const message = item as Record<string, unknown>;
    return (message.role === "assistant" || message.role === "user") && typeof message.body === "string";
  });
}

async function authenticatedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function GET() {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ conversations: [] });
  const { data, error } = await supabase
    .from("ai_chat_sessions")
    .select("id, title, messages, created_at, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(30);
  if (error) return NextResponse.json({ conversations: [], unavailable: true });
  return NextResponse.json({ conversations: data ?? [] });
}

export async function POST(request: Request) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json().catch(() => ({}));
  const id = typeof body.id === "string" && /^[0-9a-f-]{36}$/i.test(body.id) ? body.id : null;
  const title = typeof body.title === "string" ? body.title.trim().slice(0, 120) : "";
  const messages = safeMessages(body.messages);
  if (!id || messages.length === 0) return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  const { error } = await supabase.from("ai_chat_sessions").upsert({
    id,
    user_id: user.id,
    title: title || "Nueva conversación",
    messages,
    updated_at: new Date().toISOString(),
  }, { onConflict: "id" });
  if (error) return NextResponse.json({ error: "Could not save conversation" }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: Request) {
  const { supabase, user } = await authenticatedClient();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const id = new URL(request.url).searchParams.get("id");
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid conversation" }, { status: 400 });
  }
  const { error } = await supabase
    .from("ai_chat_sessions")
    .delete()
    .eq("id", id)
    .eq("user_id", user.id);
  if (error) return NextResponse.json({ error: "Could not delete conversation" }, { status: 500 });
  return NextResponse.json({ ok: true });
}
