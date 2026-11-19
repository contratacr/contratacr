// Install the authoritative account override in isolated legacy-contract tests.
// These fixtures never create request quotes: empty dependency tables allow the
// new SQL function to compile while its real manual-account callers are tested.
// The dedicated request-quote verifier covers populated, fully related sources.
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

export async function installRequestQuoteAccountOverride(db){
 const sql=await readFile('docs/pro/sql/request-quotes-local.sql','utf8');
 const marker='create or replace function public.pro_work_account(p_user uuid,p_work text) returns jsonb';
 const start=sql.indexOf(marker),end=sql.indexOf('commit;',start);
 assert.ok(start>=0&&end>start,'Request quote account override must exist in the production SQL source');
 assert.equal(sql.indexOf(marker,start+marker.length),-1,'Account override must have a single authoritative definition');
 await db.exec(`create table if not exists public.pro_request_quotes(quote_id uuid,request_id uuid,owner_id uuid,client_user_id uuid,accepted boolean);
 create table if not exists public.pro_appointment_requests(id uuid,owner_id uuid,client_user_id uuid,professional_id uuid,work_id text);`);
 await db.exec(sql.slice(start,end));
 const installed=(await db.query("select pg_get_functiondef('public.pro_work_account(uuid,text)'::regprocedure) definition")).rows[0].definition;
 assert.match(installed,/pro_request_quotes/,'The regression must exercise the new accepted-source account function');
}
