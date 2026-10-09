revoke all on function public.create_purchase_order_v2(uuid, text, date, text, jsonb) from public, anon;
revoke all on function public.cancel_purchase_order_v2(uuid) from public, anon;
revoke all on function public.receive_purchase_order_v2(uuid, jsonb) from public, anon;
revoke all on function public.koda_create_snapshot() from public, anon;
revoke all on function public.koda_purge_deleted(text, uuid, text) from public, anon;
revoke all on function public.next_order_number() from public, anon;
revoke all on function public.next_quote_number() from public, anon;
revoke all on function public.recalc_variable_product_stock(uuid) from public, anon;

grant execute on function public.create_purchase_order_v2(uuid, text, date, text, jsonb) to authenticated;
grant execute on function public.cancel_purchase_order_v2(uuid) to authenticated;
grant execute on function public.receive_purchase_order_v2(uuid, jsonb) to authenticated;
grant execute on function public.koda_create_snapshot() to authenticated;
grant execute on function public.koda_purge_deleted(text, uuid, text) to authenticated;
grant execute on function public.next_order_number() to authenticated;
grant execute on function public.next_quote_number() to authenticated;
grant execute on function public.recalc_variable_product_stock(uuid) to authenticated;

