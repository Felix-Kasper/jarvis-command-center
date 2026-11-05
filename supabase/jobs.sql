-- JARVIS – Bewerbungs-System (am 28.10.2026 per Migration „job_agents“ angelegt).
-- Nur bei einer Neuinstallation nötig: nach schema.sql und agents.sql im SQL Editor ausführen.

create table if not exists public.job_profile (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  full_name text,
  application_email text,
  phone text,
  location text,
  linkedin_url text,
  headline text,
  cv_text text,
  languages text,
  experience text,
  skills text,
  preferences jsonb not null default '{}'::jsonb,
  tone text,
  updated_at timestamptz not null default now()
);

create table if not exists public.agent_instructions (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  agent_id text not null,
  focus text not null default '',
  updated_at timestamptz not null default now(),
  primary key (user_id, agent_id)
);

create table if not exists public.job_leads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  dedup_key text not null,
  kind text not null default 'stelle' check (kind in ('stelle', 'initiativ')),
  source text,
  company text not null,
  title text not null,
  location text,
  url text,
  apply_channel text not null default 'portal' check (apply_channel in ('email', 'portal', 'linkedin', 'sonstiges')),
  apply_email text,
  contact_name text,
  posted_at date,
  deadline date,
  salary text,
  language text,
  match_score int check (match_score between 0 and 100),
  keywords jsonb not null default '[]'::jsonb,
  summary text,
  requirements text,
  why_fit text,
  pre_info text,
  status text not null default 'neu' check (status in ('neu', 'entwurf', 'beworben', 'interview', 'absage', 'verworfen')),
  email_subject text,
  email_body text,
  cover_letter_md text,
  cv_highlights text,
  drafted_at timestamptz,
  applied_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, dedup_key)
);

create index if not exists job_leads_user_status on public.job_leads (user_id, status, match_score desc);

alter table public.job_profile enable row level security;
alter table public.agent_instructions enable row level security;
alter table public.job_leads enable row level security;

create policy "profile_select_own" on public.job_profile for select to authenticated using ((select auth.uid()) = user_id);
create policy "profile_insert_own" on public.job_profile for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "profile_update_own" on public.job_profile for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "instructions_select_own" on public.agent_instructions for select to authenticated using ((select auth.uid()) = user_id);
create policy "instructions_insert_own" on public.agent_instructions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy "instructions_update_own" on public.agent_instructions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy "leads_select_own" on public.job_leads for select to authenticated using ((select auth.uid()) = user_id);
create policy "leads_update_own" on public.job_leads for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create trigger job_profile_touch before update on public.job_profile for each row execute function public.touch_updated_at();
create trigger agent_instructions_touch before update on public.agent_instructions for each row execute function public.touch_updated_at();
create trigger job_leads_touch before update on public.job_leads for each row execute function public.touch_updated_at();

-- Archiv mit Grund und Löschen (Migration „job_leads_archive“, 02.11.2026).
-- Gelöschte Treffer bleiben als Status 'geloescht' stehen: So findet der Job-Scout sie nicht erneut (dedup_key).
alter table public.job_leads add column if not exists archive_reason text;
alter table public.job_leads drop constraint if exists job_leads_status_check;
alter table public.job_leads add constraint job_leads_status_check
  check (status in ('neu', 'entwurf', 'beworben', 'interview', 'absage', 'verworfen', 'geloescht'));
