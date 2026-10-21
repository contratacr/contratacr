import type { ReactNode } from "react";
import { Link } from "@/i18n/navigation";

/** The final word and seal form one unbreakable inline unit. */
export function InlineIdentityName({ name, badge, href, onNameClick, className = "" }: {
  name: string; badge?: ReactNode; href?: string; onNameClick?: () => void; className?: string;
}) {
  const clean = name.trim();
  const split = clean.lastIndexOf(" ");
  const finalWord = Array.from(clean.slice(split + 1));
  // Very long unspaced commercial names can wrap too; keep their final
  // characters attached to the seal without creating horizontal overflow.
  const tail = (finalWord.length > 12 ? finalWord.slice(-8) : finalWord).join("");
  const prefix = clean.slice(0, clean.length - tail.length);
  // Both text portions open the same profile, but expose one keyboard and
  // screen-reader link with the complete name. The seal is a separate action.
  const text = (value: string, secondary = false) => href
    ? <Link href={href} aria-label={secondary ? undefined : clean} aria-hidden={secondary || undefined} tabIndex={secondary ? -1 : undefined} className="inline hover:text-[#009FD9] hover:underline">{value}</Link>
    : onNameClick ? <button type="button" onClick={onNameClick} aria-label={secondary ? undefined : clean} aria-hidden={secondary || undefined} tabIndex={secondary ? -1 : undefined} className="inline !min-h-0 text-left font-[inherit] hover:text-[#009FD9]">{value}</button>
      : value;
  return <span data-inline-identity-name className={`min-w-0 whitespace-normal [overflow-wrap:anywhere] ${className}`}>
    <span data-identity-name-text><span data-profile-name-start>{prefix && text(prefix)}</span><span data-identity-name-tail data-profile-name-tail className="whitespace-nowrap [overflow-wrap:normal]"><span data-profile-name-last-word>{text(tail, Boolean(prefix))}</span>{badge && <span data-identity-name-badge className="ml-0.5 inline-block align-[calc(0.35em_-_8px)] leading-none [&_[data-verification-badge]]:h-4 [&_[data-verification-badge]]:w-4 [&_[data-verification-badge]]:before:absolute [&_[data-verification-badge]]:before:-inset-1">{badge}</span>}</span></span>
  </span>;
}
