type ThreadMessage = {
  id: string; created_at: string; body: string;
  attachment_urls?: unknown[]; edited_at?: string | null; deleted_at?: string | null;
  read_at?: string | null; delivered_at?: string | null; reply_to_id?: string | null;
};

/** Server snapshots may predate an in-flight upload or a completed local send. */
export function reconcileThreadMessages<T extends ThreadMessage>(previous: T[], snapshot: T[], preserve: ReadonlySet<string> = new Set()): T[] {
  const byId = new Map(previous.map(message => [message.id, message]));
  const present = new Set(snapshot.map(message => message.id));
  const merged = snapshot.map(message => {
    const old = byId.get(message.id);
    return old && old.body === message.body && old.created_at === message.created_at &&
      old.edited_at === message.edited_at && old.deleted_at === message.deleted_at &&
      old.read_at === message.read_at && old.delivered_at === message.delivered_at &&
      old.reply_to_id === message.reply_to_id &&
      JSON.stringify(old.attachment_urls ?? []) === JSON.stringify(message.attachment_urls ?? []) ? old : message;
  });
  merged.push(...previous.filter(message => !present.has(message.id) &&
    (message.id.startsWith('pending-') || preserve.has(message.id))));
  merged.sort((a, b) => a.created_at.localeCompare(b.created_at));
  return merged.length === previous.length && merged.every((message, index) => message === previous[index]) ? previous : merged;
}

/** A successful send must be inserted even if a refresh removed its placeholder. */
export function confirmThreadMessage<T extends ThreadMessage>(previous: T[], pendingId: string, confirmed: T): T[] {
  return [...previous.filter(message => message.id !== pendingId && message.id !== confirmed.id), confirmed]
    .sort((a, b) => a.created_at.localeCompare(b.created_at));
}
