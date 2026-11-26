-- 538 (2026-11-26, owner decision «quedarse en planes gratis»): NEW uploaded place photos are stored in Cloudflare R2
-- (10 GB free, free egress) instead of Supabase Storage (1 GB on the free plan, egress counted).
-- * dir_place_media.photo_store: where the three variants of an uploaded photo live — 'supabase' (private bucket
--   dir-place-photos: every photo uploaded before this migration, and every upload where the Worker has no R2 binding:
--   next dev, Node tests) or 'r2' (binding PLACE_PHOTOS of the Worker, key "<supabase project host>/<path>", see
--   src/lib/directory/place-photo-store.ts). Storage paths keep the 289 shape; seed rows keep the default and never use it.
-- * dir_place_photo_add accepts the optional input key `store` ('supabase' | 'r2', default 'supabase'); everything else is
--   289 unchanged (validation, idempotent receipt, caps, dedupe, moderation state). Same signature, so grants stay.
-- * dir_place_photo_object also returns `store` so the serving route reads from the right place.
begin;

alter table public.dir_place_media add column if not exists photo_store text not null default 'supabase';
do $$begin
 if not exists(select 1 from pg_constraint where conname='dir_place_media_photo_store' and conrelid='public.dir_place_media'::regclass) then
  alter table public.dir_place_media add constraint dir_place_media_photo_store check(photo_store in('supabase','r2'));end if;
end $$;

-- Input: {actionId, mediaId, slug, review (bool), caption?, sha256, width, height, path1600, path800, path320, url, store?}.
create or replace function public.dir_place_photo_add(p_actor uuid,p_member uuid,p_input jsonb) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare aid uuid;mid uuid;prior jsonb;p public.dir_places;human uuid:=coalesce(p_member,p_actor);own boolean;rid uuid;cap text;m public.dir_place_media;result jsonb;
 base text;
begin
 if p_actor is null or jsonb_typeof(p_input)<>'object' or exists(select 1 from jsonb_object_keys(p_input) k where k not in('actionId','mediaId','slug','review','caption','sha256','width','height','path1600','path800','path320','url','store')) then
  raise exception 'Invalid photo' using errcode='22023';end if;
 aid:=public.dir_try_uuid(p_input->>'actionId');mid:=public.dir_try_uuid(p_input->>'mediaId');
 cap:=nullif(btrim(regexp_replace(coalesce(p_input->>'caption',''),'\s+',' ','g')),'');
 base:='dir-places/'||mid::text||'/';
 if aid is null or mid is null or jsonb_typeof(p_input->'width')<>'number' or jsonb_typeof(p_input->'height')<>'number'
  or coalesce(p_input->>'sha256','')!~'^[a-f0-9]{64}$' or coalesce(jsonb_typeof(p_input->'review'),'boolean')<>'boolean'
  or length(coalesce(cap,''))>200 or coalesce(cap,'')~*'(https?://|www\.)'
  or coalesce(p_input->>'path1600','') not in(base||'1600.webp',base||'1600.jpg') or coalesce(p_input->>'path800','') not in(base||'800.webp',base||'800.jpg')
  or coalesce(p_input->>'path320','') not in(base||'320.webp',base||'320.jpg')
  or coalesce(p_input->>'store','supabase') not in('supabase','r2')
  or coalesce(p_input->>'url','')!~('^https://[a-z0-9.-]+(:[0-9]+)?/api/fotos-lugar/'||mid::text||'$') then
  raise exception 'Invalid photo' using errcode='22023';end if;
 prior:=public.dir_action_receipt(p_actor,aid,p_input);if prior is not null then return prior;end if;
 select * into p from public.dir_places where slug=p_input->>'slug';
 if not found or public.dir_place_public(p.slug) is null then raise exception 'Place not found' using errcode='P0002';end if;
 perform pg_advisory_xact_lock(hashtextextended('dir-photo:'||p.id::text,0));
 -- Who publishes at once: a manager of the claimed place, or a team member allowed to publish listings.
 if p_member is not null and p_member<>p_actor then perform public.dir_tool_authorize(p_actor,p_member,p.id,'listing.publish');own:=true;
 else own:=p.claim_status='claimed' and exists(select 1 from public.dir_place_managers g where g.place_id=p.id and g.user_id=p_actor and g.status='active');end if;
 if coalesce((p_input->>'review')::boolean,false) then
  if own then raise exception 'The business cannot attach photos to reviews' using errcode='42501',hint='dir_review_own_place';end if;
  select r.id into rid from public.dir_reviews r where r.place_id=p.id and r.author_id=human and r.moderation_status='published';
  if rid is null then raise exception 'Review first' using errcode='P0002',hint='dir_photo_review_missing';end if;
  if (select count(*) from public.dir_place_media x where x.review_id=rid and x.status in('pending','active'))>=5 then
   raise exception 'Too many review photos' using errcode='54000',hint='dir_photo_review_cap';end if;
 end if;
 if exists(select 1 from public.dir_place_media x where x.id=mid) then raise exception 'Photo id reused' using errcode='23505',hint='dir_photo_duplicate';end if;
 if exists(select 1 from public.dir_place_media x where x.place_id=p.id and x.sha256=p_input->>'sha256' and x.status in('pending','active')) then
  raise exception 'Same photo already on this place' using errcode='23505',hint='dir_photo_duplicate';end if;
 if (select count(*) from public.dir_place_media x where x.uploader_id=human and x.created_at>clock_timestamp()-interval '1 day')>=20 then
  raise exception 'Too many photos today' using errcode='54000',hint='dir_photo_cap';end if;
 if (select count(*) from public.dir_place_media x where x.place_id=p.id and x.status in('pending','active'))>=80 then
  raise exception 'Too many photos on this place' using errcode='54000',hint='dir_photo_place_cap';end if;
 insert into public.dir_place_media(id,place_id,kind,url,alt_es,alt_en,source_id,sort,status,origin,uploader_id,member_id,review_id,sha256,width,height,path_1600,path_800,path_320,caption,photo_store)
  values(mid,p.id,'photo',p_input->>'url',cap,cap,case when own then 'owner' else 'community' end,case when own then 0 else 10 end,
   case when own then 'active' else 'pending' end,case when own then 'owner' else 'user' end,human,case when p_member<>p_actor then p_member end,rid,
   p_input->>'sha256',(p_input->>'width')::int,(p_input->>'height')::int,p_input->>'path1600',p_input->>'path800',p_input->>'path320',cap,coalesce(p_input->>'store','supabase'))
  returning * into m;
 if own then
  insert into public.dir_field_provenance(place_id,field,source_id,source_ref,observed_at,action_id) values(p.id,'media','owner','photo:'||mid::text,clock_timestamp(),aid);
 end if;
 result:=jsonb_build_object('ok',true,'photo',public.dir_photo_json(m));
 insert into public.dir_place_actions(actor_id,action_id,input,result) values(p_actor,aid,p_input,result);
 return result;
end $$;

create or replace function public.dir_place_photo_object(p_id uuid,p_staff boolean default false) returns jsonb
language sql stable security invoker set search_path=public,pg_temp as $$
 select jsonb_build_object('path1600',m.path_1600,'path800',m.path_800,'path320',m.path_320,'status',m.status,'store',m.photo_store)
 from public.dir_place_media m join public.dir_places p on p.id=m.place_id
 where m.id=p_id and m.origin<>'seed' and (case when coalesce(p_staff,false) then m.status<>'removed' else m.status='active' and public.dir_place_public(p.slug) is not null end) $$;

revoke all on function public.dir_place_photo_add(uuid,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.dir_place_photo_add(uuid,uuid,jsonb) to service_role;
revoke all on function public.dir_place_photo_object(uuid,boolean) from public,anon,authenticated;
grant execute on function public.dir_place_photo_object(uuid,boolean) to service_role;

commit;
