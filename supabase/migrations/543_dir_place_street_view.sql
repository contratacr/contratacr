-- 543 (2026-11-27): «Vista de la calle» — the Mapillary street-level image chosen for a place WITHOUT photos of its own
-- (CC BY-SA 4.0; credit «© <creator> · Mapillary · CC BY-SA 4.0», linked to the image page). One row per place, written by
-- scripts/directory/mapillary-streetview.mjs (service role):
-- * status 'found' (image_id + creator + captured_at) or 'none' (looked up, nothing good enough; avoids re-querying).
-- * checked_at: when the place was looked up; the script looks it up again after 90 days.
-- * thumb_1024_url / thumb_2048_url + thumb_fetched_at: last Mapillary CDN URLs (they expire). Image files are NEVER
--   copied into our storage; /api/vista-calle/<placeId> redirects to a fresh URL, re-fetched by image id after ~1 h.
-- No anon/authenticated access: only the service role (server routes and the script) reads or writes it.
begin;

create table if not exists public.dir_place_street_view(
 place_id uuid primary key references public.dir_places(id) on delete cascade,
 status text not null check(status in('found','none')),
 provider text not null default 'mapillary' check(provider='mapillary'),
 image_id text check(image_id ~ '^[0-9]{1,20}$'),
 creator text check(length(creator) between 1 and 120),
 captured_at timestamptz,
 compass_angle real,
 distance_m real check(distance_m>=0 and distance_m<=200),
 facing boolean,
 thumb_1024_url text check(thumb_1024_url ~ '^https://' and length(thumb_1024_url)<=2048),
 thumb_2048_url text check(thumb_2048_url ~ '^https://' and length(thumb_2048_url)<=2048),
 thumb_fetched_at timestamptz,
 checked_at timestamptz not null default now(),
 check(status<>'found' or (image_id is not null and creator is not null)),
 check(status<>'none' or (image_id is null and thumb_1024_url is null and thumb_2048_url is null))
);
create index if not exists dir_place_street_view_checked on public.dir_place_street_view(checked_at);

alter table public.dir_place_street_view enable row level security;
revoke all on table public.dir_place_street_view from public,anon,authenticated;
grant select,insert,update,delete on table public.dir_place_street_view to service_role;

commit;
