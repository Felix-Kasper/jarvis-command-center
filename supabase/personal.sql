-- JARVIS Personal Manager: Interessen-Profil und Feedback zum Newsletter.
-- Ausführen nach schema.sql, agents.sql und jobs.sql. Nicht-destruktiv (nur create … if not exists).

create table if not exists public.personal_profile (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  interests jsonb not null default '{}'::jsonb,        -- Themen, Orte, Budget, Vorlieben (vom Nutzer)
  artists jsonb not null default '[]'::jsonb,          -- [{"name": "…", "count": 2, "source": "spotify|nutzer"}]
  spotify_tracks jsonb not null default '[]'::jsonb,   -- noch nicht aufgelöste Track-IDs aus „Lieblingssongs“
  learned text,                                        -- vom Agenten gepflegte Kurzfassung: was ankommt, was nicht
  updated_at timestamptz not null default now()
);

create table if not exists public.news_feedback (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  item_key text not null,                              -- stabiler Schlüssel des Newsletter-Eintrags
  report_id uuid references public.agent_reports (id) on delete set null,
  section text,
  title text,
  reaction text not null check (reaction in ('mag', 'nicht', 'gemerkt', 'eingeplant')),
  created_at timestamptz not null default now(),
  primary key (user_id, item_key)
);

alter table public.personal_profile enable row level security;
alter table public.news_feedback enable row level security;

create policy "personal_select_own" on public.personal_profile for select to authenticated using ((select auth.uid()) = user_id);
create policy "personal_insert_own" on public.personal_profile for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "personal_update_own" on public.personal_profile for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "feedback_select_own" on public.news_feedback for select to authenticated using ((select auth.uid()) = user_id);
create policy "feedback_insert_own" on public.news_feedback for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "feedback_update_own" on public.news_feedback for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "feedback_delete_own" on public.news_feedback for delete to authenticated using ((select auth.uid()) = user_id);

create trigger personal_profile_touch before update on public.personal_profile for each row execute function public.touch_updated_at();

-- Depot-Sichtschutz (30.10.2026): nur gesalzener PBKDF2-Hash der PIN, nie die PIN selbst.
alter table public.personal_profile add column if not exists depot_pin jsonb;
