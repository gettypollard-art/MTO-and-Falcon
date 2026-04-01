-- M Web Supabase backend schema
-- Paste this into Supabase SQL Editor and run once.

create extension if not exists pgcrypto;

create table if not exists public.app_backend_state (
  workspace_id text primary key,
  version integer not null default 1,
  templates jsonb not null default '[]'::jsonb,
  requests_by_track jsonb not null default '{"producer":[],"generalManager":[],"joManager":[]}'::jsonb,
  explicit_next_by_track jsonb not null default '{"producer":[],"generalManager":[],"joManager":[]}'::jsonb,
  completed_calendar_by_track jsonb not null default '{"producer":[],"generalManager":[],"joManager":[]}'::jsonb,
  inbox_by_role jsonb not null default '{"ceo":[],"ceoExecutive":[],"generalManager":[],"flowerSales":[],"producer":[],"budtenderTd":[],"budtenderTdJunior":[],"budtenderJo":[],"budtenderJoSenior":[],"budtenderJoJunior":[]}'::jsonb,
  supplies_draft_by_template_id jsonb not null default '{}'::jsonb,
  week_start_by_track jsonb not null default '{"producer":"","generalManager":"","joManager":""}'::jsonb,
  not_needed_this_week_by_track jsonb not null default '{"producer":[],"generalManager":[],"joManager":[]}'::jsonb,
  closing_done_by_track jsonb not null default '{"producer":[],"generalManager":[],"joManager":[]}'::jsonb,
  daily_task_checks_by_role jsonb not null default '{}'::jsonb,
  daily_task_alerts_sent_by_date jsonb not null default '{}'::jsonb,
  producer_restored_closing_done jsonb not null default '[]'::jsonb,
  producer_resource_rows jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_backend_state
  add column if not exists daily_task_checks_by_role jsonb not null default '{}'::jsonb;

alter table public.app_backend_state
  add column if not exists daily_task_alerts_sent_by_date jsonb not null default '{}'::jsonb;

alter table public.app_backend_state
  add column if not exists inbox_by_role jsonb not null default '{"ceo":[],"ceoExecutive":[],"generalManager":[],"flowerSales":[],"producer":[],"budtenderTd":[],"budtenderTdJunior":[],"budtenderJo":[],"budtenderJoSenior":[],"budtenderJoJunior":[]}'::jsonb;

create index if not exists app_backend_state_updated_at_idx
  on public.app_backend_state (updated_at desc);

create or replace function public.touch_app_backend_state_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_touch_app_backend_state_updated_at on public.app_backend_state;
create trigger trg_touch_app_backend_state_updated_at
before update on public.app_backend_state
for each row
execute function public.touch_app_backend_state_updated_at();

alter table public.app_backend_state enable row level security;

drop policy if exists app_backend_state_select_all on public.app_backend_state;
drop policy if exists app_backend_state_insert_all on public.app_backend_state;
drop policy if exists app_backend_state_update_all on public.app_backend_state;
drop policy if exists app_backend_state_delete_all on public.app_backend_state;

-- NOTE: Open policy for prototype mode.
-- Tighten this before production (auth + per-workspace restrictions).
create policy app_backend_state_select_all
  on public.app_backend_state
  for select
  to anon, authenticated
  using (true);

create policy app_backend_state_insert_all
  on public.app_backend_state
  for insert
  to anon, authenticated
  with check (true);

create policy app_backend_state_update_all
  on public.app_backend_state
  for update
  to anon, authenticated
  using (true)
  with check (true);

create policy app_backend_state_delete_all
  on public.app_backend_state
  for delete
  to anon, authenticated
  using (true);

insert into public.app_backend_state (workspace_id)
values ('default')
on conflict (workspace_id) do nothing;
