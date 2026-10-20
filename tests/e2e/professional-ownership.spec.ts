import { createClient } from "@supabase/supabase-js";
import { test, expect } from "playwright/test";
import { createDisposableAccount, cleanupDisposableAccount, type DisposableAccount } from "./disposable-account";
import { canRunSeededRegression, regressionAdminClient } from "./seed";

test("professional updates preserve ownership without recursive policies", async () => {
  test.skip(!canRunSeededRegression(), "Isolated regression database required");
  test.setTimeout(90_000);
  const accounts: DisposableAccount[] = [];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const anonymous = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const db = regressionAdminClient();
  try {
    const owner = await createDisposableAccount({ prefix: "ownership-owner", professional: true }); accounts.push(owner);
    const stranger = await createDisposableAccount({ prefix: "ownership-other", professional: true }); accounts.push(stranger);
    const recipient = await createDisposableAccount({ prefix: "ownership-transfer" }); accounts.push(recipient);
    const auth = await client.auth.signInWithPassword({ email: owner.email, password: owner.password });
    expect(auth.error).toBeNull();
    const original = await db.from("professionals").select("bio").eq("id", stranger.professionalId!).single().throwOnError();
    const marker = `Ownership regression ${owner.id}`;
    const own = await client.from("professionals").update({ bio: marker }).eq("id", owner.professionalId!).select("id,bio").single();
    expect(own.error).toBeNull();
    expect(own.data).toEqual({ id: owner.professionalId, bio: marker });
    const other = await client.from("professionals").update({ bio: marker }).eq("id", stranger.professionalId!).select("id");
    expect(other.error).toBeNull();
    expect(other.data).toEqual([]);
    const transfer = await client.from("professionals").update({ profile_id: recipient.id }).eq("id", owner.professionalId!);
    expect(transfer.error?.code).toBe("42501");
    await anonymous.from("professionals").update({ bio: "unauthorized" }).eq("id", owner.professionalId!);
    expect((await db.from("professionals").select("bio,profile_id").eq("id", owner.professionalId!).single().throwOnError()).data)
      .toEqual({ bio: marker, profile_id: owner.id });
    expect((await db.from("professionals").select("bio").eq("id", stranger.professionalId!).single().throwOnError()).data).toEqual(original.data);
  } finally {
    await client.auth.signOut();
    for (const account of accounts.reverse()) await cleanupDisposableAccount(account);
  }
});
