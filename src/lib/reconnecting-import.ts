import { isStaleChunkError } from "@/lib/errors/runtime-error-kind";

/**
 * A section's code that fails to download because the connection dropped is not a new deployment. Without this, the
 * Pro space shows the error screen and the stale-version guard reloads the whole page once the signal returns, which
 * also cancels whatever the person opened next (another section, the other language). Instead the section keeps its
 * "Loading..." state while offline and downloads again when the connection returns; webpack forgets a failed chunk, so a
 * second import() fetches it again. A chunk that still fails online (really gone after a deploy) is rethrown as before.
 */
export function reconnectingImport<T>(load: () => Promise<T>, retries = 2): Promise<T> {
  return load().catch(async (error: unknown) => {
    if (retries <= 0 || typeof window === "undefined" || !isStaleChunkError(error)) throw error;
    if (navigator.onLine === false) {
      await new Promise<void>((resolve) => window.addEventListener("online", () => resolve(), { once: true }));
    } else {
      // The signal can come back a moment before the failed download reports; give it a short beat.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 400));
    }
    return reconnectingImport(load, retries - 1);
  });
}
