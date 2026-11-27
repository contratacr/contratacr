// "Importar desde Instagram" (2026-11-27). Server variable INSTAGRAM_IMPORT_ENABLED ('true' | 'false', never NEXT_PUBLIC_).
// Unset: ON in local development, OFF in any production build, so production shows nothing new until it is set (and the
// Meta app exists, docs/instagram-import.md). Client components read the build-time mirror in enabled-client.ts.
export const INSTAGRAM_IMPORT_ENABLED=process.env.INSTAGRAM_IMPORT_ENABLED==='true'||(process.env.INSTAGRAM_IMPORT_ENABLED!=='false'&&process.env.NODE_ENV==='development');
