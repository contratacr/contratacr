-- LOCAL ONLY: repeatable catalog page function definitions.
begin;
create index if not exists pro_movements_recent on public.pro_movements(user_id,"productId",position desc);
create or replace function public.pro_catalog_search(value text) returns text
language sql immutable strict parallel safe as $$
 select translate(lower(value),'áéíóúüñ','aeiouun');
$$;
drop function if exists public.pro_catalog_page(uuid,text,text,text,text,integer);
create or replace function public.pro_catalog_page(p_user uuid,p_kind text,p_search text default '',p_filter text default 'all',p_after text default '',p_limit integer default 20,p_item_type text default 'all') returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare result jsonb;
begin
 if p_item_type not in ('all','product','service') or p_limit<1 or p_limit>100 or length(p_search)>160 or p_filter not in ('all','archived','low') then raise exception 'Invalid page'; end if;
 if p_kind='clients' then
 select coalesce(jsonb_agg(record order by id),'[]') into result from (
 select id,jsonb_strip_nulls(to_jsonb(c)-'user_id'-'position') as record from pro_clients c
 where user_id=p_user and id>p_after and archived=(p_filter='archived')
 and strpos(pro_catalog_search(concat_ws(' ',name,email,phone,identification,"tradeName","group")),pro_catalog_search(p_search))>0
 order by id limit p_limit+1) page;
 elsif p_kind='products' then
 select coalesce(jsonb_agg(record order by id),'[]') into result from (
 select id,jsonb_strip_nulls(to_jsonb(p)-'user_id'-'position') as record from pro_products p
 where user_id=p_user and id>p_after and archived=(p_filter='archived') and (p_item_type='all' or coalesce("itemType",'product')=p_item_type) and (p_filter<>'low' or coalesce("itemType",'product')='product' and minimum>0 and stock<=minimum)
 and strpos(pro_catalog_search(concat_ws(' ',name,sku,category,cabys)),pro_catalog_search(p_search))>0
 order by id limit p_limit+1) page;
 elsif p_kind='movements' then
 select coalesce(jsonb_agg(record order by position desc),'[]') into result from (
 select position,(to_jsonb(m)-'user_id'-'position')||jsonb_build_object('_cursor',position::text) as record from pro_movements m
 where user_id=p_user and (p_after='' or position<nullif(p_after,'')::bigint) and "productId"=p_search order by position desc limit p_limit+1) page;
 else raise exception 'Invalid catalog'; end if;
 return jsonb_build_object('items',(select coalesce(jsonb_agg(e-'_cursor'),'[]') from jsonb_array_elements(result) with ordinality as r(e,n) where n<=p_limit),
 'nextCursor',case when jsonb_array_length(result)>p_limit then coalesce(result->(p_limit-1)->>'_cursor',result->(p_limit-1)->>'id') else null end);
end $$;
revoke all on function public.pro_catalog_page(uuid,text,text,text,text,integer,text) from public,anon,authenticated;
grant execute on function public.pro_catalog_page(uuid,text,text,text,text,integer,text) to service_role;
notify pgrst,'reload schema';
commit;
