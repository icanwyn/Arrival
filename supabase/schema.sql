-- Arrival tables. Run this in the Supabase SQL editor before the app writes.
-- events is the AttendanceEvent log. Status is not stored.
-- Row level security is on and there are no policies, so the anon key
-- cannot read PINs. The server uses the service role key, which bypasses RLS.

create table if not exists teams (
  id text primary key,
  name text not null
);

create table if not exists students (
  id text primary key,
  team_id text not null references teams (id),
  first_name text not null,
  last_name text not null,
  age integer not null check (age between 1 and 99),
  gender text not null,
  parent_email text not null,
  pin text not null check (pin ~ '^[0-9]{4}$'),
  unique (team_id, pin)
);

create table if not exists sessions (
  id text primary key,
  team_id text not null references teams (id),
  label text not null,
  token text not null unique,
  status text not null check (status in ('open', 'closed'))
);

create unique index if not exists sessions_one_open
  on sessions (team_id) where status = 'open';

create table if not exists events (
  id text primary key,
  session_id text not null references sessions (id),
  student_id text not null references students (id),
  kind text not null check (kind in ('check_in', 'check_out')),
  at text not null,
  tap_id text not null,
  prev_id text references events (id),
  check (kind = 'check_in' or prev_id is not null),
  unique (session_id, student_id, tap_id)
);

create unique index if not exists events_genesis
  on events (session_id, student_id) where prev_id is null;

create unique index if not exists events_child
  on events (prev_id) where prev_id is not null;

create index if not exists events_by_student
  on events (session_id, student_id);

alter table teams enable row level security;
alter table students enable row level security;
alter table sessions enable row level security;
alter table events enable row level security;
