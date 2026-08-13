import { NextResponse } from "next/server";
import { auditUserAction } from "@/lib/audit/user-action";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

/** Remove a follower from the authenticated account's own professional profile. */
export async function DELETE(request: Request) {
  const body = await request.json().catch(() => ({}));
  const followId = typeof body.followId === "string" ? body.followId.trim() : "";
  if (!UUID_RE.test(followId)) {
    return NextResponse.json({ error: "Relación inválida." }, { status: 400 });
  }

  const session = await createClient();
  const { data: { user }, error: authError } = await session.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "No autorizado." }, { status: 401 });
  }

  const admin = createAdminClient();
  const { data: ownProfessional, error: professionalError } = await admin
    .from("professionals")
    .select("id")
    .eq("profile_id", user.id)
    .maybeSingle();
  if (professionalError) {
    return NextResponse.json({ error: "No pudimos validar el perfil profesional." }, { status: 500 });
  }
  if (!ownProfessional) {
    return NextResponse.json({ error: "Esta cuenta no tiene un perfil profesional." }, { status: 403 });
  }

  // The service-role client is required because the table's DELETE policy only
  // permits the follower to unfollow themselves. Both predicates are mandatory:
  // an authenticated professional can remove rows only from their own profile.
  const { data: removed, error: deleteError } = await admin
    .from("professional_follows")
    .delete()
    .eq("id", followId)
    .eq("professional_id", ownProfessional.id)
    .select("id, follower_id")
    .maybeSingle();
  if (deleteError) {
    return NextResponse.json({ error: "No pudimos quitar este seguidor." }, { status: 500 });
  }

  if (removed) {
    await auditUserAction(admin, request, {
      actorUserId: user.id,
      actorRole: "professional",
      action: "professional_follower.remove",
      entityTable: "professional_follows",
      entityId: removed.id,
      entityOwnerUserId: user.id,
      beforeData: {
        follower_id: removed.follower_id,
        professional_id: ownProfessional.id,
      },
      afterData: { deleted: true },
    });
  }

  const { count: followerCount, error: countError } = await admin
    .from("professional_follows")
    .select("id", { count: "exact", head: true })
    .eq("professional_id", ownProfessional.id);
  if (countError) {
    console.error("[professional-followers] count refresh failed:", countError.message);
  }

  // Idempotent for a row that was already removed, while the owner predicate
  // prevents this response from revealing or mutating another profile's row.
  return NextResponse.json({
    success: true,
    removed: Boolean(removed),
    professionalId: ownProfessional.id,
    followerCount: countError ? null : followerCount ?? 0,
  });
}
