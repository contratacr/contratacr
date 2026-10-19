"use client";

import { VerificationInfo } from "@/components/ui/verification-info";
import { InlineIdentityName } from "@/components/ui/inline-identity-name";

/** Names wrap without truncation; the seal follows the final word. */
export function ResponsiveVerifiedName({
  name,
  verified,
  href,
}: {
  name: string;
  verified: boolean;
  verifiedLabel: string;
  href?: string;
  /** Official identification names must remain fully readable. */
  wrap?: boolean;
}) {
  return <InlineIdentityName name={name} href={href} badge={verified ? <VerificationInfo /> : null} />;
}
