import { regressionAdminClient } from "./seed";
import { createHmac } from "node:crypto";
import { expect, type Page } from "playwright/test";

// Test-only authenticator. Secrets exist only in this worker's memory and
// belong to disposable accounts in the isolated regression project.
const enrolled = new Map<string, { secret: string; tick: number }>();
export function totp(secret: string, time = Date.now()) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = "";
  for (const letter of secret.toUpperCase().replace(/=+$/, "")) {
    const value = alphabet.indexOf(letter);
    if (value < 0) throw new Error("Invalid test TOTP key");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = Buffer.from((bits.match(/.{8}/g) ?? []).map(byte => parseInt(byte, 2)));
  const counter = Buffer.alloc(8); counter.writeBigUInt64BE(BigInt(Math.floor(time / 30000)));
  const digest = createHmac("sha1", bytes).update(counter).digest();
  const offset = digest[digest.length - 1] & 15;
  return String((digest.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}
export async function completeAdminMfa(page: Page, email: string, administrator = true) {
  regressionAdminClient(); // Reuse the production-denial guard, including isolated local CI.
  if (!email.endsWith("@contratacr.test")) throw new Error("MFA test setup is restricted to disposable TEST accounts");
  // loginAs can already have completed this exact account's challenge. Never
  // infer permission from a missing screen: require live server AAL2 access.
  if (administrator) {
    const response = await page.request.get("/api/auth/admin-mfa", { maxRetries: 2 });
    expect(response.ok()).toBe(true);
    const stateOfSession = await response.json();
    expect(stateOfSession).toMatchObject({ authenticated: true, isAdmin: true });
    if (!stateOfSession.required) {
      expect(stateOfSession.enrolled).toBe(true);
      expect((await page.request.get("/api/admin/pending-counts")).status()).toBe(200);
      return;
    }
  }
  const gate = page.locator("[data-admin-mfa]");
  await expect(gate).toBeVisible();
  let state = enrolled.get(email);
  if (!state) {
    await gate.getByRole("button", { name: "Configurar autenticador" }).click();
    const key = gate.locator("[data-totp-secret]");
    await expect(key).toHaveCount(1);
    state = { secret: (await key.textContent())!.trim(), tick: -1 }; enrolled.set(email, state);
  }
  if (state.tick === Math.floor(Date.now() / 30000)) await page.waitForTimeout(30050 - Date.now() % 30000);
  await gate.getByRole("textbox", { name: "Código de verificación" }).fill(totp(state.secret));
  await gate.getByRole("button", { name: "Continuar", exact: true }).click();
  state.tick = Math.floor(Date.now() / 30000);
  await expect(gate).toHaveCount(0, { timeout: 20_000 });
}
