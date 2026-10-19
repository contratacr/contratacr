import type { ReactNode } from "react";

export const profileIdentityAvatarClass = "h-[72px] w-[72px] sm:h-[88px] sm:w-[88px]";

/** Same readable identity heading in the account panel and public profile. */
export function ProfileIdentityName({ name, badge, testId, className = "", title }: {
  name: string; badge?: ReactNode; testId?: string; className?: string; title?: string;
}) {
  const split = name.lastIndexOf(" ");
  const tail = name.slice(split + 1);
  const keepTail = tail.length <= 24;
  return <h1 data-testid={testId} title={title}
    className={`min-w-0 text-[17px] font-bold leading-[1.15] text-[#162543] [overflow-wrap:anywhere] sm:text-2xl sm:leading-tight sm:[overflow-wrap:normal] ${className}`}>
    <span data-profile-name-start>{keepTail ? name.slice(0, split + 1) : name}</span>
    <span data-profile-name-tail className={keepTail ? "whitespace-nowrap" : undefined}>
      <span data-profile-name-last-word>{keepTail ? tail : null}</span>
      {badge && <span className="ml-1 inline-block align-middle">{badge}</span>}
    </span>
  </h1>;
}
