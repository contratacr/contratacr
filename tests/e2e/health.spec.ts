import { expect, test } from "playwright/test";
import { GET } from "../../src/app/api/health/route";

test.describe("deployment health contract", () => {
  test("reports health without caching or exposing environment secrets", async ({ request }) => {
    const response = await request.get("/api/health");

    expect(response.status()).toBe(200);
    expect(response.headers()["cache-control"]).toContain("no-store");

    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    // `supabase` trae solo banderas (url/anonKey/serviceKey presentes) y el ref del
    // proyecto, que es público: sirve para confirmar secretos por entorno sin exponerlos.
    expect(Object.keys(body).sort()).toEqual(["commitSha", "status", "supabase"]);
    const supabase = body.supabase as Record<string, unknown>;
    for (const k of ["url", "anonKey", "serviceKey"]) expect(typeof supabase[k]).toBe("boolean");
    expect(String(supabase.projectRef ?? "")).not.toMatch(/eyJ|sb_secret/);
    expect(body.commitSha === null || typeof body.commitSha === "string").toBe(true);
    if (typeof body.commitSha === "string") {
      expect(body.commitSha).toMatch(/^[a-f0-9]{40}$/i);
    }
  });

  test("normalizes the runtime deployment SHA", async () => {
    const previousSha = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = `  ${"a".repeat(40)}  `;

    try {
      const response = GET();
      expect(await response.json()).toEqual(expect.objectContaining({
        status: "ok",
        commitSha: "a".repeat(40),
      }));
      expect(response.headers.get("cache-control")).toContain("no-store");
    } finally {
      if (previousSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previousSha;
    }
  });

  test("does not reflect an invalid runtime value", async () => {
    const previousSha = process.env.VERCEL_GIT_COMMIT_SHA;
    process.env.VERCEL_GIT_COMMIT_SHA = "not-a-deployment-sha";

    try {
      const response = GET();
      expect(await response.json()).toEqual(expect.objectContaining({ status: "ok", commitSha: null }));
    } finally {
      if (previousSha === undefined) delete process.env.VERCEL_GIT_COMMIT_SHA;
      else process.env.VERCEL_GIT_COMMIT_SHA = previousSha;
    }
  });
});
