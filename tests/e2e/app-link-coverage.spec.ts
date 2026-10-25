import { test, expect } from 'playwright/test';
import policy from '../../src/lib/mobile/app-link-policy.json';
import { campaignAppPath } from '../../src/lib/mobile/campaign-app-link';
import { readFileSync } from 'node:fs';
const association = JSON.parse(readFileSync('public/.well-known/apple-app-site-association', 'utf8'));

function appleClaims(raw: string) {
  const url = new URL(raw);
  // swcd normalizes path components with a terminal slash, including slugs.
  const applePath = url.pathname.endsWith('/') ? url.pathname : url.pathname + '/';
  const glob = (pattern: string, value: string) => new RegExp('^' + pattern.replace(/[.+^${}()|[\]\\]/g, '\\$&').replaceAll('*', '.*').replaceAll('?', '.') + '$').test(value);
  for (const rule of association.applinks.details[0].components) {
    if (rule['/']) {
      const pattern = /[?*]/.test(rule['/']) || rule['/'].endsWith('/') ? rule['/'] : rule['/'] + '/';
      if (!glob(pattern, applePath)) continue;
    }
    if (rule['?'] && !Object.entries(rule['?']).every(([key, value]) => url.searchParams.has(key) && glob(String(value), url.searchParams.get(key)!))) continue;
    return !rule.exclude;
  }
  return false;
}
for (const locale of ['', '/es', '/en']) test(`all supported route families and aliases preserve their destination (${locale || 'default'})`, () => {
  for (const host of ['contratacr.com', 'www.contratacr.com']) {
    for (const route of [...policy.sectionRoots, ...policy.screenRoots, 'isaac-sanchez', 'isaac-alberto-sanchez-monge', 'isaac-alberto-sanchez-monge/', '@isaac-sanchez', 'p/abcd1234', 'o/abcd1234', 'e/abcd1234', 'c/abcd1234', 'ig', 'tt', 'fb', 'wa', 'pro']) {
      const raw = `https://${host}${locale}/${route}?utm_source=qa#detalle`;
      const result = campaignAppPath(raw);
      expect(result, raw).not.toBeNull();
      expect(result, raw).toContain('utm_source=qa');
      expect(result, raw).toContain('#detalle');
      expect(appleClaims(raw), raw).toBe(true);
    }
  }
  expect(campaignAppPath(`https://contratacr.com${locale}/isaac-sanchez`)).toBe(`${locale === '/en' ? '/en' : ''}/profesionales/isaac-sanchez`);
  expect(campaignAppPath(`https://contratacr.com${locale}/o/abcd1234`)).toBe(`${locale === '/en' ? '/en' : ''}/promociones/abcd1234`);
});
test('browser-only flows and credential payloads remain outside navigation', () => {
  for (const locale of ['', '/es', '/en']) for (const path of ['/auth/callback?code=test', '/admin', '/api/email/baja', '/reset-password', '/login', '/baja-correos', '/descargar', '/dashboard/native-auth-return', '/robots.txt', '/unknown/nested']) {
    const raw = `https://contratacr.com${locale}${path}`;
    expect(campaignAppPath(raw), raw).toBeNull();
    expect(appleClaims(raw), raw).toBe(false);
  }
  for (const key of policy.authParameters) {
    expect(campaignAppPath(`https://contratacr.com/isaac-sanchez?${key}=secret`)).toBeNull();
    expect(campaignAppPath(`https://contratacr.com/isaac-sanchez#${key}=secret`)).toBeNull();
    expect(appleClaims(`https://contratacr.com/isaac-sanchez?${key}=secret`)).toBe(false);
  }
});
