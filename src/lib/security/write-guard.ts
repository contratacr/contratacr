import { NextResponse, type NextRequest } from "next/server";

const PROD_SUPABASE_REF = "kskueodxaksxvjrysouw";

type RequestLike = Request | NextRequest;

export function getSupabaseProjectRef() {
  try {
    const host = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").hostname;
    return host.split(".")[0] || "unknown";
  } catch {
    return "unknown";
  }
}

export function requestHost(req: RequestLike) {
  const forwardedHost = req.headers.get("x-forwarded-host");
  const host = forwardedHost || req.headers.get("host");
  if (host) return host.toLowerCase();
  try {
    return new URL(req.url).host.toLowerCase();
  } catch {
    return "unknown";
  }
}

export function isLocalRequest(req: RequestLike) {
  const host = requestHost(req);
  return (
    host.startsWith("localhost") ||
    host.startsWith("127.0.0.1") ||
    host.startsWith("[::1]") ||
    host.endsWith(".local")
  );
}

export function isProductionSupabaseTarget() {
  return getSupabaseProjectRef() === PROD_SUPABASE_REF;
}

export function appEnvironment(req?: RequestLike) {
  if (req && isLocalRequest(req)) return "local";
  if (process.env.VERCEL_ENV) return process.env.VERCEL_ENV;
  return process.env.NODE_ENV || "unknown";
}

export function writeSourceColumns(req: RequestLike) {
  return {
    created_source_host: requestHost(req),
    created_app_environment: appEnvironment(req),
    created_supabase_project_ref: getSupabaseProjectRef(),
  };
}

export function isUnsafeLocalProductionWrite(req: RequestLike) {
  if (!["POST", "PUT", "PATCH", "DELETE"].includes(req.method.toUpperCase())) return false;
  return isLocalRequest(req) && isProductionSupabaseTarget();
}

export function unsafeLocalProductionWriteResponse() {
  return NextResponse.json(
    {
      error:
        "Escritura bloqueada: localhost esta apuntando a la base de produccion. Reinicia el servidor local con .env.test.",
    },
    { status: 403 }
  );
}
