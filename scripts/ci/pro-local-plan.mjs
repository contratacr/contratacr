// Selector of the Pro local regression (.github/workflows/pro-local-regression.yml).
// Pure classification plus a small CLI. No network access and no repository writes.
// Policy: docs/test-selection-policy.md. A focused pass is never a full pass, so a run
// that cannot prove which inputs changed since a compatible full pass runs everything.
import { execFileSync } from 'node:child_process';
import { appendFileSync, existsSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

// Must stay identical to `on.push.paths` of the workflow (tests/ci/pro-local-plan.test.mjs enforces it).
export const TRIGGER_GLOBS = [
  '.github/workflows/pro-local-regression.yml',
  'scripts/ci/pro-local-plan.mjs',
  'playwright.pro-local.config.ts',
  'playwright.config.ts',
  'package.json',
  'package-lock.json',
  'supabase/migrations/**',
  'docs/pro/sql/**',
  'scripts/pro/**',
  'src/lib/pro/**',
  'src/components/pro/**',
  'src/app/api/pro/**',
  'src/app/**/pro/**',
  'tests/e2e/pro-*.spec.ts',
  'tests/e2e/pro-local-stable-runtime.ts',
  'tests/e2e/seed.ts',
  'tests/e2e/disposable-account.ts',
  'tests/e2e/helpers.ts',
  'tests/e2e/helpers/**',
];
export const SPEC_PATTERN = /^tests\/e2e\/pro-[a-z0-9-]+\.spec\.ts$/;
export const FULL_SHARDS = 12;
export const MAX_FOCUSED_SPECS = 30;

export function globToRegExp(glob) {
  const body = glob.split('**').map(part => part.split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('[^/]*')).join('.*');
  return new RegExp(`^${body}$`);
}
const triggers = TRIGGER_GLOBS.map(globToRegExp);
export const isRelevant = path => triggers.some(re => re.test(path));

export const shardMatrix = (total) => Array.from({ length: total }, (_, i) => ({ shard: i + 1, total, label: `full shard ${i + 1}/${total}` }));
export const focusedMatrix = () => [{ shard: 1, total: 1, label: 'selected specs' }];

// changes: [{path, status}] from `git diff --no-renames --name-status`; baseline: false when there is no
// compatible successful FULL run to compare against (then everything relevant runs).
export function classify(changes, { baseline = true } = {}) {
  const relevant = changes.filter(c => isRelevant(c.path));
  if (!relevant.length) return { mode: 'none', specs: [], reason: 'No Pro, migration or Pro-spec input changed since the compatible baseline.' };
  if (!baseline) return { mode: 'full', specs: [], reason: 'No compatible successful full run to compare against: running the full suite.' };
  const live = relevant.filter(c => c.status !== 'D');
  const others = live.filter(c => !(SPEC_PATTERN.test(c.path) && ['A', 'M'].includes(c.status)));
  if (others.length) return { mode: 'full', specs: [], reason: `Shared or runtime input changed (${others.slice(0, 5).map(c => c.path).join(', ')}${others.length > 5 ? ', ...' : ''}): running the full suite.` };
  if (!live.length) return { mode: 'none', specs: [], reason: 'Only Pro specs were deleted: nothing to run.' };
  const specs = [...new Set(live.map(c => c.path))].sort();
  if (specs.length > MAX_FOCUSED_SPECS) return { mode: 'full', specs: [], reason: `${specs.length} specs changed: running the full suite.` };
  return { mode: 'specs', specs, reason: `Only ${specs.length} independent Pro spec(s) changed: running those specs.` };
}

// Same escaping as scripts/ci/run-selected-specs.mjs: one anchored regular expression per complete spec path.
export function specFilters(specs) {
  if (!Array.isArray(specs) || !specs.length || specs.some(s => !SPEC_PATTERN.test(s))) throw new Error('A focused Pro run requires safe complete pro-*.spec.ts paths.');
  return specs.map(s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$');
}

export function parseDispatch(scope, rawSpecs, exists = existsSync) {
  if (scope !== 'selected') return { mode: 'full', specs: [], reason: 'Manual full run.' };
  const specs = String(rawSpecs || '').split(/[\s,]+/).filter(Boolean).map(s => (s.startsWith('tests/e2e/') ? s : `tests/e2e/${s}`).replace(/(?:\.spec\.ts)?$/, m => m || '.spec.ts'));
  if (!specs.length) throw new Error('Scope "selected" needs at least one spec name (for example pro-projects).');
  const bad = specs.filter(s => !SPEC_PATTERN.test(s) || !exists(s));
  if (bad.length) throw new Error(`Unknown or unsafe Pro spec(s): ${bad.join(', ')}`);
  return { mode: 'specs', specs: [...new Set(specs)].sort(), reason: 'Manual focused run.' };
}

export function changesBetween(base, head) {
  const out = execFileSync('git', ['diff', '--no-renames', '--name-status', `${base}...${head}`], { encoding: 'utf8' });
  return out.split('\n').filter(Boolean).map(line => { const [status, ...rest] = line.split('\t'); return { status: status[0], path: rest.join('\t') }; });
}

export function plan(env, exists = existsSync, diff = changesBetween) {
  const selection = env.EVENT_NAME === 'workflow_dispatch'
    ? parseDispatch(env.DISPATCH_SCOPE, env.DISPATCH_SPECS, exists)
    : (() => {
        const base = (env.BASE_SHA || '').trim();
        if (!base) return classify([{ path: '.github/workflows/pro-local-regression.yml', status: 'M' }], { baseline: false });
        return classify(diff(base, env.HEAD_SHA || 'HEAD'));
      })();
  const matrix = selection.mode === 'full' ? shardMatrix(FULL_SHARDS) : selection.mode === 'specs' ? focusedMatrix() : [];
  return { ...selection, matrix, filters: selection.mode === 'specs' ? specFilters(selection.specs).join(' ') : '' };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = plan(process.env);
  const lines = [`mode=${result.mode}`, `run=${result.mode === 'none' ? 'false' : 'true'}`, `matrix=${JSON.stringify(result.matrix)}`, `filters=${result.filters}`];
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  const summary = `### Pro local regression plan\n\n- Scope: **${result.mode}**\n- Reason: ${result.reason}\n${result.specs.length ? result.specs.map(s => `- ${s}`).join('\n') + '\n' : ''}`;
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  console.log(summary);
}
