// Selects without ORDER BY may return rows in a different physical order after updates or concurrent writes.
// Table snapshots compare the multiset of rows: every field and every duplicate is kept, only the order is normalized.
export function stableSnapshotRows<T>(rows:T[]|null){return rows?.slice().sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)))??rows;}
