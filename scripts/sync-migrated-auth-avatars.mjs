// Synchronize only avatar URLs from a verified migration report. Other auth
// metadata, providers, sessions and credentials are untouched. Dry run default.
import fs from 'node:fs';
import { createClient } from '@supabase/supabase-js';

const { MEDIA_ENV_FILE, MEDIA_MIGRATION_REPORT, MEDIA_REPORT } = process.env;
if (![MEDIA_ENV_FILE, MEDIA_MIGRATION_REPORT, MEDIA_REPORT].every(Boolean)) throw new Error('Set explicit MEDIA paths.');
process.loadEnvFile(MEDIA_ENV_FILE);
const migration = JSON.parse(fs.readFileSync(MEDIA_MIGRATION_REPORT, 'utf8'));
const project = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).hostname;
if (!migration.finishedAt || !migration.apply || migration.project !== project) throw new Error('Completed migration report for this database required.');
const apply = process.argv.includes('--apply');
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const report = { project, apply, avatars: [] };
const save = () => fs.writeFileSync(MEDIA_REPORT, JSON.stringify(report, null, 2), { mode: 0o600 });
for (const change of migration.changes.filter(c => c.table === 'profiles' && c.status === 'updated')) {
  const { data: { user }, error } = await db.auth.admin.getUserById(change.id);
  if (error) throw error;
  if (user.user_metadata?.avatar_url !== change.before.avatar_url) continue;
  const { data: current, error: readError } = await db.from('profiles').select('avatar_url').eq('id', change.id).single();
  if (readError) throw readError;
  if (current.avatar_url !== change.after.avatar_url) continue;
  const entry = { id: change.id, before: change.before.avatar_url, after: change.after.avatar_url, status: 'planned' };
  report.avatars.push(entry); save();
  if (apply) {
    const { data, error: updateError } = await db.auth.admin.updateUserById(change.id, { user_metadata: { avatar_url: entry.after } });
    if (updateError) throw updateError;
    if (data.user.user_metadata.avatar_url !== entry.after) throw new Error('Auth avatar read-back failed.');
    entry.status = 'updated'; save();
  }
}
report.finishedAt = new Date().toISOString(); save();
console.log(JSON.stringify({ project, apply, avatars: report.avatars.length }));
