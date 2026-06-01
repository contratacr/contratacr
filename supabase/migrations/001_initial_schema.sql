-- ContrataCR Initial Schema
-- Run in Supabase SQL Editor

-- Extensions
create extension if not exists "uuid-ossp";

-- ============================================================
-- PROFILES (extends auth.users)
-- ============================================================
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  cedula text unique not null,
  full_name text not null,
  email text not null,
  phone text,
  role text not null check (role in ('client', 'professional')) default 'client',
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.profiles enable row level security;
create policy "Users can view their own profile" on public.profiles
  for select using (auth.uid() = id);
create policy "Users can update their own profile" on public.profiles
  for update using (auth.uid() = id);
create policy "Public profiles are viewable by everyone" on public.profiles
  for select using (true);

-- ============================================================
-- PROVINCIAS (reference table)
-- ============================================================
create table public.provincias (
  id text primary key,
  name text not null
);

-- ============================================================
-- CANTONES (reference table)
-- ============================================================
create table public.cantones (
  id text primary key,
  name text not null,
  provincia_id text references public.provincias(id) not null
);

-- ============================================================
-- CATEGORIES (reference table)
-- ============================================================
create table public.categories (
  id text primary key,
  name text not null,
  icon text not null,
  is_active boolean default true
);

-- ============================================================
-- PROFESSIONALS
-- ============================================================
create table public.professionals (
  id uuid default uuid_generate_v4() primary key,
  profile_id uuid references public.profiles(id) on delete cascade unique not null,
  category_id text references public.categories(id) not null,
  bio text not null,
  whatsapp text not null,
  hourly_rate integer, -- in CRC colones
  provincia_id text references public.provincias(id) not null,
  canton_id text references public.cantones(id) not null,
  service_radius_km integer,
  years_experience integer,
  is_verified boolean default false,
  is_featured boolean default false,
  is_available boolean default true,
  rating_avg numeric(3,2) default 0,
  review_count integer default 0,
  portfolio_urls text[] default '{}',
  slug text unique not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.professionals enable row level security;
create policy "Professionals are publicly viewable" on public.professionals
  for select using (true);
create policy "Professionals can update their own profile" on public.professionals
  for update using (
    auth.uid() = (select profile_id from public.professionals where id = professionals.id)
  );

-- Indexes
create index professionals_category_idx on public.professionals(category_id);
create index professionals_provincia_idx on public.professionals(provincia_id);
create index professionals_canton_idx on public.professionals(canton_id);
create index professionals_rating_idx on public.professionals(rating_avg desc);
create index professionals_slug_idx on public.professionals(slug);

-- ============================================================
-- REVIEWS
-- ============================================================
create table public.reviews (
  id uuid default uuid_generate_v4() primary key,
  professional_id uuid references public.professionals(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  rating integer not null check (rating between 1 and 5),
  comment text not null,
  created_at timestamptz not null default now(),
  unique(professional_id, client_id)
);

-- RLS
alter table public.reviews enable row level security;
create policy "Reviews are publicly viewable" on public.reviews
  for select using (true);
create policy "Authenticated clients can create reviews" on public.reviews
  for insert with check (auth.uid() = client_id);
create policy "Clients can update their own reviews" on public.reviews
  for update using (auth.uid() = client_id);

-- Trigger: update professional rating when review is added/updated
create or replace function update_professional_rating()
returns trigger as $$
begin
  update public.professionals
  set
    rating_avg = (
      select round(avg(rating)::numeric, 2)
      from public.reviews
      where professional_id = coalesce(new.professional_id, old.professional_id)
    ),
    review_count = (
      select count(*)
      from public.reviews
      where professional_id = coalesce(new.professional_id, old.professional_id)
    )
  where id = coalesce(new.professional_id, old.professional_id);
  return new;
end;
$$ language plpgsql security definer;

create trigger on_review_change
  after insert or update or delete on public.reviews
  for each row execute function update_professional_rating();

-- ============================================================
-- BOOKINGS (appointment requests — no payment)
-- ============================================================
create table public.bookings (
  id uuid default uuid_generate_v4() primary key,
  professional_id uuid references public.professionals(id) on delete cascade not null,
  client_id uuid references public.profiles(id) on delete cascade not null,
  service_description text not null,
  preferred_date date,
  status text not null check (status in ('pending', 'confirmed', 'cancelled', 'completed')) default 'pending',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS
alter table public.bookings enable row level security;
create policy "Clients see their own bookings" on public.bookings
  for select using (auth.uid() = client_id);
create policy "Professionals see their own bookings" on public.bookings
  for select using (
    auth.uid() = (
      select profile_id from public.professionals where id = professional_id
    )
  );
create policy "Clients can create bookings" on public.bookings
  for insert with check (auth.uid() = client_id);

-- ============================================================
-- SEED: Provincias & Cantones
-- ============================================================
insert into public.provincias (id, name) values
  ('sj', 'San José'),
  ('al', 'Alajuela'),
  ('ca', 'Cartago'),
  ('he', 'Heredia'),
  ('gu', 'Guanacaste'),
  ('pu', 'Puntarenas'),
  ('li', 'Limón');

insert into public.cantones (id, name, provincia_id) values
  ('sj-sj', 'San José', 'sj'), ('sj-es', 'Escazú', 'sj'), ('sj-de', 'Desamparados', 'sj'),
  ('sj-pu', 'Puriscal', 'sj'), ('sj-go', 'Goicoechea', 'sj'), ('sj-sa', 'Santa Ana', 'sj'),
  ('sj-al', 'Alajuelita', 'sj'), ('sj-ti', 'Tibás', 'sj'), ('sj-mo2', 'Moravia', 'sj'),
  ('sj-cu', 'Curridabat', 'sj'), ('sj-pm', 'Pérez Zeledón', 'sj'),
  ('al-al', 'Alajuela', 'al'), ('al-sa', 'San Ramón', 'al'), ('al-gr', 'Grecia', 'al'),
  ('al-na', 'Naranjo', 'al'), ('al-pa', 'Palmares', 'al'), ('al-sc', 'San Carlos', 'al'),
  ('ca-ca', 'Cartago', 'ca'), ('ca-pa', 'Paraíso', 'ca'), ('ca-lu', 'La Unión', 'ca'),
  ('ca-tu', 'Turrialba', 'ca'),
  ('he-he', 'Heredia', 'he'), ('he-ba', 'Barva', 'he'), ('he-sd', 'Santo Domingo', 'he'),
  ('he-sa', 'Santa Bárbara', 'he'), ('he-be', 'Belén', 'he'),
  ('gu-li', 'Liberia', 'gu'), ('gu-ni', 'Nicoya', 'gu'), ('gu-sc', 'Santa Cruz', 'gu'),
  ('pu-pu', 'Puntarenas', 'pu'), ('pu-es', 'Esparza', 'pu'),
  ('li-li', 'Limón', 'li'), ('li-po', 'Pococí', 'li'), ('li-si', 'Siquirres', 'li');

insert into public.categories (id, name, icon) values
  ('plomeria', 'Plomería', '🔧'),
  ('electricidad', 'Electricidad', '⚡'),
  ('construccion', 'Construcción', '🏗️'),
  ('pintura', 'Pintura', '🖌️'),
  ('jardineria', 'Jardinería', '🌿'),
  ('limpieza', 'Limpieza', '🧹'),
  ('carpinteria', 'Carpintería', '🪵'),
  ('tecnologia', 'Tecnología / TI', '💻'),
  ('ensenanza', 'Enseñanza / Tutorías', '📚'),
  ('belleza', 'Belleza / Estética', '💅'),
  ('mascotas', 'Veterinaria / Mascotas', '🐾'),
  ('mecanica', 'Mecánica', '🔩'),
  ('mudanzas', 'Mudanzas', '📦'),
  ('seguridad', 'Seguridad', '🔐'),
  ('contabilidad', 'Contabilidad / Legal', '📊'),
  ('diseno', 'Diseño / Arte', '🎨');
