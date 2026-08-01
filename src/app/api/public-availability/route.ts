import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crTodayISO } from "@/lib/time-cr";

const LOCAL_DEMO_ENABLED = true;
const PETER_PARKER_DEMO_ID = "demo-peter-parker-photography";

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(body, { ...init, headers });
}

function createPeterParkerAvailability() {
  const slots: Array<{ date: string; time: string; locationId: string; categoryId: string }> = [];
  const today = new Date();
  const timeBlocks = ["08:00", "09:00", "10:00", "11:00", "13:00", "14:00", "15:00", "16:00"];
  for (let dayOffset = 1; dayOffset <= 28; dayOffset += 1) {
    const date = new Date(today.getFullYear(), today.getMonth(), today.getDate() + dayOffset);
    const weekday = date.getDay();
    if (weekday === 0) continue;
    const iso = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const locationId = weekday === 6 ? "demo-peter-outdoor" : "demo-peter-studio";
    for (const time of timeBlocks) {
      slots.push({ date: iso, time, locationId, categoryId: "fotografia" });
    }
  }
  return slots;
}

export async function GET(req: NextRequest) {
  const professionalId = new URL(req.url).searchParams.get("professionalId");
  if (!professionalId) return noStore({ error: "Missing professionalId" }, { status: 400 });

  if (LOCAL_DEMO_ENABLED && professionalId === PETER_PARKER_DEMO_ID) {
    const allSlots = createPeterParkerAvailability();
    return noStore({ availabilityPublic: true, slots: allSlots, allSlots, taken: [] });
  }

  const admin = createAdminClient();
  const today = crTodayISO();

  const [{ data: pro }, takenRes] = await Promise.all([
    admin.from("professionals").select("availability_public").eq("id", professionalId).maybeSingle(),
    admin
      .from("bookings")
      .select("scheduled_date, scheduled_time")
      .eq("professional_id", professionalId)
      .in("status", ["pending", "confirmed", "in_progress", "awaiting_confirmation"])
      .not("scheduled_date", "is", null)
      .not("scheduled_time", "is", null),
  ]);

  const availabilityPublic = pro?.availability_public !== false;
  const taken = new Set(
    (takenRes.data ?? []).map((b) => `${b.scheduled_date} ${String(b.scheduled_time).slice(0, 5)}`)
  );

  type SlotRowsResult = { data: Record<string, unknown>[] | null; error: { message: string } | null };

  let rows = await admin
    .from("availability_slots")
    .select("slot_date, slot_time, location_id, category_id")
    .eq("professional_id", professionalId)
    .gte("slot_date", today)
    .order("slot_date")
    .order("slot_time")
    .limit(500) as SlotRowsResult;

  if (rows.error && /location_id|category_id|column|schema cache|PGRST204/i.test(rows.error.message)) {
    rows = await admin
      .from("availability_slots")
      .select("slot_date, slot_time")
      .eq("professional_id", professionalId)
      .gte("slot_date", today)
      .order("slot_date")
      .order("slot_time")
      .limit(500) as SlotRowsResult;
  }

  if (rows.error) return noStore({ error: rows.error.message, slots: [], taken: [...taken] }, { status: 500 });

  const allSlots = availabilityPublic
    ? (rows.data ?? []).map((r) => ({
        date: r.slot_date as string,
        time: String(r.slot_time).slice(0, 5),
        locationId: (r as { location_id?: string | null }).location_id ?? null,
        categoryId: (r as { category_id?: string | null }).category_id ?? null,
      }))
    : [];
  const slots = allSlots.filter((slot) => !taken.has(`${slot.date} ${slot.time}`));

  return noStore({ availabilityPublic, slots, allSlots, taken: [...taken] });
}
