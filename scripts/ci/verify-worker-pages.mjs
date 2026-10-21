// Run against the actual Worker runtime, not Next's Node development server.
// RSC rendering failures may be streamed with HTTP 200 and an error digest.
const base = process.argv[2] || 'http://127.0.0.1:8788';
const routes = ['/proyectos', '/empleos', '/promociones', '/en/proyectos', '/en/empleos', '/en/promociones', '/profesionales', '/login'];
let ready = false;
for (let attempt = 0; attempt < 30; attempt++) {
  try {
    await fetch(new URL('/robots.txt', base), { signal: AbortSignal.timeout(2000) });
    ready = true;
    break;
  } catch { await new Promise(resolve => setTimeout(resolve, 1000)); }
}
if (!ready) throw new Error('Worker did not become ready');
let failures = 0;
for (const route of routes) {
  const response = await fetch(new URL(route, base), { signal: AbortSignal.timeout(20000), headers: { 'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Version/18.0 Mobile/15E148 Safari/604.1' } });
  const html = await response.text();
  const failed = !response.ok || html.includes(':E{') || !/<title>[^<]+<\/title>/u.test(html);
  console.log(`${failed ? 'FAIL' : 'PASS'} ${route}: HTTP ${response.status}, server render ${html.includes(':E{') ? 'failed' : 'ok'}`);
  if (failed) failures++;
}
if (failures) throw new Error(`${failures} Worker pages failed server rendering`);
