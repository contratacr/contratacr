import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const days = Number(req.nextUrl.searchParams.get("days") ?? 30);
  if (![0, 7, 30, 90].includes(days)) return NextResponse.json({ error: "Invalid period." }, { status: 400 });

  const supabase = await createClient();
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: "Sign in required." }, { status: 401 });

  // The RPC is authenticated as this user. It derives ownership from auth.uid(),
  // and never accepts a profile or publication id from the browser.
  const { data, error } = await supabase.rpc("get_account_activity", { p_days: days });
  if (error) {
    console.error("[dashboard/activity] Could not load account activity", error.message);
    return NextResponse.json({ error: "Could not load activity." }, { status: 503 });
  }
  return NextResponse.json(data, { headers: { "Cache-Control": "private, no-store" } });
}
