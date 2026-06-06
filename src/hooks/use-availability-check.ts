"use client";

import { useEffect, useState } from "react";

// Debounced, real-time existence check for the email / cédula fields.
// Returns `taken` (already registered) as soon as the user finishes typing.
export function useAvailabilityCheck(
  value: string,
  field: "email" | "cedula",
  enabled = true
) {
  const [taken, setTaken] = useState(false);
  const [checking, setChecking] = useState(false);

  useEffect(() => {
    if (!enabled) { setTaken(false); return; }
    const v = (value ?? "").trim();
    if (field === "email" && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(v)) { setTaken(false); return; }
    if (field === "cedula" && v.replace(/\D/g, "").length < 9) { setTaken(false); return; }

    setChecking(true);
    const id = setTimeout(async () => {
      try {
        const res = await fetch(`/api/check-availability?${field}=${encodeURIComponent(v)}`);
        const data = await res.json();
        setTaken(field === "email" ? !!data.emailTaken : !!data.cedulaTaken);
      } catch {
        setTaken(false);
      } finally {
        setChecking(false);
      }
    }, 450);
    return () => clearTimeout(id);
  }, [value, field, enabled]);

  return { taken, checking };
}
