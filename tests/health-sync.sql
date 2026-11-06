-- Run after the migration in a disposable Supabase database as postgres.
begin;
insert into auth.users(id) values
 ('10000000-0000-4000-8000-000000000001'),
 ('10000000-0000-4000-8000-000000000002');
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
do $$ begin perform set_config('test.health_token',public.health_connect(),true); end $$;
set local role anon;
select public.health_ingest(current_setting('test.health_token'), jsonb_build_array(
 jsonb_build_object('type','steps','date',current_date,'value',100)));
select public.health_ingest(current_setting('test.health_token'), jsonb_build_array(
 jsonb_build_object('type','steps','date',current_date,'value',200)));
do $$ begin
  begin
    perform public.health_ingest(current_setting('test.health_token'), jsonb_build_array(
      jsonb_build_object('type','steps','date',current_date,'value',201),
      jsonb_build_object('type','hr','date',current_date,'value',999)));
    raise exception 'Expected validation error';
  exception when check_violation then null;
  end;
end $$;
set local role authenticated;
do $$ begin
  if (select count(*) from public.health_entries) <> 1
    or (select value from public.health_entries limit 1) <> 200 then
    raise exception 'Upsert or atomic validation failed';
  end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
do $$ begin
  if exists (select 1 from public.health_entries) then raise exception 'RLS leaked another account'; end if;
end $$;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.health_disconnect();
set local role anon;
do $$ begin
  begin
    perform public.health_ingest(current_setting('test.health_token'), jsonb_build_array(
      jsonb_build_object('type','steps','date',current_date,'value',300)));
    raise exception 'Revoked token was accepted';
  exception when raise_exception then
    if sqlerrm <> 'Invalid connection' then raise; end if;
  end;
end $$;
reset role;
rollback;
