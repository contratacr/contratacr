// Run: node --test scripts/directory/
// Header open status of a place (src/lib/directory/open-status.ts, 2026-11-19 Yelp-model page) and the amenities
// list (place-amenities.ts: only stored typed attributes become rows).
import test from "node:test";
import assert from "node:assert/strict";
const { openStatus, openStatusText, crClock } = await import("../../src/lib/directory/open-status.ts");
const { placeAmenities, placePriceLevel } = await import("../../src/lib/directory/place-amenities.ts");

// 2026-11-19 is a Thursday (weekday 4). Costa Rica = UTC-6.
const at = (hhmm, day = "2026-11-19") => new Date(`${day}T${hhmm}:00-06:00`);
const days = ["Domingo", "Lunes", "Martes", "Miércoles", "Jueves", "Viernes", "Sábado"];
const week = (opens, closes) => [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));

test("Costa Rica clock", () => {
  assert.deepEqual(crClock(at("07:30")), { weekday: 4, minute: 450 });
});

test("no hours: nothing is invented", () => {
  assert.equal(openStatus([], at("10:00")), null);
});

test("open now with closing time; closed before opening today", () => {
  const h = week("07:30", "19:30");
  assert.deepEqual(openStatus(h, at("10:00")), { state: "open", closes: "19:30" });
  assert.deepEqual(openStatus(h, at("06:00")), { state: "closed", opens: { time: "07:30", day: "today" } });
  assert.equal(openStatusText(openStatus(h, at("10:00")), false, days).detail, "cierra a las 19:30");
});

test("after closing: opens tomorrow; skips closed days with the weekday name", () => {
  assert.deepEqual(openStatus(week("07:30", "19:30"), at("20:00")), { state: "closed", opens: { time: "07:30", day: "tomorrow" } });
  const mondayOnly = [{ weekday: 1, opens: "08:00", closes: "17:00" }];
  const s = openStatus(mondayOnly, at("10:00"));
  assert.deepEqual(s, { state: "closed", opens: { time: "08:00", day: 1 } });
  assert.equal(openStatusText(s, false, days).detail, "abre el lunes a las 08:00");
  assert.equal(openStatusText(s, true, ["Sunday", "Monday"]).detail, "opens Monday at 08:00");
});

test("overnight slot (closes after midnight) is open in the small hours", () => {
  const bar = [{ weekday: 3, opens: "18:00", closes: "02:00" }];
  assert.deepEqual(openStatus(bar, at("01:00")), { state: "open", closes: "02:00" });
  assert.equal(openStatus(bar, at("03:00")).state, "closed");
});

test("24 hours every day", () => {
  assert.deepEqual(openStatus(week("00:00", "24:00"), at("03:00")), { state: "open24" });
  assert.equal(openStatusText({ state: "open24" }, false, days).label, "Abierto 24 horas");
});

test("amenities only from stored attributes", () => {
  assert.deepEqual(placeAmenities({}), []);
  const keys = placeAmenities({ delivery: true, takeaway: false, fuels: ["regular", "diesel", "x"], paymentMethods: ["sinpe"], kind: "bar" }).map((a) => a.key);
  assert.deepEqual(keys, ["delivery", "fuel:regular", "fuel:diesel", "pay:sinpe"]);
  assert.deepEqual(placeAmenities({}, { open24: true }).map((a) => a.key), ["open24h"]);
  assert.equal(placePriceLevel({ priceLevel: 2 }), "₡₡");
  assert.equal(placePriceLevel({ priceLevel: 9 }), null);
});
