create sequence if not exists public.purchase_number_seq start 1;

alter table public.purchases add column if not exists purchase_group_id uuid;
alter table public.purchases add column if not exists purchase_number text;
alter table public.purchases add column if not exists received_quantity numeric not null default 0;
alter table public.purchases add column if not exists deleted_at timestamptz;
alter table public.purchases drop constraint if exists purchases_status_check;
alter table public.purchases add constraint purchases_status_check check (status in ('aguardando','parcial','recebido','cancelado'));

update public.purchases
set purchase_group_id = coalesce(purchase_group_id, gen_random_uuid()),
    purchase_number = coalesce(purchase_number, 'COMP-' || lpad(nextval('public.purchase_number_seq')::text, 6, '0')),
    received_quantity = case when status = 'recebido' then quantity else coalesce(received_quantity, 0) end
where purchase_group_id is null or purchase_number is null;

alter table public.purchases alter column purchase_group_id set default gen_random_uuid();
alter table public.purchases alter column purchase_group_id set not null;
create index if not exists purchases_group_idx on public.purchases(purchase_group_id);
create index if not exists purchases_product_open_idx on public.purchases(product_id, status) where deleted_at is null;
create index if not exists purchases_finance_idx on public.purchases(finance_id);

create table if not exists public.purchase_attachments (
  id uuid primary key default gen_random_uuid(),
  purchase_group_id uuid not null,
  file_name text not null,
  storage_path text not null unique,
  mime_type text,
  file_size bigint not null default 0,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  deleted_at timestamptz
);
alter table public.purchase_attachments enable row level security;
revoke all on public.purchase_attachments from anon;
drop policy if exists purchase_attachments_admin_finance on public.purchase_attachments;
create policy purchase_attachments_admin_finance on public.purchase_attachments for all to authenticated
using (public.koda_has_role(array['admin','financeiro']))
with check (public.koda_has_role(array['admin','financeiro']));

insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values ('purchase-documents','purchase-documents',false,15728640,array['application/pdf','image/jpeg','image/png','image/webp'])
on conflict (id) do update set public=false,file_size_limit=excluded.file_size_limit,allowed_mime_types=excluded.allowed_mime_types;

drop policy if exists purchase_documents_select on storage.objects;
drop policy if exists purchase_documents_insert on storage.objects;
drop policy if exists purchase_documents_delete on storage.objects;
create policy purchase_documents_select on storage.objects for select to authenticated
using (bucket_id='purchase-documents' and public.koda_has_role(array['admin','financeiro']));
create policy purchase_documents_insert on storage.objects for insert to authenticated
with check (bucket_id='purchase-documents' and public.koda_has_role(array['admin','financeiro']));
create policy purchase_documents_delete on storage.objects for delete to authenticated
using (bucket_id='purchase-documents' and public.koda_has_role(array['admin','financeiro']));

alter table public.orders add column if not exists marketplace_fee numeric not null default 0;
alter table public.orders add column if not exists shipping_cost numeric not null default 0;
alter table public.orders add column if not exists other_expenses numeric not null default 0;
alter table public.orders add column if not exists net_profit numeric not null default 0;
alter table public.orders add column if not exists net_margin numeric not null default 0;

create or replace function public.sync_order_net_profit() returns trigger language plpgsql security invoker set search_path='' as $$
begin
  new.marketplace_fee := greatest(coalesce(new.marketplace_fee,0),0);
  new.shipping_cost := greatest(coalesce(new.shipping_cost,0),0);
  new.other_expenses := greatest(coalesce(new.other_expenses,0),0);
  new.net_profit := coalesce(new.total_amount,0)-coalesce(new.total_cost,0)-new.marketplace_fee-new.shipping_cost-new.other_expenses;
  new.net_margin := case when coalesce(new.total_amount,0)>0 then (new.net_profit/new.total_amount)*100 else 0 end;
  return new;
end $$;
drop trigger if exists trg_sync_order_net_profit on public.orders;
create trigger trg_sync_order_net_profit before insert or update of total_amount,total_cost,marketplace_fee,shipping_cost,other_expenses on public.orders for each row execute function public.sync_order_net_profit();
update public.orders set marketplace_fee=marketplace_fee;

create or replace function public.create_purchase_order_v2(
  p_supplier_id uuid, p_supplier_name text, p_due_date date,
  p_payment_method text, p_items jsonb
) returns jsonb language plpgsql security definer set search_path='' as $$
declare v_group uuid:=gen_random_uuid(); v_number text; v_finance uuid; v_total numeric:=0; v_item jsonb; v_product public.products%rowtype; v_qty numeric; v_cost numeric; v_count int:=0;
begin
  if not public.koda_has_role(array['admin','financeiro']) then raise exception 'Sem permissão para criar compras'; end if;
  if p_supplier_id is null or nullif(trim(p_supplier_name),'') is null then raise exception 'Fornecedor obrigatório'; end if;
  if jsonb_typeof(p_items)<>'array' or jsonb_array_length(p_items)=0 then raise exception 'Adicione pelo menos um produto'; end if;
  v_number:='COMP-'||lpad(nextval('public.purchase_number_seq')::text,6,'0');
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty:=coalesce((v_item->>'quantity')::numeric,0); v_cost:=coalesce((v_item->>'unit_cost')::numeric,0);
    if v_qty<=0 or v_cost<0 then raise exception 'Quantidade ou custo inválido'; end if;
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid and deleted_at is null and active=true;
    if not found then raise exception 'Produto não encontrado'; end if;
    v_total:=v_total+(v_qty*v_cost); v_count:=v_count+1;
  end loop;
  insert into public.cash_transactions(type,category,description,amount,due_date,payment_method,supplier_name,notes,status,deleted_at)
  values('saida','fornecedor','Pedido de compra '||v_number,v_total,p_due_date,p_payment_method,p_supplier_name,'Compra com '||v_count||' item(ns)','pendente',null) returning id into v_finance;
  for v_item in select value from jsonb_array_elements(p_items) loop
    select * into v_product from public.products where id=(v_item->>'product_id')::uuid;
    v_qty:=(v_item->>'quantity')::numeric; v_cost:=(v_item->>'unit_cost')::numeric;
    insert into public.purchases(purchase_group_id,purchase_number,supplier_id,supplier_name,product_id,product_name,sku,quantity,received_quantity,unit_cost,total_amount,due_date,payment_method,finance_id,status)
    values(v_group,v_number,p_supplier_id,p_supplier_name,v_product.id,v_product.name,v_product.sku,v_qty,0,v_cost,v_qty*v_cost,p_due_date,p_payment_method,v_finance,'aguardando');
  end loop;
  return jsonb_build_object('ok',true,'purchase_group_id',v_group,'purchase_number',v_number,'finance_id',v_finance,'total_amount',v_total,'items',v_count);
end $$;

create or replace function public.receive_purchase_order_v2(p_purchase_group_id uuid,p_receipts jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_receipt jsonb; v_line public.purchases%rowtype; v_product public.products%rowtype; v_qty numeric; v_remaining numeric; v_before numeric; v_new_cost numeric; v_all_received boolean;
begin
  if not public.koda_has_role(array['admin','financeiro']) then raise exception 'Sem permissão para receber compras'; end if;
  if jsonb_typeof(p_receipts)<>'array' then raise exception 'Recebimento inválido'; end if;
  for v_receipt in select value from jsonb_array_elements(p_receipts) loop
    v_qty:=coalesce((v_receipt->>'quantity')::numeric,0);
    if v_qty<=0 then continue; end if;
    select * into v_line from public.purchases where id=(v_receipt->>'purchase_id')::uuid and purchase_group_id=p_purchase_group_id and deleted_at is null for update;
    if not found or v_line.status='cancelado' then raise exception 'Item de compra inválido'; end if;
    v_remaining:=v_line.quantity-v_line.received_quantity;
    if v_qty>v_remaining then raise exception 'Quantidade recebida maior que a pendente'; end if;
    select * into v_product from public.products where id=v_line.product_id for update;
    if not found then raise exception 'Produto não encontrado'; end if;
    v_before:=coalesce(v_product.stock,0);
    v_new_cost:=case when v_before+v_qty>0 then ((v_before*coalesce(v_product.cost_price,0))+(v_qty*v_line.unit_cost))/(v_before+v_qty) else v_line.unit_cost end;
    update public.products set stock=v_before+v_qty,cost_price=round(v_new_cost,4),updated_at=now() where id=v_product.id;
    update public.purchases set received_quantity=received_quantity+v_qty,status=case when received_quantity+v_qty>=quantity then 'recebido' else 'parcial' end,received_at=case when received_quantity+v_qty>=quantity then now() else received_at end,updated_at=now() where id=v_line.id;
  end loop;
  select bool_and(status='recebido') into v_all_received from public.purchases where purchase_group_id=p_purchase_group_id and deleted_at is null and status<>'cancelado';
  return jsonb_build_object('ok',true,'complete',coalesce(v_all_received,false));
end $$;

create or replace function public.cancel_purchase_order_v2(p_purchase_group_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_fin uuid;
begin
  if not public.koda_has_role(array['admin','financeiro']) then raise exception 'Sem permissão para cancelar compras'; end if;
  if exists(select 1 from public.purchases where purchase_group_id=p_purchase_group_id and received_quantity>0 and deleted_at is null) then raise exception 'Não é possível cancelar uma compra que já teve recebimento'; end if;
  select finance_id into v_fin from public.purchases where purchase_group_id=p_purchase_group_id and deleted_at is null limit 1;
  update public.purchases set status='cancelado',updated_at=now() where purchase_group_id=p_purchase_group_id and deleted_at is null;
  if v_fin is not null then update public.cash_transactions set deleted_at=now(),updated_at=now() where id=v_fin; end if;
  return jsonb_build_object('ok',true);
end $$;

grant execute on function public.create_purchase_order_v2(uuid,text,date,text,jsonb) to authenticated;
grant execute on function public.receive_purchase_order_v2(uuid,jsonb) to authenticated;
grant execute on function public.cancel_purchase_order_v2(uuid) to authenticated;
