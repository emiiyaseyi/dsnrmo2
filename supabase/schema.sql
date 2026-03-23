-- DSN Resource Hub — Supabase Schema v2
-- Paste this into: Supabase Dashboard → SQL Editor → New Query → Run

create extension if not exists "uuid-ossp";

create table if not exists staff_overrides (
  user_id         text primary key,
  pin             text not null default '1234',
  must_change_pin boolean not null default false,
  role            text not null default 'staff',
  points          integer not null default 0,
  badges          jsonb not null default '[]',
  streak          integer not null default 0,
  active          boolean not null default true,
  suspended       boolean not null default false,
  department      text,
  job_title       text,
  updated_at      timestamptz default now()
);

create table if not exists entries (
  id                  text primary key,
  user_id             text not null,
  project             text not null,
  lead                text not null,
  description         text,
  completion_date     text,
  hours               numeric not null default 0,
  category            text,
  status              text not null default 'draft',
  week_num            integer not null,
  week_key            text not null,
  submitted_at        timestamptz,
  reviewed_by         text,
  reviewed_at         timestamptz,
  correction_note     text,
  rejection_comment   text,
  resubmit_note       text,
  flag_note           text,
  flagged             boolean default false,
  edit_history        jsonb default '[]',
  is_mon              boolean default false,
  is_early            boolean default false,
  created_at          timestamptz default now(),
  updated_at          timestamptz default now()
);

create table if not exists audit_log (
  id        text primary key,
  user_id   text not null,
  action    text not null,
  target    text,
  detail    text,
  device    text,
  ts        timestamptz default now()
);

create table if not exists notifications (
  id         text primary key,
  user_id    text not null,
  message    text not null,
  read       boolean not null default false,
  created_at timestamptz default now()
);

create table if not exists messages (
  id         text primary key,
  sender_id  text not null,
  thread_id  text not null,
  body       text not null,
  read_by    jsonb not null default '[]',
  created_at timestamptz default now()
);

create table if not exists leave_requests (
  id          text primary key,
  user_id     text not null,
  start_date  text not null,
  end_date    text not null,
  reason      text,
  status      text not null default 'pending',
  reviewed_by text,
  reviewed_at timestamptz,
  created_at  timestamptz default now()
);

create table if not exists settings (
  key        text primary key,
  value      jsonb not null,
  updated_at timestamptz default now()
);

create table if not exists sessions (
  user_id      text primary key,
  device       text,
  login_at     timestamptz default now(),
  force_logout boolean default false
);

create table if not exists deleted_entries (
  id         text primary key,
  entry      jsonb not null,
  deleted_by text,
  deleted_at timestamptz default now()
);

-- Enable RLS
alter table staff_overrides  enable row level security;
alter table entries           enable row level security;
alter table audit_log         enable row level security;
alter table notifications     enable row level security;
alter table messages          enable row level security;
alter table leave_requests    enable row level security;
alter table settings          enable row level security;
alter table sessions          enable row level security;
alter table deleted_entries   enable row level security;

-- Allow anon full access (app manages its own PIN-based auth)
create policy "anon_all" on staff_overrides  for all to anon using (true) with check (true);
create policy "anon_all" on entries          for all to anon using (true) with check (true);
create policy "anon_all" on audit_log        for all to anon using (true) with check (true);
create policy "anon_all" on notifications    for all to anon using (true) with check (true);
create policy "anon_all" on messages         for all to anon using (true) with check (true);
create policy "anon_all" on leave_requests   for all to anon using (true) with check (true);
create policy "anon_all" on settings         for all to anon using (true) with check (true);
create policy "anon_all" on sessions         for all to anon using (true) with check (true);
create policy "anon_all" on deleted_entries  for all to anon using (true) with check (true);
