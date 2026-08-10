import type { MouseEvent } from "react";

export function openInNewTabOnDesktop(event: MouseEvent<HTMLAnchorElement>) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  if (!window.matchMedia("(min-width: 1024px)").matches) return;

  event.preventDefault();
  window.open(event.currentTarget.href, "_blank", "noopener,noreferrer");
}
