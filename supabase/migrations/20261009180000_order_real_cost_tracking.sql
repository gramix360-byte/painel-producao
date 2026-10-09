-- Track the real cost of each order without duplicating the product recipe.
alter table public.material_consumptions
  add column if not exists actual_quantity numeric,
  add column if not exists actual_unit_cost numeric,
  add column if not exists notes text,
  add column if not exists updated_at timestamptz not null default now();

alter table public.material_consumptions
  drop constraint if exists material_consumptions_actual_quantity_check,
  add constraint material_consumptions_actual_quantity_check
    check (actual_quantity is null or actual_quantity >= 0),
  drop constraint if exists material_consumptions_actual_unit_cost_check,
  add constraint material_consumptions_actual_unit_cost_check
    check (actual_unit_cost is null or actual_unit_cost >= 0);

alter table public.orders
  add column if not exists estimated_cost numeric not null default 0,
  add column if not exists actual_material_cost numeric not null default 0,
  add column if not exists labor_minutes integer not null default 0,
  add column if not exists labor_hourly_rate numeric not null default 0,
  add column if not exists labor_cost numeric not null default 0,
  add column if not exists packaging_cost numeric not null default 0,
  add column if not exists actual_total_cost numeric not null default 0,
  add column if not exists cost_notes text,
  add column if not exists cost_updated_at timestamptz,
  add column if not exists cost_closed_at timestamptz;

alter table public.orders
  drop constraint if exists orders_real_cost_nonnegative_check,
  add constraint orders_real_cost_nonnegative_check check (
    estimated_cost >= 0 and actual_material_cost >= 0 and labor_minutes >= 0
    and labor_hourly_rate >= 0 and labor_cost >= 0 and packaging_cost >= 0
    and actual_total_cost >= 0
  );

update public.orders
set estimated_cost = total_cost,
    actual_material_cost = total_cost,
    actual_total_cost = total_cost
where cost_updated_at is null;

drop policy if exists material_consumptions_read_roles on public.material_consumptions;
create policy material_consumptions_read_roles
on public.material_consumptions for select to authenticated
using (public.koda_has_role(array['admin','vendas','producao','financeiro']));

drop policy if exists material_consumptions_update_roles on public.material_consumptions;
create policy material_consumptions_update_roles
on public.material_consumptions for update to authenticated
using (public.koda_has_role(array['admin','vendas','producao','financeiro']))
with check (public.koda_has_role(array['admin','vendas','producao','financeiro']));

grant select, update on table public.material_consumptions to authenticated;
grant select, update on table public.orders to authenticated;

create or replace function private.adjust_material_stock_from_actual()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old numeric := coalesce(old.actual_quantity, old.quantity, 0);
  v_new numeric := coalesce(new.actual_quantity, new.quantity, 0);
  v_delta numeric := v_new - v_old;
  v_changed integer;
begin
  if not private.koda_trigger_authorized() then
    raise exception 'Operação não autorizada';
  end if;

  if v_delta > 0 then
    update public.materials
       set stock = stock - v_delta, updated_at = now()
     where id = new.material_id and stock >= v_delta;
    get diagnostics v_changed = row_count;
    if v_changed = 0 then
      raise exception 'Estoque de matéria-prima insuficiente para registrar o uso real';
    end if;
  elsif v_delta < 0 then
    update public.materials
       set stock = stock + abs(v_delta), updated_at = now()
     where id = new.material_id;
  end if;

  new.updated_at := now();
  return new;
end;
$$;

drop trigger if exists trg_adjust_material_stock_from_actual on public.material_consumptions;
create trigger trg_adjust_material_stock_from_actual
before update of actual_quantity on public.material_consumptions
for each row execute function private.adjust_material_stock_from_actual();

create or replace function private.restore_item_materials(p_order_item_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.koda_trigger_authorized() then
    raise exception 'Operação não autorizada';
  end if;

  update public.materials m
     set stock = m.stock + coalesce(c.actual_quantity, c.quantity),
         updated_at = now()
    from public.material_consumptions c
   where c.order_item_id = p_order_item_id
     and m.id = c.material_id;

  delete from public.material_consumptions
   where order_item_id = p_order_item_id;
end;
$$;

create or replace function public.sync_order_financial_totals()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare v_order uuid;
begin
  v_order := coalesce(new.order_id, old.order_id);
  update public.orders o set
    total_amount = coalesce(x.sales, 0),
    estimated_cost = coalesce(x.cost, 0),
    total_cost = case when o.cost_updated_at is null then coalesce(x.cost, 0) else o.total_cost end,
    gross_profit = coalesce(x.sales, 0) - case when o.cost_updated_at is null then coalesce(x.cost, 0) else o.total_cost end,
    profit_margin = case when coalesce(x.sales, 0) > 0 then
      ((coalesce(x.sales, 0) - case when o.cost_updated_at is null then coalesce(x.cost, 0) else o.total_cost end) / x.sales) * 100
      else 0 end,
    updated_at = now()
  from (
    select coalesce(sum(line_total), 0) sales, coalesce(sum(cost_subtotal), 0) cost
    from public.order_items where order_id = v_order
  ) x
  where o.id = v_order;
  return coalesce(new, old);
end;
$$;

revoke all on function public.sync_order_financial_totals() from public, anon, authenticated;
revoke all on function private.adjust_material_stock_from_actual() from public, anon, authenticated;

notify pgrst, 'reload schema';
