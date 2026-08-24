-- 178: what ContrataCR costs — the admin "Costos" section.
--
-- Two small tables read and written only by the admin API (service role; no
-- policies, so browsers can never reach them):
--   • admin_cost_services: per-service overrides of the catalogue defaults in
--     src/lib/admin/cost-catalog.ts — the real monthly/annual amount, the date
--     the service started (so lifetime spend can be computed) and a free-text
--     note of the month's usage against the plan's limit.
--   • admin_cost_entries: the ledger of everything actually paid — one-off
--     purchases, ad spend, content pieces — with amount and currency.

create table if not exists public.admin_cost_services (
  service_id text primary key,
  monthly_usd numeric(12,2),
  annual_usd numeric(12,2),
  since date,
  usage_note text,
  usage_updated_at timestamptz,
  notes text,
  updated_at timestamptz not null default now()
);

comment on table public.admin_cost_services is 'Admin-only overrides of the cost catalogue: real amounts, start date and monthly usage note per service.';

create table if not exists public.admin_cost_entries (
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('recurrente', 'unico', 'publicidad', 'contenido')),
  service_id text,
  vendor text not null,
  description text not null,
  amount numeric(12,2) not null check (amount >= 0),
  currency text not null check (currency in ('USD', 'CRC')),
  spent_on date not null,
  quantity integer check (quantity is null or quantity > 0),
  notes text,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

comment on table public.admin_cost_entries is 'Admin-only ledger of money actually spent on ContrataCR (services, ads, content).';

create index if not exists admin_cost_entries_spent_on_idx on public.admin_cost_entries (spent_on desc);

alter table public.admin_cost_services enable row level security;
alter table public.admin_cost_entries enable row level security;

revoke all on table public.admin_cost_services from public, anon, authenticated;
revoke all on table public.admin_cost_entries from public, anon, authenticated;
grant all on table public.admin_cost_services to service_role;
grant all on table public.admin_cost_entries to service_role;
