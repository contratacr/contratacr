// Launch flag (2026-11-18): ContrataCR PRO (/dashboard/pro, /api/pro/*, /admin/pro, /pagar, /sitio, /pro-preview and the
// other Pro-only pages). Server variable PRO_ENABLED ('true' | 'false', never NEXT_PUBLIC_). Unset: ON in local
// development, OFF in any production build. Read on the server only (middleware, route handlers, server components):
// client components receive it as a prop.
//
// Central gates that read it: the middleware (src/middleware.ts, PRO_ROUTE_PREFIXES → 404 for pages and APIs),
// proApiAccess (src/lib/pro/api-access.ts) and the public entry points (claim benefits, /eventos, the professional
// dashboard card, the admin shell) and by every Pro route and page: the former per-route development-only locks were replaced
// by this flag (2026-11-22). Client components read the build-time mirror NEXT_PUBLIC_PRO_ENABLED (src/lib/pro/enabled-client.ts).
// ON only in the isolated test Worker (cloudflare-compatibility.yml: EFFECTIVE_PRO_ENABLED); production stays OFF.
// Still closed on purpose: routes tied to a local-only database (appointment reminders) and directory classified listings.
export const PRO_ENABLED=process.env.PRO_ENABLED==='true'||(process.env.PRO_ENABLED!=='false'&&process.env.NODE_ENV==='development');

/** Path prefixes (without the /en locale prefix) that belong only to Pro. */
export const PRO_ROUTE_PREFIXES=[
 '/dashboard/pro','/admin/pro','/pro-preview','/contratacr-pro','/pagar','/sitio','/baja-pro','/confirmar-pro','/licitacion-proveedor','/orden-proveedor',
 '/formulario-contacto','/dashboard/cotizaciones','/dashboard/subcontratista','/dashboard/unirse-proyecto','/dashboard/mi-proyecto',
] as const;
export const PRO_API_PREFIXES=['/api/pro'] as const;
export function isProOnlyPath(pathWithoutLocale:string):boolean{
 const hit=(p:string)=>pathWithoutLocale===p||pathWithoutLocale.startsWith(p+'/');
 return PRO_ROUTE_PREFIXES.some(hit)||PRO_API_PREFIXES.some(hit);
}
