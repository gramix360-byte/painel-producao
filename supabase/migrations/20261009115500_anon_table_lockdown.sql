do $$
declare
  v_table record;
begin
  for v_table in
    select format('%I.%I', schemaname, tablename) as qualified_name
    from pg_tables
    where schemaname = 'public'
  loop
    execute format('revoke all privileges on table %s from anon', v_table.qualified_name);
  end loop;
end;
$$;

alter function public.set_updated_at() set search_path = public, pg_temp;
alter function public.koda_block_hard_delete() set search_path = public, pg_temp;

