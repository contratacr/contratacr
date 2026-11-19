/** The local Pro preview uses Node caching without initializing Wrangler bindings. */
export function usesLocalProNodeCache(nodeEnv: string | undefined, supabaseUrl: string | undefined): boolean {
  if (nodeEnv !== 'development' || supabaseUrl !== 'http://127.0.0.1:54321') return false;
  try {
    const target = new URL(supabaseUrl);
    return target.protocol === 'http:' && target.hostname === '127.0.0.1' && target.port === '54321';
  } catch {
    return false;
  }
}
