-- Apple Health -> iOS Shortcuts -> account-scoped daily measurements.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

create table public.health_connections (
  user_id uuid primary key references auth.users(id) on delete cascade,
  token_hash text not null unique,
  last_sync_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.health_connections enable row level security;
revoke all on public.health_connections from anon, authenticated;

create table public.health_entries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  type text not null check (type in ('hr', 'hrv', 'sleep', 'steps')),
  value numeric not null,
  date date not null,
  created_at bigint not null,
  bedtime text,
  wake_time text,
  unique (user_id, type, date),
  check (
    (type = 'hr' and value between 25 and 240) or
    (type = 'hrv' and value between 1 and 300) or
    (type = 'sleep' and value between 0 and 24) or
    (type = 'steps' and value between 0 and 100000 and value = trunc(value))
  )
);
alter table public.health_entries enable row level security;
revoke all on public.health_entries from anon, authenticated;
grant select on public.health_entries to authenticated;
create policy health_read_own on public.health_entries for select to authenticated
  using ((select auth.uid()) = user_id);

create function public.health_connect() returns text
language plpgsql security definer set search_path = '' as $$
declare token text;
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  token := encode(extensions.gen_random_bytes(32), 'hex');
  insert into public.health_connections(user_id, token_hash)
    values (auth.uid(), encode(extensions.digest(token, 'sha256'), 'hex'))
  on conflict(user_id) do update set token_hash = excluded.token_hash;
  return token;
end;
$$;

create function public.health_disconnect() returns void
language sql security definer set search_path = '' as $$
  delete from public.health_connections where user_id = auth.uid();
$$;

create function public.health_status() returns jsonb
language sql security definer set search_path = '' as $$
  select coalesce(
    (select jsonb_build_object('connected', true, 'last_sync_at', last_sync_at)
       from public.health_connections where user_id = auth.uid()),
    '{"connected":false}'::jsonb);
$$;

-- Narrow, write-only capability: the token can only submit validated daily records.
-- Account identity is always resolved from its hash, never from the request.
create function public.health_ingest(token text, records jsonb) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  owner_id uuid;
  item jsonb;
  metric text;
  day date;
  measurement numeric;
  count_written integer := 0;
begin
  if token is null or length(token) <> 64 then raise exception 'Invalid connection'; end if;
  select user_id into owner_id from public.health_connections
    where token_hash = encode(extensions.digest(token, 'sha256'), 'hex') for update;
  if owner_id is null then raise exception 'Invalid connection'; end if;
  if jsonb_typeof(records) is distinct from 'array' then raise exception 'Expected records array'; end if;
  if jsonb_array_length(records) not between 1 and 400 then raise exception 'Send 1 to 400 daily records'; end if;
  for item in select value from jsonb_array_elements(records) loop
    metric := item->>'type';
    if jsonb_typeof(item->'value') is distinct from 'number'
      or coalesce(item->>'date', '') !~ '^\d{4}-\d{2}-\d{2}$'
      or coalesce(metric, '') not in ('hr', 'hrv', 'sleep', 'steps')
    then raise exception 'Invalid measurement'; end if;
    day := (item->>'date')::date;
    measurement := (item->>'value')::numeric;
    if day < current_date - 90 or day > current_date + 1 then raise exception 'Date outside sync window'; end if;
    insert into public.health_entries(user_id, type, value, date, created_at)
      values(owner_id, metric, measurement, day, floor(extract(epoch from clock_timestamp()) * 1000)::bigint)
    on conflict(user_id, type, date) do update
      set value = excluded.value, created_at = excluded.created_at;
    count_written := count_written + 1;
  end loop;
  update public.health_connections set last_sync_at = now() where user_id = owner_id;
  return jsonb_build_object('accepted', count_written);
end;
$$;

revoke all on function public.health_connect() from public, anon;
revoke all on function public.health_disconnect() from public, anon;
revoke all on function public.health_status() from public, anon;
grant execute on function public.health_connect(), public.health_disconnect(), public.health_status() to authenticated;
revoke all on function public.health_ingest(text, jsonb) from public;
grant execute on function public.health_ingest(text, jsonb) to anon, authenticated;
