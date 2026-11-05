-- JARVIS – Datenbank-Schema für Supabase
-- Einmal im Supabase-Dashboard unter „SQL Editor“ → „New query“ einfügen und „Run“ klicken.
-- Kann gefahrlos mehrfach ausgeführt werden.

create table if not exists public.items (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  id text not null,
  kind text not null check (kind in ('task', 'goals', 'day', 'settings')),
  data jsonb not null,
  updated_at timestamptz not null,           -- Zeitpunkt der Änderung (vom Gerät)
  deleted boolean not null default false,    -- Löschungen werden synchronisiert
  server_updated_at timestamptz not null default now(),
  primary key (user_id, id)
);

create index if not exists items_user_server_updated on public.items (user_id, server_updated_at);

-- Row Level Security: Jeder Nutzer sieht und ändert nur seine eigenen Daten
alter table public.items enable row level security;

drop policy if exists "items_select_own" on public.items;
drop policy if exists "items_insert_own" on public.items;
drop policy if exists "items_update_own" on public.items;
drop policy if exists "items_delete_own" on public.items;

create policy "items_select_own" on public.items for select to authenticated using ((select auth.uid()) = user_id);
create policy "items_insert_own" on public.items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "items_update_own" on public.items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "items_delete_own" on public.items for delete to authenticated using ((select auth.uid()) = user_id);

-- Server-Zeitstempel setzen und veraltete Schreibvorgänge ignorieren
-- (falls ein Gerät offline war und eine ältere Version hochlädt, gewinnt die neuere)
create or replace function public.items_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and new.updated_at < old.updated_at then
    return null; -- ältere Änderung verwerfen
  end if;
  new.server_updated_at := now();
  return new;
end;
$$;

drop trigger if exists items_before_write on public.items;
create trigger items_before_write
  before insert or update on public.items
  for each row execute function public.items_before_write();
