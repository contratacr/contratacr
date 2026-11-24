/**
 * English display copy for Spanish API errors of /api/pro/*. The server keeps one Spanish string per error (it is
 * the stable contract used by the routes and specs); English readers get the mapped text, and an unmapped Spanish
 * message falls back to a generic English line so Spanish never leaks into the English interface.
 */
const GENERIC_EN = 'Something went wrong. Please try again.';
const SPANISH_HINT = /[áéíóúñ¿¡]|\b(el|la|los|las|de|del|no|se|su|sus|para|una|un|por|con|en|que|es|al|debe|puede|falta|revise|inicie|intente)\b/i;
let table: Record<string, string> | null = null;
let loading: Promise<void> | null = null;

export function loadProApiErrorsEn(): Promise<void> {
  if (table) return Promise.resolve();
  loading ??= import('./api-error-en.json').then((m) => { table = (m.default ?? m) as Record<string, string>; }).catch(() => { table = {}; });
  return loading;
}

export function proApiErrorEn(message: string): string {
  const hit = table?.[message];
  if (hit) return hit;
  return SPANISH_HINT.test(message) ? GENERIC_EN : message;
}
