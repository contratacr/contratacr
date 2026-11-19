import { proApiAccess, proDbFailure } from "@/lib/pro/api-access";
export async function GET(req: Request) {
  const a = await proApiAccess(req);
  if (a.error) return a.error;
  const { data, error } = await a.db
    .from("professionals")
    .select("slug,business_name")
    .eq("profile_id", a.user.id)
    .maybeSingle();
  if (error) return proDbFailure(error);
  return Response.json(
    {
      content: data
        ? [
            {
              title: data.business_name || "Mi perfil",
              link: `https://contratacr.com/profesionales/${data.slug}`,
            },
          ]
        : [],
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
