// Client-side mirror of PRO_ENABLED (src/lib/pro/enabled.ts), for components that run in the browser (the server variable is not
// visible there). Build-time public variable NEXT_PUBLIC_PRO_ENABLED ('true' | 'false'); unset: ON in local development, OFF in any
// production build. UI only: every Pro API and page is still closed on the server by PRO_ENABLED (middleware, proApiAccess, per-route guards).
export const PRO_UI_ENABLED=process.env.NEXT_PUBLIC_PRO_ENABLED==='true'||(process.env.NEXT_PUBLIC_PRO_ENABLED!=='false'&&process.env.NODE_ENV==='development');
