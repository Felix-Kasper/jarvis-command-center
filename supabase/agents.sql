-- JARVIS – Tabellen für das Agenten-Cockpit (am 28.10.2026 per Migration „agents_cockpit“ angelegt).
-- Nur nötig bei einer Neuinstallation: nach schema.sql im SQL Editor ausführen.

create table if not exists public.depot_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  account text not null default 'Depot',
  name text not null,
  wkn text,
  isin text,
  ticker text,
  asset_type text not null default 'Aktie' check (asset_type in ('Aktie', 'ETF', 'Krypto', 'Edelmetall', 'Anleihe', 'Sonstiges')),
  quantity numeric,
  avg_buy_price_eur numeric,
  buy_value_eur numeric,
  market_value_eur numeric,
  value_as_of date,
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists depot_positions_user_active on public.depot_positions (user_id) where active;

create table if not exists public.agents (
  user_id uuid not null references auth.users (id) on delete cascade,
  id text not null,
  name text not null,
  role text not null,
  status text not null default 'bereit' check (status in ('bereit', 'arbeitet', 'fehler', 'pausiert')),
  status_note text,
  schedule_text text,
  last_run_at timestamptz,
  next_run_at timestamptz,
  updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create table if not exists public.agent_reports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  agent_id text not null,
  period text not null,
  title text not null,
  summary text not null,
  data jsonb not null default '{}'::jsonb,
  content_md text not null,
  created_at timestamptz not null default now()
);

create index if not exists agent_reports_user_agent_created on public.agent_reports (user_id, agent_id, created_at desc);

alter table public.depot_positions enable row level security;
alter table public.agents enable row level security;
alter table public.agent_reports enable row level security;

create policy "depot_select_own" on public.depot_positions for select to authenticated using ((select auth.uid()) = user_id);
create policy "depot_insert_own" on public.depot_positions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "depot_update_own" on public.depot_positions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "agents_select_own" on public.agents for select to authenticated using ((select auth.uid()) = user_id);
create policy "reports_select_own" on public.agent_reports for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger depot_positions_touch before update on public.depot_positions
  for each row execute function public.touch_updated_at();
create trigger agents_touch before update on public.agents
  for each row execute function public.touch_updated_at();
