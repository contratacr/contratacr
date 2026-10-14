import { expect, test } from "playwright/test";
import { shouldEmailVerificationDecision, canReceiveVerificationOutreach } from "../../src/lib/verification/email-policy";
import { isRetiredCampaign } from "../../src/lib/email/campaign-policy";
import { SUPPORT_CLOSE_REASONS, buildSupportCloseMessage } from "../../src/lib/support/close-reasons";

test("registration and pending reviews do not send decision emails", () => {
  for (const kind of ["verified", "pending", "rejected", "reverted"] as const) {
    expect(shouldEmailVerificationDecision(kind, "in_app")).toBe(false);
    expect(shouldEmailVerificationDecision(kind, "both")).toBe(kind !== "pending");
  }
});
test("verification outreach excludes verified and inconsistent accounts", () => {
  for (const status of ["verified", "pending", "under_appeal", "rejected", null]) {
    expect(canReceiveVerificationOutreach({verification_status: status, is_verified: true})).toBe(false);
    expect(canReceiveVerificationOutreach({verification_status: status, is_verified: false})).toBe(status === "pending" || status === "under_appeal");
  }
});
test("support offers one resolved option while preserving old answered requests", () => {
  expect(SUPPORT_CLOSE_REASONS.some(reason => String(reason.id) === "answered")).toBe(false);
  expect(buildSupportCloseMessage("answered")).toBe(buildSupportCloseMessage("solved"));
  expect(buildSupportCloseMessage("solved", "Detalle del caso")).toContain("Detalle del caso");
});

test("the old general services campaign stays retired", () => {
  expect(isRetiredCampaign("recordatorio", "todas")).toBe(true);
});
