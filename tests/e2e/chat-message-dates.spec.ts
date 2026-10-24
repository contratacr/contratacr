import { test, expect } from "playwright/test";
import { groupMessageDays, messageDayLabel, messageTime } from "../../src/lib/direct-chat/message-dates";

for (const locale of ["es", "en"]) {
  test(`${locale}: calendar separators distinguish today, yesterday, older days and years`, () => {
    const now = new Date(2026, 0, 1, 0, 15);
    expect(messageDayLabel(new Date(2026, 0, 1, 0, 1).toISOString(), locale, now)).toBe(locale === "es" ? "Hoy" : "Today");
    expect(messageDayLabel(new Date(2025, 11, 31, 23, 59).toISOString(), locale, now)).toBe(locale === "es" ? "Ayer" : "Yesterday");
    expect(messageDayLabel(new Date(2025, 10, 15, 10).toISOString(), locale, now)).toContain("2025");
    expect(messageDayLabel(new Date(2026, 0, 1, 8).toISOString(), locale, new Date(2026, 5, 1))).not.toContain("2026");
    expect(messageTime(new Date(2025, 10, 15, 10, 23).toISOString(), locale)).toBe(new Intl.DateTimeFormat(locale, {hour:"numeric",minute:"2-digit"}).format(new Date(2025, 10, 15, 10, 23)));
  });
}

test("grouping crosses local midnight, preserves every message and never mutates the input", () => {
  const rows = [
    {id:"a",created_at:new Date(2026, 9, 23, 23, 58).toISOString()},
    {id:"b",created_at:new Date(2026, 9, 23, 23, 59).toISOString()},
    {id:"c",created_at:new Date(2026, 9, 24, 0, 1).toISOString()},
  ];
  const groups = groupMessageDays(rows);
  expect(groups.map(group => group.messages.map(row => row.id))).toEqual([["a","b"],["c"]]);
  expect(groups.flatMap(group => group.messages)).toEqual(rows);
  expect(groups[0].messages[0]).toBe(rows[0]);
  expect(groupMessageDays([])).toEqual([]);
});

test("malformed timestamps do not crash the conversation", () => {
  expect(messageTime("invalid","es")).toBe("");
  expect(messageDayLabel("invalid","es")).toBe("Fecha no disponible");
  expect(messageDayLabel("invalid","en")).toBe("Unknown date");
});
