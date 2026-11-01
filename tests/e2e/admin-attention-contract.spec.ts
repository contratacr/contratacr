import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { expect, test } from "playwright/test";

test("@contract admin attention and self-profile measurement isolation", async () => {
  const { stdout } = await promisify(execFile)(process.execPath, ["scripts/verify-admin-attention-self-interactions.mjs"], {
    cwd: process.cwd(), timeout: 25_000,
  });
  expect(stdout).toContain("PASS: all admin queues");
});
