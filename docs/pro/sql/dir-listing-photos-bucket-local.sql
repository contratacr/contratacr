-- LOCAL PRO ONLY (multivertical V3 wiring, 2026-11-16): private Storage bucket for directory listing photos.
-- Depends on directory-listings-local.sql (dir_listing_media rows reference these object keys:
-- dir-listings/<photo id>/<1600|800|320>.webp). Private like every Pro bucket: only the service role reads or writes;
-- the public reader (pending) must check that the photo belongs to a public listing before serving it.
-- Idempotent; skipped where Storage is not installed (PGlite).
do $$
begin
 if to_regclass('storage.buckets') is not null then
  insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
   values('dir-listing-photos','dir-listing-photos',false,20971520,array['image/webp','image/jpeg'])
   on conflict(id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;
 end if;
end $$;
