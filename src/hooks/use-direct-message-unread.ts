"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@/hooks/use-auth";
import { createClient } from "@/lib/supabase/client";

type ConversationUnread = {
  client_id?: string;
  client_unread_count?: number;
  professional_unread_count?: number;
};

export function useDirectMessageUnread(enabled = true) {
  const { user } = useAuth();
  const [unread, setUnread] = useState(0);

  const refresh = useCallback(async () => {
    if (!enabled || !user) {
      setUnread(0);
      return;
    }
    const response = await fetch("/api/direct-chat", { cache: "no-store" }).catch(() => null);
    if (!response?.ok) return;
    const payload = await response.json().catch(() => ({ conversations: [] }));
    const total = (payload.conversations ?? []).reduce((sum: number, conversation: ConversationUnread) => (
      sum + (conversation.client_id === user.id
        ? Number(conversation.client_unread_count ?? 0)
        : Number(conversation.professional_unread_count ?? 0))
    ), 0);
    setUnread(Math.max(0, total));
  }, [enabled, user]);

  useEffect(() => {
    if (!enabled || !user) {
      queueMicrotask(() => setUnread(0));
      return;
    }

    let stopped = false;
    const supabase = createClient();
    const reload = () => {
      if (!stopped) void refresh();
    };
    reload();
    window.addEventListener("notificationsChanged", reload);
    window.addEventListener("directMessagesChanged", reload);
    const channel = supabase
      .channel(`navbar-direct-message-unread-${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "direct_conversations" }, reload)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "direct_messages" }, reload)
      .subscribe();

    return () => {
      stopped = true;
      window.removeEventListener("notificationsChanged", reload);
      window.removeEventListener("directMessagesChanged", reload);
      void supabase.removeChannel(channel);
    };
  }, [enabled, refresh, user]);

  return unread;
}
