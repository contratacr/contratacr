import { execFileSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { gitSnapshot, sectionImpact, dependencyGraph, consumers, runnerCompatibility } from './section-impact.mjs';

// Only documents inspected as non-runtime inputs belong here. Unknown Markdown
// (including generated content) must take the conservative route.
const documents = new Set([
  'AGENTS.md', 'docs/test-selection-policy.md', 'docs/regression-testing.md',
  'docs/mobile-release-history.md', 'docs/loading-and-native-entry-audit.md',
]);
const plannerTestFiles = new Set(['test-plan','section-impact'].map(name=>`tests/ci/${name}.test.mjs`));
export const nativeSpecs = new Set([
  'notification-modal-layout', 'notification-action-copy', 'app-link-coverage',
  'direct-chat', 'recuperacion-al-desbloquear', 'reanudar-la-app',
  'mensajes-sin-parpadeo', 'mobile-native-shell', 'admin-bottom-nav',
  'native-social-access', 'apple-existing-account', 'native-edge-back',
  'native-home-paint', 'landing-media-budget', 'cookie-preferences', 'app-download', 'marketplace-editors',
].map(n => `tests/e2e/${n}.spec.ts`));
const nativeOnly = new Set(['tests/e2e/direct-chat.spec.ts', 'tests/e2e/mobile-native-shell.spec.ts']);
const git = args => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 16 * 1024 * 1024 }).trim();

export function classify(changes, { baseline = true, force = false, importedSpecs = [], impact = null, analysisError = null } = {}) {
  const paths = changes.map(c => c.path);
  const docs = paths.every(p => documents.has(p));
  const testsOnly = paths.every(p => documents.has(p) || /^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(p));
  const plannerTests = !importedSpecs.some(p=>plannerTestFiles.has(p)) && paths.some(p=>plannerTestFiles.has(p)) && changes.every(c=>documents.has(c.path)||(plannerTestFiles.has(c.path)&&c.status==='M'));
  const specs = paths.filter(p => p.endsWith('.spec.ts'));
  const sectionInputs = paths.every(p => documents.has(p) || /^src\/.*\.[cm]?[jt]sx?$/.test(p) || /^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(p));
  const unsafeSpec = changes.some(c => c.status !== 'M' && !documents.has(c.path)) || specs.some(p => importedSpecs.includes(p));
  let scope = 'broad';
  let reason = 'Runtime, shared fixture/configuration, deleted/renamed test or unmapped input: keep broad coverage.';
  if (force) reason = 'Manual/scheduled execution retains its requested coverage.';
  else if (!baseline) reason = 'No compatible successful ancestor found: keep broad coverage.';
  else if (docs) { scope = 'documents'; reason = 'Only explicitly reviewed non-runtime documents changed.'; }
  else if (plannerTests) { scope = 'planner-tests'; reason = 'Only reviewed planner unit tests changed; the mandatory planning job runs all of them, without application jobs.'; }
  else if (analysisError) reason = analysisError;
  else if (testsOnly && !unsafeSpec) { scope = 'specs'; reason = 'Only existing independent E2E specs changed; run complete specs in their configured engines.'; }
  else if (sectionInputs && !unsafeSpec && impact?.safe) { scope = 'sections'; reason = impact.reason; }
  const selected = scope === 'sections' ? impact.specs : specs;
  return {
    scope, reason, paths,
    impact,
    regression: scope === 'broad' || (['specs','sections'].includes(scope) && selected.some(p => !nativeOnly.has(p))),
    security: ['broad','sections'].includes(scope),
    mobile: scope === 'broad' || (['specs','sections'].includes(scope) && selected.some(p => nativeSpecs.has(p))),
    // Deployment remains independent: changes to runtime/build/unknown inputs
    // retain the existing Cloudflare pipeline; tests/documents do not deploy.
    deploy: ['broad','sections'].includes(scope),
    webSpecs: ['specs','sections'].includes(scope) ? selected.filter(p => !nativeOnly.has(p)) : [],
    mobileSpecs: ['specs','sections'].includes(scope) ? selected.filter(p => nativeSpecs.has(p)) : [],
  };
}

async function api(path) {
  const r = await fetch(`${process.env.GITHUB_API_URL || 'https://api.github.com'}/repos/${process.env.GITHUB_REPOSITORY}/${path}`, {
    headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    signal: AbortSignal.timeout(20000),
  });
  if (!r.ok) throw new Error(`GitHub baseline lookup HTTP ${r.status}`);
  return r.json();
}

export async function main() {
  const event = JSON.parse(readFileSync(process.env.GITHUB_EVENT_PATH, 'utf8'));
  const head = git(['rev-parse', 'HEAD']);
  let base = null, baselineRun = null, lookupError = null;
  const force = !['push', 'pull_request'].includes(process.env.GITHUB_EVENT_NAME);
  if (!force) {
    try {
      if (process.env.GITHUB_EVENT_NAME === 'pull_request') {
        base = git(['merge-base', event.pull_request.base.sha, head]);
      } else {
        // Never compare just to push.before: it can hide an unvalidated failed
        // push. Only successful runs of THIS workflow and branch are evidence.
        const workflow = encodeURIComponent(process.env.PLAN_WORKFLOW);
        const branch = encodeURIComponent(process.env.GITHUB_REF_NAME);
        const result = await api(`actions/workflows/${workflow}/runs?branch=${branch}&event=push&status=success&per_page=50`);
        for (const run of result.workflow_runs ?? []) {
          if (String(run.id) === process.env.GITHUB_RUN_ID) continue;
          try { git(['merge-base', '--is-ancestor', run.head_sha, head]); }
          catch { continue; }
          base = run.head_sha; baselineRun = run.html_url; break;
        }
      }
    } catch (e) { lookupError = e.message; }
  }
  let changes = [], importedSpecs = [];
  if (base) {
    const tokens = execFileSync('git', ['diff', '--name-status', '--no-renames', '-z', base, head], { encoding: 'utf8' }).split('\0');
    for (let i = 0; i + 1 < tokens.length; i += 2) changes.push({ status: tokens[i], path: tokens[i + 1] });
    // A spec imported as a shared module is not an independent test input.
    // Scan both revisions so removal of an import cannot hide an old consumer.
    for (const c of changes.filter(c => c.path.endsWith('.spec.ts') || plannerTestFiles.has(c.path))) {
      const needle = c.path.split('/').at(-1).replace(/(?:\.ts|\.mjs)$/, '');
      for (const rev of [base, head]) {
        try {
          const consumers = plannerTestFiles.has(c.path) ? ['src','scripts','playwright*.config.*','next.config.*'] : ['tests','src',':(exclude)tests/ci/**'];
          const hits = git(['grep', '-l', '-F', needle, rev, '--', ...consumers]);
          if (hits.split('\n').some(p => p && p !== `${rev}:${c.path}`)) importedSpecs.push(c.path);
        } catch (e) { if (e.status !== 1) throw e; }
      }
    }
  }
  let impact = null, analysisError = null;
  if (base && !force && changes.some(c=>c.path.startsWith('src/')||c.path.endsWith('.spec.ts')) && changes.every(c=>documents.has(c.path)||/^src\/.*\.[cm]?[jt]sx?$/.test(c.path)||/^tests\/e2e\/[a-z0-9-]+\.spec\.ts$/.test(c.path))) {
    try {
      const snapshots=[gitSnapshot(base),gitSnapshot(head)],graphs=snapshots.map(dependencyGraph);
      analysisError=[...snapshots.map(runnerCompatibility),...graphs.flatMap(g=>g.uncertainties)].filter(Boolean).slice(0,4).join('; ')||null;
      for(const c of changes.filter(c=>c.path.endsWith('.spec.ts')))if(graphs.some(g=>[...consumers([c.path],g)].some(p=>g.globalEntries.has(p))))importedSpecs.push(c.path);
      if(changes.some(c=>c.path.startsWith('src/')))impact=sectionImpact(changes,...snapshots,graphs);
    }catch(e){analysisError=`Dependency analysis unavailable: ${e.message}`;impact={safe:false,reason:analysisError};}
  }
  const plan = { head, base, baselineRun, lookupError, workflow: process.env.PLAN_WORKFLOW, analysisError,
    ...classify(changes, { baseline: !!base, force, importedSpecs, impact, analysisError }) };
  const kind = process.env.PLAN_KIND;
  const run = plan[kind];
  if (typeof run !== 'boolean') throw new Error(`Unknown plan kind: ${kind}`);
  writeFileSync('ci-test-plan.json', JSON.stringify(plan, null, 2));
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT,
    `run=${run}\nscope=${plan.scope}\nweb_specs=${JSON.stringify(plan.webSpecs)}\nmobile_specs=${JSON.stringify(plan.mobileSpecs)}\n`);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY,
    `## Automatic test plan: ${kind}\n\nScope: **${plan.scope}**. Heavy job: **${run ? 'run' : 'not needed'}**.\n\n${plan.reason}\n\nHead: \`${head}\`\n\nBaseline: ${baselineRun || base || 'none — conservative fallback'}\n\nLookup: ${lookupError || 'OK'}\n\nSections: ${impact?.sections?.join(", ") || "not narrowed"}. Dependency analysis: ${impact?.reason || "not applicable"}.\n\nChanged paths, consumers and selected specs are in the ci-test-plan artifact. Scheduled/manual runs are not reduced. This is not a claim that a skipped test ran.\n`);
  console.log(JSON.stringify(plan, null, 2));
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
