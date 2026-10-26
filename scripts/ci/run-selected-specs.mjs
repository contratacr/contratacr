import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
export function selectedArgs(specs, mobile = false) {
  if (!Array.isArray(specs) || !specs.length || specs.some(s => typeof s !== 'string' || !/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(s))) {
    throw new Error('A focused job requires an explicit non-empty list of safe complete spec paths.');
  }
  // Arguments are passed directly, never interpolated as a shell command. Escape
  // Playwright's regular-expression file filters to match exactly the chosen file.
  const filters = specs.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
  return ['playwright', 'test', ...(mobile ? ['--config=playwright.mobile.config.ts'] : []), ...filters];
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = spawnSync('npx', selectedArgs(JSON.parse(process.env.SELECTED_SPECS || '[]'), process.argv.includes('--mobile')), { stdio: 'inherit', env: process.env });
  if (result.error) throw result.error;
  process.exit(result.status ?? 1);
}
