"use client";

// One request for a whole screen of cards. Every card that mounts in the same
// tick asks for its professional's agenda here; the ids are gathered for a few
// milliseconds and fetched together, so twenty cards cost one round trip
// instead of twenty. Each caller still gets exactly its own answer.

export type BatchedAvailability = { availabilityPublic: boolean; slots: { date: string; time: string; locationId: string | null; categoryId: string | null }[] };

type Waiter = { resolve: (value: BatchedAvailability | null) => void };
const MAX_PER_REQUEST = 25;
const GATHER_MS = 90;
let pending = new Map<string, Waiter[]>();
let timer: number | null = null;

async function flush() {
  timer = null;
  const batch = pending;
  pending = new Map();
  const ids = [...batch.keys()];
  for (let start = 0; start < ids.length; start += MAX_PER_REQUEST) {
    const chunk = ids.slice(start, start + MAX_PER_REQUEST);
    let byId: Record<string, BatchedAvailability> = {};
    try {
      const response = await fetch(`/api/public-availability?professionalIds=${chunk.join(",")}`, { cache: "no-store" });
      if (response.ok) {
        const json = (await response.json()) as { byId?: Record<string, BatchedAvailability> };
        byId = json.byId ?? {};
      }
    } catch {
      // Every waiter below resolves with null and the card falls back to its server data.
    }
    for (const id of chunk) {
      const answer = byId[id] ?? null;
      for (const waiter of batch.get(id) ?? []) waiter.resolve(answer);
    }
  }
}

export function fetchAvailabilityBatched(professionalId: string): Promise<BatchedAvailability | null> {
  return new Promise((resolve) => {
    const waiters = pending.get(professionalId) ?? [];
    waiters.push({ resolve });
    pending.set(professionalId, waiters);
    if (timer === null) timer = window.setTimeout(() => void flush(), GATHER_MS);
  });
}
