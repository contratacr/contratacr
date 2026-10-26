"use client";

import { useEffect, useState } from "react";

/** Network failures must offer recovery without revealing the wrong screen. */
export function AppLinkCover() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    let timer = 0;
    const update = () => {
      window.clearTimeout(timer);
      const pending = (window as unknown as { __ccrAppLinkPending?: string }).__ccrAppLinkPending;
      setSlow(false);
      if (pending) timer = window.setTimeout(() => setSlow(true), 15_000);
    };
    update();
    window.addEventListener("ccr-app-link-pending", update);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("ccr-app-link-pending", update);
    };
  }, []);
  return <div id="ccr-app-link-cover" role="status" aria-label="ContrataCR">
    <span aria-hidden="true" />
    {slow && <button type="button" onClick={() => {
      const path = (window as unknown as { __ccrAppLinkPending?: string }).__ccrAppLinkPending;
      if (path?.startsWith("/") && !path.startsWith("//")) window.location.assign(path);
      else window.location.reload();
    }} className="mt-5 rounded-full border border-[#b9d9e8] px-5 py-2 text-sm font-bold text-[#007fae]">
      {typeof document !== "undefined" && document.documentElement.lang === "en" ? "Taking longer than expected. Try again" : "Está tardando más de lo esperado. Reintentar"}
    </button>}
  </div>;
}
