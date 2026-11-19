"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";

export type NotificationReadOperation = ({
  /** null marks the whole account, including notifications outside the loaded page. */
  ids: null;
  /** Only the rows known before this request can be confirmed locally. */
  snapshotIds: string[];
} | { ids: string[] }) & { keepNew?: boolean };

/** A read marker is confirmed by the server before any cache or badge changes. */
export function useNotificationRead(
  userId: string | undefined,
  onSuccess: (operation: NotificationReadOperation) => void,
) {
  const current = useRef({ userId, onSuccess });
  useLayoutEffect(() => { current.current = { userId, onSuccess }; }, [userId, onSuccess]);
  const pending = useRef(new Set<string>());
  const [failure, setFailure] = useState<{ userId: string; operation: NotificationReadOperation; key: string } | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  async function markRead(operation: NotificationReadOperation) {
    const actor = userId;
    if (!actor || (operation.ids !== null && operation.ids.length === 0)) return;
    const key = JSON.stringify([actor, operation.ids === null ? null : [...operation.ids].sort()]);
    if (pending.current.has(key)) return;
    pending.current.add(key);
    setRetrying(key);
    try {
      const query = createClient().from("notifications").update({ read: true }).eq("user_id", actor);
      const { error } = await (operation.ids === null ? query.eq("read", false) : query.in("id", operation.ids));
      if (error) throw error;
      if (current.current.userId !== actor) return;
      current.current.onSuccess(operation);
      setFailure((previous) => {
        if (previous?.userId !== actor) return previous;
        // A successful whole-account write also resolves a failed single read.
        // A single read cannot prove that a failed whole-account write succeeded.
        const covered = operation.ids === null || (previous.operation.ids !== null && previous.operation.ids.every((id) => operation.ids!.includes(id)));
        return covered ? null : previous;
      });
    } catch {
      if (current.current.userId === actor) setFailure({ userId: actor, operation, key });
    } finally {
      pending.current.delete(key);
      if (current.current.userId === actor) setRetrying((previous) => previous === key ? null : previous);
    }
  }

  const visibleFailure = failure?.userId === userId ? failure : null;
  return {
    markRead,
    readError: visibleFailure !== null,
    retrying: visibleFailure !== null && retrying === visibleFailure.key,
    retryRead: () => { if (visibleFailure) void markRead(visibleFailure.operation); },
  };
}
