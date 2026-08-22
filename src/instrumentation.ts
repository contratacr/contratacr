// Opt-in request journal for the CI release regression (CI_REQUEST_LOG=1).
// Every HTTP request handled by the Node.js server is logged when it starts and
// when it finishes, so a request that never answers can be identified from the
// job log. Off everywhere else: the Worker runtime and the dev server skip it.
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs" || process.env.CI_REQUEST_LOG !== "1") return;
  const http = await import("node:http");
  const originalEmit = http.Server.prototype.emit as (this: unknown, ...emitArgs: unknown[]) => boolean;
  let sequence = 0;
  http.Server.prototype.emit = function patchedEmit(this: unknown, event: string | symbol, ...args: unknown[]) {
    if (event === "request") {
      const req = args[0] as { method?: string; url?: string };
      const res = args[1] as { statusCode: number; writableFinished: boolean; on: (name: string, fn: () => void) => void };
      const id = (sequence += 1);
      const start = Date.now();
      const label = `${req.method ?? "?"} ${req.url ?? "?"}`;
      console.log(`[req ${id}] → ${label}`);
      res.on("finish", () => console.log(`[req ${id}] ← ${res.statusCode} ${Date.now() - start}ms ${label}`));
      res.on("close", () => {
        if (!res.writableFinished) console.log(`[req ${id}] ✕ closed without finishing after ${Date.now() - start}ms ${label}`);
      });
    }
    return originalEmit.call(this, event, ...args);
  } as unknown as typeof http.Server.prototype.emit;
}
