export const dynamic = "force-dynamic";

export function GET() {
  const rawCommitSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() ?? "";
  const commitSha = /^[a-f0-9]{40}$/i.test(rawCommitSha) ? rawCommitSha : null;

  return Response.json(
    {
      status: "ok",
      commitSha,
    },
    {
      headers: {
        "Cache-Control": "no-store, max-age=0",
      },
    },
  );
}
