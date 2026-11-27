// Client mirror of INSTAGRAM_IMPORT_ENABLED (enabled.ts): build-time NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED ('true' | 'false');
// unset: ON in local development, OFF in any production build. UI only: every route is still closed on the server.
export const INSTAGRAM_IMPORT_UI_ENABLED=process.env.NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED==='true'||(process.env.NEXT_PUBLIC_INSTAGRAM_IMPORT_ENABLED!=='false'&&process.env.NODE_ENV==='development');
