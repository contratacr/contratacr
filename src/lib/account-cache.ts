/** Remove browser data owned by one account without touching another user's
 * cache on a shared device. Authentication storage is handled by signOut(). */
export function clearAccountLocalCache(userId: string) {
  if (typeof window === "undefined" || !userId) return;
  const exactKeys = new Set([
    `ccr:avatar:${userId}`,
    `ccr:notifications:${userId}`,
    `contratacr:follow-counts:${userId}`,
    `contratacr:local-professional-follows:${userId}`,
    `contratacr_saved_pros_${userId}`,
    `contratacr_saved_pros_synced_${userId}`,
    `contratacr:seen-opportunity-modal:${userId}`,
  ]);
  for (const key of exactKeys) window.localStorage.removeItem(key);
}
