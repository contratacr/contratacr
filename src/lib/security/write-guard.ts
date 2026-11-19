import { NextResponse, type NextRequest } from "next/server";
import {
  getSupabaseProjectRef,
  isProductionSupabaseTarget,
  isUnsafeProductionSupabaseRuntime,
} from "@/lib/security/supabase-target";

export { getSupabaseProjectRef, isProductionSupabaseTarget } from "@/lib/security/supabase-target";

type RequestLike = Request | NextRequest;

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

/**
 * Same-origin check for browser writes. Next can rewrite `req.url` to its
 * internal hostname (a dev server bound to 127.0.0.1 reports localhost), so
 * comparing Origin with `new URL(req.url).origin` rejected the page's own
 * requests. The Host header keeps the origin the browser used — the same rule
 * `proApiAccess` and the Pro routes already apply. A cross-site page still
 * sends its own Origin and is rejected.
 */
export function isSameOriginRequest(req: RequestLike) {
  const origin = req.headers.get("origin");
  if (!origin) return false;
  let url: URL;
  try { url = new URL(req.url); } catch { return false; }
  return origin === url.origin || origin === `${url.protocol}//${req.headers.get("host") || url.host}`;
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
  return isUnsafeProductionSupabaseRuntime() || (isLocalRequest(req) && isProductionSupabaseTarget());
}

export function unsafeLocalProductionWriteResponse() {
  return NextResponse.json(
    {
      error:
        "Escritura bloqueada: este entorno esta apuntando a la base de produccion. Use .env.test para desarrollo/test.",
    },
    { status: 403 }
  );
}
