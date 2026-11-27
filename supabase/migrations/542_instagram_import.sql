-- 542 (2026-11-27, owner request «Importar fotos de mi Instagram»; docs/instagram-import.md).
-- * instagram_connections: the person's Instagram connection (Instagram API with Instagram Login, scope
--   instagram_business_basic). The access token lives ONLY here and is read by the server with the service role; it is
--   never sent to the browser. «Desconectar Instagram» deletes the row. provider='sandbox' rows come from the local fake
--   connect screen (development only).
-- * instagram_media_imports: provenance of every imported photo {source instagram, permalink, media id} and the result
--   it produced (a dir_place_media id, or the portfolio photo URL). The server skips a media id already imported to the
--   same target while that result still exists.
-- Both tables: RLS on and NO policies, privileges revoked from anon/authenticated → service role only.
begin;
create table if not exists public.instagram_connections(
 user_id uuid primary key references auth.users(id) on delete cascade,
 provider text not null check(provider in('meta','sandbox')),
 ig_user_id text not null check(length(ig_user_id) between 1 and 64),
 username text check(username is null or length(username)<=64),
 access_token text not null check(length(access_token) between 1 and 4096),
 token_expires_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create table if not exists public.instagram_media_imports(
 id uuid primary key default gen_random_uuid(),
 user_id uuid not null references auth.users(id) on delete cascade,
 target_kind text not null check(target_kind in('place','portfolio')),
 target_id text not null check(length(target_id) between 1 and 80),
 media_id text not null check(media_id ~ '^[A-Za-z0-9_-]{1,64}$'),
 permalink text check(permalink is null or (length(permalink)<=400 and permalink like 'https://%')),
 result_ref text not null check(length(result_ref) between 1 and 600),
 created_at timestamptz not null default now(),
 unique(user_id,target_kind,target_id,media_id)
);
create index if not exists instagram_media_imports_target on public.instagram_media_imports(target_kind,target_id);
alter table public.instagram_connections enable row level security;
alter table public.instagram_media_imports enable row level security;
revoke all on public.instagram_connections from anon,authenticated;
revoke all on public.instagram_media_imports from anon,authenticated;
grant all on public.instagram_connections to service_role;
grant all on public.instagram_media_imports to service_role;
commit;
