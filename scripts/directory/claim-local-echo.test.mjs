// Run: node --test scripts/directory/claim-local-echo.test.mjs
// Launch guard: a production build never echoes the SMS mock code nor the test-mailbox link of a claim.
import test from "node:test";
import assert from "node:assert/strict";
const { claimLocalEcho } = await import("../../src/lib/directory/claim-local-echo.ts");
const base = { claimId: "00000000-0000-4000-8000-000000000001", code: "123456" };
test("production never echoes devCode or testMailbox (every channel and mode)", () => {
  for (const channel of ["sms", "email"]) for (const emailMode of ["mock", "sandbox"])
    assert.deepEqual(claimLocalEcho({ ...base, nodeEnv: "production", channel, emailMode }), {});
});
test("development keeps the local helpers", () => {
  assert.deepEqual(claimLocalEcho({ ...base, nodeEnv: "development", channel: "sms", emailMode: "mock" }), { devCode: "123456" });
  assert.deepEqual(claimLocalEcho({ ...base, nodeEnv: "development", channel: "email", emailMode: "mock" }), { testMailbox: `/api/reclamos/${base.claimId}/buzon-prueba` });
  assert.deepEqual(claimLocalEcho({ ...base, nodeEnv: "development", channel: "email", emailMode: "sandbox" }), {});
});
