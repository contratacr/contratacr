"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";

/** Remove legacy Apple promotion metadata; the website owns its localized notice.
 * Universal Links remain configured independently through the site association.
 */
export function SmartAppBanner() {
  const pathname = usePathname();
  useEffect(() => {
    document.querySelectorAll('meta[name="apple-itunes-app"]').forEach(meta => meta.remove());
  }, [pathname]);
  return null;
}
