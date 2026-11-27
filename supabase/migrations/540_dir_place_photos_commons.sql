-- 540 (2026-11-27): real photos of imported places from FREELY LICENSED sources only (Wikimedia Commons, found through the
-- OSM tags wikimedia_commons / image / wikidata P18). scripts/directory/commons-photos.mjs stores the file through the same
-- place-photo pipeline as uploads (three variants, private bucket / R2) and records who made it and under which licence.
-- * dir_place_media.attribution (jsonb): {source:'wikimedia-commons', file, author, credit, license, licenseUrl, sourceUrl}.
--   Required for origin 'commons', null for everything else; shown as «Foto: autor · licencia · Wikimedia Commons».
-- * origin 'commons': like an upload (stored variants, sha256, sizes) but with NO uploader/person and always active.
-- * dir_place_photo_object also returns `attribution` so the serving route can answer the credit of a photo.
begin;

alter table public.dir_place_media add column if not exists attribution jsonb;
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_place_media_attribution_shape' and conrelid='public.dir_place_media'::regclass) then
  alter table public.dir_place_media add constraint dir_place_media_attribution_shape check(
   attribution is null or (jsonb_typeof(attribution)='object' and octet_length(attribution::text)<=4096));end if;
 alter table public.dir_place_media drop constraint if exists dir_place_media_upload_shape;
 alter table public.dir_place_media add constraint dir_place_media_upload_shape check(
   origin in('seed','owner','user','commons')
   and (origin='seed' or (sha256~'^[a-f0-9]{64}$' and width between 200 and 1600 and height between 200 and 1600
     and path_1600~'^dir-places/[0-9a-f-]{36}/1600\.(webp|jpg)$' and path_800~'^dir-places/[0-9a-f-]{36}/800\.(webp|jpg)$' and path_320~'^dir-places/[0-9a-f-]{36}/320\.(webp|jpg)$'
     and (origin='commons' or uploader_id is not null)))
   and (origin<>'commons' or (uploader_id is null and status in('active','hidden','removed') and attribution->>'source'='wikimedia-commons'
     and length(coalesce(attribution->>'license',''))>0 and coalesce(attribution->>'sourceUrl','')~'^https://commons\.wikimedia\.org/'))
   and (origin<>'owner' or review_id is null)
   and (caption is null or (length(caption) between 1 and 200 and caption!~*'(https?://|www\.)'))
   and (moderation_reason is null or length(moderation_reason) between 3 and 1000)
   and revision>0 and (status<>'pending' or origin='user'));
end $$;

create or replace function public.dir_place_photo_object(p_id uuid,p_staff boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('path1600',m.path_1600,'path800',m.path_800,'path320',m.path_320,'status',m.status,'store',m.photo_store,'attribution',m.attribution)
 from public.dir_place_media m join public.dir_places p on p.id=m.place_id
 where m.id=p_id and m.origin<>'seed' and (case when coalesce(p_staff,false) then m.status<>'removed' else m.status='active' and public.dir_place_public(p.slug) is not null end) $$;

revoke all on function public.dir_place_photo_object(uuid,boolean) from public,anon,authenticated;
grant execute on function public.dir_place_photo_object(uuid,boolean) to service_role;

commit;
