"use client";

import { useCallback, useEffect, useState } from "react";

/**
 * Resend-with-cooldown helper for "revisa tu correo" screens (email-change
 * confirmation, password-reset). Gives a live countdown so "Reenviar correo" is
 * disabled for a brief wait after each send (prevents spamming + aligns with
 * Supabase's per-email rate limit), plus a `resent` flag for the confirmation.
 *
 * Usage: call `armCooldown()` right after the INITIAL send, and `resend(fn)` for
 * subsequent ones (it runs the async send, re-arms the cooldown, and flips `resent`).
 */
export function useResendCooldown(seconds = 30) {
  const [cooldown, setCooldown] = useState(0);
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);

  // Tick the countdown down to 0, one second at a time.
  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => Math.max(0, c - 1)), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  const armCooldown = useCallback(() => setCooldown(seconds), [seconds]);

  const resend = useCallback(
    async (send: () => Promise<void>) => {
      if (cooldown > 0 || resending) return;
      setResending(true);
      try {
        await send();
        setResent(true);
        setCooldown(seconds);
      } finally {
        setResending(false);
      }
    },
    [cooldown, resending, seconds]
  );

  return { cooldown, resending, resent, armCooldown, resend };
}
