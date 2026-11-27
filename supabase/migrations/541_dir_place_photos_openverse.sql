-- 541 (2026-11-27): phase 2 of free place photos. scripts/directory/openverse-photos.mjs suggests CC0 / PDM / CC BY / CC BY-SA
-- images found through the Openverse API. The match by name is uncertain, so they are stored as PENDING media (origin
-- 'openverse', no uploader) and only appear on the place after staff approves them in the admin photo queue.
-- * origin 'openverse': stored variants + sha256 like an upload, attribution.source='openverse' with licence, source page (https),
--   provider (e.g. Flickr) and a note for the reviewer (attribution.note).
-- * 'pending' is allowed for origin 'user' and 'openverse'.
-- * dir_admin_photo_queue: the reviewer of an 'openverse' photo sees the note and the source page in place of a caption.
begin;

do $$begin
 alter table public.dir_place_media drop constraint if exists dir_place_media_upload_shape;
 alter table public.dir_place_media add constraint dir_place_media_upload_shape check(
   origin in('seed','owner','user','commons','openverse')
   and (origin='seed' or (sha256~'^[a-f0-9]{64}$' and width between 200 and 1600 and height between 200 and 1600
     and path_1600~'^dir-places/[0-9a-f-]{36}/1600\.(webp|jpg)$' and path_800~'^dir-places/[0-9a-f-]{36}/800\.(webp|jpg)$' and path_320~'^dir-places/[0-9a-f-]{36}/320\.(webp|jpg)$'
     and (origin in('commons','openverse') or uploader_id is not null)))
   and (origin<>'commons' or (uploader_id is null and status in('active','hidden','removed') and attribution->>'source'='wikimedia-commons'
     and length(coalesce(attribution->>'license',''))>0 and coalesce(attribution->>'sourceUrl','')~'^https://commons\.wikimedia\.org/'))
   and (origin<>'openverse' or (uploader_id is null and attribution->>'source'='openverse'
     and length(coalesce(attribution->>'license',''))>0 and coalesce(attribution->>'sourceUrl','')~'^https://'))
   and (origin<>'owner' or review_id is null)
   and (caption is null or (length(caption) between 1 and 200 and caption!~*'(https?://|www\.)'))
   and (moderation_reason is null or length(moderation_reason) between 3 and 1000)
   and revision>0 and (status<>'pending' or origin in('user','openverse')));
end $$;

create or replace function public.dir_admin_photo_queue(p_filter text default 'pending',p_limit integer default 50) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select coalesce(jsonb_agg(x.j order by x.k desc),'[]') from(
  select coalesce((select max(f.created_at) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),m.created_at) k,
   (public.dir_photo_json(m)||jsonb_build_object('slug',p.slug,'placeName',p.name,'uploaderId',m.uploader_id,
    'reviewComment',(select r.comment from public.dir_reviews r where r.id=m.review_id),
    'openFlags',(select count(*) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),
    'flags',coalesce((select jsonb_agg(jsonb_build_object('reason',f.reason,'message',f.message,'at',f.created_at) order by f.created_at desc) from public.dir_place_media_flags f where f.media_id=m.id and f.status='open'),'[]')))
   ||case when m.origin in('openverse','commons') then jsonb_build_object('attribution',m.attribution,
     'caption',case when m.origin='openverse' then coalesce(m.attribution->>'note','')||' Fuente: '||coalesce(m.attribution->>'provider','Openverse')||' '||coalesce(m.attribution->>'sourceUrl','')||' · '||coalesce(m.attribution->>'author','sin autor')||' · '||coalesce(m.attribution->>'license','') end) else '{}'::jsonb end j
  from public.dir_place_media m join public.dir_places p on p.id=m.place_id
  where m.origin<>'seed' and case coalesce(p_filter,'pending') when 'pending' then m.status='pending'
   when 'flagged' then exists(select 1 from public.dir_place_media_flags f where f.media_id=m.id and f.status='open') else m.status<>'removed' end
  order by 1 desc limit least(greatest(coalesce(p_limit,50),1),200)) x $$;
revoke all on function public.dir_admin_photo_queue(text,integer) from public,anon,authenticated;
grant execute on function public.dir_admin_photo_queue(text,integer) to service_role;

commit;
