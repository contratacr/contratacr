"use client";

import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/client";

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function syncAvatar(u: User) {
    // Optimistic: show the metadata avatar synchronously (before the DB round
    // trip) so the header never flashes initials → photo. We mirror the
    // uploaded avatar into user_metadata on upload, so this is usually populated.
    const metaAvatar =
      (u.user_metadata?.avatar_url as string | undefined) ||
      (u.user_metadata?.picture as string | undefined) ||
      null;
    if (metaAvatar) setAvatarUrl((prev) => prev ?? metaAvatar);

    // Then reconcile with the canonical profile record (Cloudinary uploads).
    const supabase = createClient();
    const { data } = await supabase
      .from("profiles")
      .select("avatar_url")
      .eq("id", u.id)
      .single();
    setAvatarUrl(data?.avatar_url || metaAvatar || null);
  }

  useEffect(() => {
    const supabase = createClient();

    supabase.auth.getSession().then(({ data }) => {
      const u = data.session?.user ?? null;
      setUser(u);
      if (u) syncAvatar(u);
      setLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_, session) => {
      const u = session?.user ?? null;
      setUser(u);
      if (u) {
        syncAvatar(u);
      } else {
        setAvatarUrl(null);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  return { user, avatarUrl, loading };
}
