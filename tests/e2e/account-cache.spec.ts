import { expect, test } from "playwright/test";
import { clearAccountLocalCache } from "../../src/lib/account-cache";

test("account cleanup removes only the deleted user's local data", () => {
  const store = new Map<string, string>();
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: {
        removeItem: (key: string) => store.delete(key),
      },
    },
  });
  for (const user of ["target", "sentinel"]) {
    for (const prefix of ["ccr:avatar:", "ccr:notifications:", "contratacr:follow-counts:", "contratacr_saved_pros_"]) {
      store.set(`${prefix}${user}`, user);
    }
  }
  clearAccountLocalCache("target");
  expect([...store.keys()].every((key) => key.endsWith("sentinel"))).toBe(true);
  delete (globalThis as { window?: unknown }).window;
});
