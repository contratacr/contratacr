alter table public.user_media_assets
  drop constraint if exists user_media_assets_provider_check;

alter table public.user_media_assets
  add constraint user_media_assets_provider_check
  check (provider in ('cloudinary', 'r2'));
