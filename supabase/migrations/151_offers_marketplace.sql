-- Offers marketplace: professionals can publish service or product offers.

create table if not exists public.professional_offers (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references public.professionals(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 20 and 3000),
  offer_type text not null default 'service_offer' check (offer_type in ('service_offer','product','package')),
  service_label text,
  image_urls text[] not null default '{}',
  price_now integer check (price_now is null or price_now >= 0),
  price_before integer check (price_before is null or price_before >= 0),
  currency text not null default 'CRC' check (currency in ('CRC','USD')),
  price_unit text not null default 'total' check (price_unit in ('total','hour','session','project','month')),
  location_label text,
  valid_until date,
  quantity_available integer check (quantity_available is null or quantity_available >= 0),
  status text not null default 'published' check (status in ('draft','published','paused','expired','sold_out')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (cardinality(image_urls) <= 5),
  check (price_before is null or price_now is null or price_before >= price_now)
);

create index if not exists professional_offers_public_index
  on public.professional_offers (status, created_at desc);
create index if not exists professional_offers_professional_index
  on public.professional_offers (professional_id, created_at desc);

alter table public.professional_offers enable row level security;

create policy "Published offers are public"
  on public.professional_offers for select
  using (
    status = 'published'
    or exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals create their offers"
  on public.professional_offers for insert
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals update their offers"
  on public.professional_offers for update
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.profile_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.profile_id = auth.uid()
    )
  );

create policy "Professionals delete their offers"
  on public.professional_offers for delete
  using (
    exists (
      select 1 from public.professionals p
      where p.id = professional_id and p.profile_id = auth.uid()
    )
  );

create or replace function public.touch_professional_offers_updated_at()
returns trigger language plpgsql set search_path = public as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists touch_professional_offers_updated_at on public.professional_offers;
create trigger touch_professional_offers_updated_at before update on public.professional_offers
for each row execute function public.touch_professional_offers_updated_at();

notify pgrst, 'reload schema';
