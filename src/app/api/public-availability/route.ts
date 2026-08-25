import { NextRequest, NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { crTodayISO } from "@/lib/time-cr";

function noStore(body: unknown, init?: ResponseInit) {
  const headers = new Headers(init?.headers);
  headers.set("Cache-Control", "no-store, max-age=0");
  return NextResponse.json(body, { ...init, headers });
}

// Up to 25 professionals in one call, for a screen of search cards: three
// grouped queries instead of three per card. Only the coming three weeks are
// returned (two weeks) — the card shows the next days, the profile fetches the full agenda.
async function batchedAvailability(ids: string[]) {
  const admin = createAdminClient();
  const today = crTodayISO();
  const horizon = new Date(`${today}T00:00:00Z`);
  horizon.setUTCDate(horizon.getUTCDate() + 14);
  const until = horizon.toISOString().slice(0, 10);
  const [{ data: pros }, takenRes, slotsRes] = await Promise.all([
    admin.from("professionals").select("id, availability_public").in("id", ids),
    admin
      .from("bookings")
      .select("professional_id, scheduled_date, scheduled_time")
      .in("professional_id", ids)
      .in("status", ["pending", "confirmed", "in_progress", "awaiting_confirmation"])
      .gte("scheduled_date", today)
      .lte("scheduled_date", until)
      .not("scheduled_time", "is", null),
    admin
      .from("availability_slots")
      .select("professional_id, slot_date, slot_time, location_id, category_id")
      .in("professional_id", ids)
      .gte("slot_date", today)
      .lte("slot_date", until)
      .order("slot_date")
      .order("slot_time")
      .limit(ids.length * 400),
  ]);
  const publicById = new Map((pros ?? []).map((row) => [row.id as string, row.availability_public !== false]));
  const taken = new Set((takenRes.data ?? []).map((b) => `${b.professional_id} ${b.scheduled_date} ${String(b.scheduled_time).slice(0, 5)}`));
  const byId: Record<string, { availabilityPublic: boolean; slots: { date: string; time: string; locationId: string | null; categoryId: string | null }[] }> = {};
  for (const id of ids) byId[id] = { availabilityPublic: publicById.get(id) ?? true, slots: [] };
  for (const row of (slotsRes.data ?? []) as Record<string, unknown>[]) {
    const id = row.professional_id as string;
    const entry = byId[id];
    if (!entry || !entry.availabilityPublic) continue;
    const time = String(row.slot_time).slice(0, 5);
    if (taken.has(`${id} ${row.slot_date} ${time}`)) continue;
    entry.slots.push({ date: row.slot_date as string, time, locationId: (row.location_id as string | null) ?? null, categoryId: (row.category_id as string | null) ?? null });
  }
  return byId;
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const batched = url.searchParams.get("professionalIds");
  if (batched) {
    const ids = [...new Set(batched.split(",").map((id) => id.trim()).filter((id) => /^[0-9a-f-]{36}$/i.test(id)))].slice(0, 25);
    if (ids.length === 0) return noStore({ error: "Missing professionalIds" }, { status: 400 });
    try {
      return noStore({ byId: await batchedAvailability(ids) });
    } catch (error) {
      return noStore({ error: error instanceof Error ? error.message : "availability failed" }, { status: 500 });
    }
  }
  const professionalId = url.searchParams.get("professionalId");
  if (!professionalId) return noStore({ error: "Missing professionalId" }, { status: 400 });

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
