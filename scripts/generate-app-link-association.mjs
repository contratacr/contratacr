import { readFile, writeFile } from 'node:fs/promises';
const policy = JSON.parse(await readFile(new URL('../src/lib/mobile/app-link-policy.json', import.meta.url), 'utf8'));
const file = new URL('../public/.well-known/apple-app-site-association', import.meta.url);
const previous = JSON.parse(await readFile(file, 'utf8'));
const components = [];
for (const key of policy.authParameters) components.push({ '?': { [key]: '*' }, exclude: true });
components.push({ '/': '/' }, { '/': '/es' }, { '/': '/es/' }, { '/': '/en' }, { '/': '/en/' });
// Localized profiles must be matched before the root-only exclusions.
for (const prefix of ['/es', '/en', '']) {
  components.push({ '/': `${prefix}/dashboard/native-auth-return*`, exclude: true });
  components.push({ '/': `${prefix}/api/trabajos/reportar` });
  for (const root of policy.browserRoots) {
    components.push({ '/': `${prefix}/${root}`, exclude: true }, { '/': `${prefix}/${root}/*`, exclude: true });
  }
  for (const root of [...policy.sectionRoots, ...policy.screenRoots, ...Object.keys(policy.shortDetails), ...Object.keys(policy.vanitySources), 'pro']) {
    components.push({ '/': `${prefix}/${root}` }, { '/': `${prefix}/${root}/*` });
  }
  // Only one segment may be a profile slug; never claim unknown nested routes
  // or static resources. swcd normalizes a single slug with a trailing slash,
  // so require a non-empty second segment; /*/* also excludes /slug/.
  // Reserved paths are excluded before this fallback.
  components.push({ '/': `${prefix}/*/?*`, exclude: true }, { '/': `${prefix}/*.*`, exclude: true }, { '/': `${prefix}/*` });
}
previous.applinks.details[0].components = components;
const output = JSON.stringify(previous, null, 2) + '\n';
if (process.argv.includes('--check')) {
  if (await readFile(file, 'utf8') !== output) throw new Error('AASA is stale; run node scripts/generate-app-link-association.mjs');
} else await writeFile(file, output);
