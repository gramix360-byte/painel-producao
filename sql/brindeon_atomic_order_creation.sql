CREATE OR REPLACE FUNCTION public.brindeon_create_order(p_reference uuid, p_order jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO ''
AS $function$
declare o public.orders%rowtype; p public.products%rowtype; v public.product_variants%rowtype; i jsonb; q integer; price numeric; cost numeric; total numeric:=0; paid numeric; n text;
begin
 perform public.koda_assert_role(array['admin','vendas']);
 if p_reference is null then raise exception 'Referência necessária'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_reference::text,0));
 select * into o from public.orders where id=p_reference;
 if found then
  if o.deleted_at is not null then raise exception 'Este pedido foi excluído'; end if;
  return jsonb_build_object('id',o.id,'number',o.order_number,'customer',o.customer_name,'due',o.due_date,'total',o.total_amount,'paid',o.amount_paid,'method',o.payment_method,'status',o.status,'updatedAt',o.updated_at,'items',(select jsonb_agg(jsonb_build_object('product',product_name,'quantity',quantity,'price',unit_price,'personalization',personalization)) from public.order_items where order_id=o.id));
 end if;
 if p_order is null or coalesce(length(trim(p_order->>'customer')),0) not between 1 and 120 or coalesce(p_order->>'phone','') !~ '^[1-9][0-9]{9,14}$' or jsonb_typeof(p_order->'items') is distinct from 'array' then raise exception 'Confira o cliente e os itens'; end if;
 if jsonb_array_length(p_order->'items') not between 1 and 30 or length(coalesce(p_order->>'notes',''))>2000 then raise exception 'Confira os itens e as observações'; end if;
 if coalesce(p_order->>'method','') not in ('pix','cartao_credito','cartao_debito','dinheiro','boleto','transferencia','outro') then raise exception 'Forma de pagamento inválida'; end if;
 for i in select value from jsonb_array_elements(p_order->'items') loop
  q:=(i->>'quantity')::integer;price:=(i->>'price')::numeric;
  if q is null or q not between 1 and 100000 or price is null or price<0 or price>1000000 or price<>round(price,2) or length(coalesce(i->>'personalization',''))>1000 then raise exception 'Quantidade ou valor inválido'; end if;
  select * into p from public.products where id=(i->>'product_id')::uuid and active and deleted_at is null;
  if not found then raise exception 'Produto indisponível'; end if;
  if p.product_kind='variable' then
   select * into v from public.product_variants where id=(i->>'variant_id')::uuid and product_id=p.id and active;
   if not found then raise exception 'Selecione a variação'; end if;
  end if;
  total:=total+q*price;
 end loop;
 paid:=(p_order->>'paid')::numeric;
 if paid is null or paid<0 or paid>total or paid<>round(paid,2) then raise exception 'Valor recebido inválido'; end if;
 n:=public.next_order_number();
 insert into public.orders(id,order_number,customer_name,due_date,priority,notes,status,phase,sales_channel,payment_method,payment_status,amount_paid,total_amount,seller_id)
 values(p_reference,n,trim(p_order->>'customer'),nullif(p_order->>'due','')::date,'normal',
 'Origem: WhatsApp BrindeOn'||chr(10)||'WhatsApp do cliente: +'||(p_order->>'phone')||chr(10)||'Referência: '||p_reference::text||chr(10)||coalesce(p_order->>'notes',''),'aguardando','pedido_recebido','whatsapp',p_order->>'method','pendente',0,0,auth.uid());
 for i in select value from jsonb_array_elements(p_order->'items') loop
  select * into p from public.products where id=(i->>'product_id')::uuid;
  cost:=coalesce(p.cost_price,0);v:=null;
  if p.product_kind='variable' then select * into v from public.product_variants where id=(i->>'variant_id')::uuid;cost:=coalesce(v.cost_price,p.cost_price,0);end if;
  q:=(i->>'quantity')::integer;price:=(i->>'price')::numeric;
  insert into public.order_items(order_id,product_id,variant_id,product_name,quantity,personalization,unit_price,line_total,unit_cost,cost_subtotal)
  values(p_reference,p.id,v.id,p.name||case when v.id is not null then ' - '||v.name else '' end,q,coalesce(i->>'personalization',''),price,q*price,cost,q*cost);
 end loop;
 perform public.adjust_order_stock(p_reference,true);
 update public.orders set amount_paid=paid,payment_status=case when paid=0 then 'pendente' when paid=total then 'pago' else 'parcial' end,updated_at=now() where id=p_reference returning * into o;
 return jsonb_build_object('id',o.id,'number',o.order_number,'customer',o.customer_name,'due',o.due_date,'total',o.total_amount,'paid',o.amount_paid,'method',o.payment_method,'status',o.status,'updatedAt',o.updated_at,'items',(select jsonb_agg(jsonb_build_object('product',product_name,'quantity',quantity,'price',unit_price,'personalization',personalization)) from public.order_items where order_id=o.id));
end $function$
;
revoke all on function public.brindeon_create_order(uuid,jsonb) from public,anon;
grant execute on function public.brindeon_create_order(uuid,jsonb) to authenticated;
