create or replace function public.sync_order_operational_phase()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' or new.artwork_status is distinct from old.artwork_status then
    if new.artwork_status = 'pending' then
      new.phase := 'aguardando_aprovacao';
      new.status := 'aguardando';
    elsif new.artwork_status = 'changes_requested' then
      new.phase := 'arte_em_criacao';
      new.status := 'aguardando';
    elsif new.artwork_status = 'approved' and coalesce(new.phase, '') not in ('em_producao','embalado','expedicao','entregue') then
      new.phase := 'arte_aprovada';
      new.status := 'aguardando';
    end if;
  end if;

  if tg_op = 'INSERT' or new.shipping_status is distinct from old.shipping_status then
    if new.shipping_status = 'shipped' then
      new.phase := 'expedicao';
      new.status := 'finalizado';
      new.shipped_at := coalesce(new.shipped_at, now());
    elsif new.shipping_status = 'delivered' then
      new.phase := 'entregue';
      new.status := 'finalizado';
      new.delivered_at := coalesce(new.delivered_at, now());
    end if;
  end if;

  if new.phase = 'em_producao' then
    new.status := 'em_producao';
    new.started_at := coalesce(new.started_at, now());
  elsif new.phase = 'embalado' then
    new.status := 'finalizado';
    new.finished_at := coalesce(new.finished_at, now());
  end if;
  return new;
end
$$;

drop trigger if exists trg_sync_order_operational_phase on public.orders;
create trigger trg_sync_order_operational_phase
before insert or update of artwork_status, shipping_status, phase
on public.orders
for each row execute function public.sync_order_operational_phase();

update public.orders
set phase = case
  when shipping_status = 'delivered' then 'entregue'
  when shipping_status = 'shipped' then 'expedicao'
  when status = 'finalizado' then 'embalado'
  when status = 'em_producao' then 'em_producao'
  when artwork_status = 'approved' then 'arte_aprovada'
  when artwork_status = 'changes_requested' then 'arte_em_criacao'
  when artwork_status = 'pending' then 'aguardando_aprovacao'
  else coalesce(phase, 'pedido_recebido')
end,
updated_at = now()
where deleted_at is null;
