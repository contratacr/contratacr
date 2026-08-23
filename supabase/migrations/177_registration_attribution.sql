-- 177: where each registration came from (marketing attribution).
--
-- Paid campaigns (Meta, TikTok) could only be judged by date coincidence: the
-- app never kept the utm_* parameters or the referrer a person arrived with.
-- The browser captures the FIRST touch (utm_*, fbclid/ttclid, referrer host,
-- landing path) and the register endpoints persist it on the profile, so the
-- admin can answer "how many clients did the August campaign bring" directly.
-- Free-form values are sanitised server-side (lowercase, bounded length).

alter table public.profiles
  add column if not exists acquisition_source text,
  add column if not exists acquisition_medium text,
  add column if not exists acquisition_campaign text,
  add column if not exists acquisition_content text,
  add column if not exists acquisition_landing_path text,
  add column if not exists acquisition_referrer_host text,
  add column if not exists acquisition_captured_at timestamptz;

comment on column public.profiles.acquisition_source is 'First-touch utm_source, or derived from referrer/click id (instagram, facebook, tiktok, google, direct, other).';
comment on column public.profiles.acquisition_medium is 'First-touch utm_medium (paid, organic, referral, social...).';
comment on column public.profiles.acquisition_campaign is 'First-touch utm_campaign.';
comment on column public.profiles.acquisition_content is 'First-touch utm_content (ad/creative name).';
comment on column public.profiles.acquisition_landing_path is 'Path of the first page the visitor landed on.';
comment on column public.profiles.acquisition_referrer_host is 'Host of document.referrer on the first visit, if any.';
comment on column public.profiles.acquisition_captured_at is 'When the browser captured the first touch (not the signup time).';

create index if not exists profiles_acquisition_source_idx
  on public.profiles (acquisition_source, created_at desc);
