import { InlineIdentityName } from "@/components/ui/inline-identity-name";
import type { ReactNode } from "react";

export const profileIdentityAvatarClass = "h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]";

/** Same readable identity heading in the account panel and public profile. */
export function ProfileIdentityName({ name, badge, testId, className = "", title }: {
  name: string; badge?: ReactNode; testId?: string; className?: string; title?: string;
}) {
  return <h1 data-testid={testId} title={title}
    className={`min-w-0 pr-1 text-[17px] font-bold leading-[1.15] text-[#162543] [overflow-wrap:anywhere] sm:text-2xl sm:leading-tight sm:[overflow-wrap:normal] ${className}`}>
    <InlineIdentityName name={name} badge={badge} />
  </h1>;
}
