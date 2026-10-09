create extension if not exists pg_cron;

create or replace function public.koda_create_system_snapshot()
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_id uuid;
  v_snapshot jsonb;
begin
  v_snapshot := jsonb_build_object(
    'created_at', now(),
    'customers', coalesce((select jsonb_agg(to_jsonb(t)) from public.customers t), '[]'::jsonb),
    'products', coalesce((select jsonb_agg(to_jsonb(t)) from public.products t), '[]'::jsonb),
    'materials', coalesce((select jsonb_agg(to_jsonb(t)) from public.materials t), '[]'::jsonb),
    'product_materials', coalesce((select jsonb_agg(to_jsonb(t)) from public.product_materials t), '[]'::jsonb),
    'material_consumptions', coalesce((select jsonb_agg(to_jsonb(t)) from public.material_consumptions t), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(t)) from public.orders t), '[]'::jsonb),
    'order_items', coalesce((select jsonb_agg(to_jsonb(t)) from public.order_items t), '[]'::jsonb),
    'order_quality_checks', coalesce((select jsonb_agg(to_jsonb(t)) from public.order_quality_checks t), '[]'::jsonb),
    'order_timeline', coalesce((select jsonb_agg(to_jsonb(t)) from public.order_timeline t), '[]'::jsonb),
    'quotes', coalesce((select jsonb_agg(to_jsonb(t)) from public.quotes t), '[]'::jsonb),
    'quote_items', coalesce((select jsonb_agg(to_jsonb(t)) from public.quote_items t), '[]'::jsonb),
    'suppliers', coalesce((select jsonb_agg(to_jsonb(t)) from public.suppliers t), '[]'::jsonb),
    'purchases', coalesce((select jsonb_agg(to_jsonb(t)) from public.purchases t), '[]'::jsonb),
    'cash_transactions', coalesce((select jsonb_agg(to_jsonb(t)) from public.cash_transactions t), '[]'::jsonb),
    'marketing_posts', coalesce((select jsonb_agg(to_jsonb(t)) from public.marketing_posts t), '[]'::jsonb),
    'bank_accounts', coalesce((select jsonb_agg(to_jsonb(t)) from public.bank_accounts t), '[]'::jsonb),
    'company_settings', coalesce((select jsonb_agg(to_jsonb(t)) from public.company_settings t), '[]'::jsonb)
  );

  insert into public.koda_backup_snapshots(created_by, snapshot)
  values (null, v_snapshot)
  returning id into v_id;

  delete from public.koda_backup_snapshots
  where created_at < now() - interval '30 days';

  return v_id;
end;
$$;

revoke all on function public.koda_create_system_snapshot() from public, anon, authenticated;
grant execute on function public.koda_create_system_snapshot() to service_role;

do $$
declare
  v_job record;
begin
  for v_job in select jobid from cron.job where jobname = 'brindes-on-daily-backup'
  loop
    perform cron.unschedule(v_job.jobid);
  end loop;
end;
$$;

select cron.schedule(
  'brindes-on-daily-backup',
  '0 6 * * *',
  'select public.koda_create_system_snapshot();'
);

revoke execute on function public.create_purchase_order_v2(uuid, text, date, text, jsonb) from anon;
revoke execute on function public.cancel_purchase_order_v2(uuid) from anon;
revoke execute on function public.receive_purchase_order_v2(uuid, jsonb) from anon;
revoke execute on function public.koda_create_snapshot() from anon;
revoke execute on function public.koda_purge_deleted(text, uuid, text) from anon;
revoke execute on function public.next_order_number() from anon;
revoke execute on function public.next_quote_number() from anon;
revoke execute on function public.recalc_variable_product_stock(uuid) from anon;

