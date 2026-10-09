-- Restrict company settings to administrators while preserving read access.
drop policy if exists company_settings_write on public.company_settings;
drop policy if exists company_settings_admin_insert on public.company_settings;
drop policy if exists company_settings_admin_update on public.company_settings;
drop policy if exists company_settings_admin_delete on public.company_settings;

create policy company_settings_admin_insert
on public.company_settings for insert to authenticated
with check (public.koda_has_role(array['admin']));

create policy company_settings_admin_update
on public.company_settings for update to authenticated
using (public.koda_has_role(array['admin']))
with check (public.koda_has_role(array['admin']));

create policy company_settings_admin_delete
on public.company_settings for delete to authenticated
using (public.koda_has_role(array['admin']));

-- Avoid re-evaluating auth.uid() for every row.
drop policy if exists user_profiles_self_read on public.user_profiles;
create policy user_profiles_self_read
on public.user_profiles for select to authenticated
using ((user_id = (select auth.uid())) or public.is_admin());

drop policy if exists "ml connections own read" on public.mercadolivre_connections;
create policy "ml connections own read"
on public.mercadolivre_connections for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "ml order links own read" on public.mercadolivre_order_links;
create policy "ml order links own read"
on public.mercadolivre_order_links for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "ml publications own read" on public.mercadolivre_publications;
create policy "ml publications own read"
on public.mercadolivre_publications for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists ml_variant_links_user_scope on public.mercadolivre_variant_links;
create policy ml_variant_links_user_scope
on public.mercadolivre_variant_links for all to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

-- Trigger functions and internal helpers must not be callable anonymously.
revoke all on function public.audit_changes() from public, anon;
revoke all on function public.current_user_role() from public, anon;
revoke all on function public.handle_new_user_profile() from public, anon;
revoke all on function public.is_admin() from public, anon;
revoke all on function public.koda_assert_role(text[]) from public, anon;
revoke all on function public.koda_current_role() from public, anon;
revoke all on function public.koda_has_role(text[]) from public, anon;
revoke all on function public.koda_rpc_guard() from public, anon;
revoke all on function public.sync_order_financial_totals() from public, anon;
revoke all on function public.sync_order_receipt_to_cash_flow() from public, anon;

-- Keep only the authenticated grants required by policies and RPC guards.
grant execute on function public.current_user_role() to authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.koda_assert_role(text[]) to authenticated;
grant execute on function public.koda_current_role() to authenticated;
grant execute on function public.koda_has_role(text[]) to authenticated;
grant execute on function public.koda_rpc_guard() to authenticated;

-- Remove the duplicated marketing date index.
drop index if exists public.marketing_posts_date_idx;

-- Cover foreign keys used by joins and deletes.
create index if not exists artwork_approvals_order_file_id_idx on public.artwork_approvals(order_file_id);
create index if not exists koda_settings_updated_by_idx on public.koda_settings(updated_by);
create index if not exists marketing_posts_created_by_idx on public.marketing_posts(created_by);
create index if not exists marketing_posts_product_id_idx on public.marketing_posts(product_id);
create index if not exists material_consumptions_material_id_idx on public.material_consumptions(material_id);
create index if not exists material_consumptions_order_id_idx on public.material_consumptions(order_id);
create index if not exists material_consumptions_product_id_idx on public.material_consumptions(product_id);
create index if not exists mercadolivre_auth_states_user_id_idx on public.mercadolivre_auth_states(user_id);
create index if not exists mercadolivre_publications_product_id_idx on public.mercadolivre_publications(product_id);
create index if not exists mercadolivre_variant_links_product_variant_id_idx on public.mercadolivre_variant_links(product_variant_id);
create index if not exists order_files_order_id_idx on public.order_files(order_id);
create index if not exists order_items_product_id_idx on public.order_items(product_id);
create index if not exists orders_quality_completed_by_idx on public.orders(quality_completed_by);
create index if not exists product_components_component_variant_id_idx on public.product_components(component_variant_id);
create index if not exists product_images_product_id_idx on public.product_images(product_id);
create index if not exists product_materials_material_id_idx on public.product_materials(material_id);
create index if not exists quote_items_quote_id_idx on public.quote_items(quote_id);
