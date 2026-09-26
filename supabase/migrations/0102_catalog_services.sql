-- Phase 7B: atomic source identity, ranked per-source search, atomic kit forks.
create or replace function public.srv_catalog_identity(p_product jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id uuid;
  v_gtin text := nullif(p_product->>'gtin', '');
  v_upid text := nullif(p_product->>'upid', '');
  v_brand text := nullif(btrim(p_product->>'brand'), '');
  v_mpn text := nullif(btrim(p_product->>'mpn'), '');
begin
  if p_product->>'source' not in ('demomart','upcitemdb','icecat','openfoodfacts','ebay')
    or nullif(p_product->>'externalId','') is null then
    raise exception 'invalid catalog identity';
  end if;
  if v_gtin is not null then
    if not public.is_valid_gtin(v_gtin) then raise exception 'invalid GTIN'; end if;
    v_gtin := lpad(v_gtin,14,'0');
  end if;
  -- One short critical section prevents different sources racing on different identity keys.
  perform pg_advisory_xact_lock(70420702);
  select product_id into v_id from public.product_external_refs
    where source=p_product->>'source' and external_id=p_product->>'externalId';
  if v_id is not null then
    if v_gtin is not null and exists(select 1 from public.products where id=v_id and gtin is not null and lpad(gtin,14,'0')<>v_gtin) then
      raise exception 'source identity changed GTIN';
    end if;
  elsif v_gtin is not null then
    select id into v_id from public.products where lpad(gtin,14,'0')=v_gtin order by created_at,id limit 1;
  end if;
  if v_id is null and v_upid is not null then
    select id into v_id from public.products where upid=v_upid
      and (v_gtin is null or gtin is null or lpad(gtin,14,'0')=v_gtin) order by created_at,id limit 1;
  end if;
  if v_id is null and v_brand is not null and v_mpn is not null then
    -- Ambiguous brand/MPN is not evidence of identity. Never override a contradictory GTIN/UPID.
    select min(id::text)::uuid into v_id from public.products
      where lower(btrim(brand))=lower(v_brand) and lower(btrim(mpn))=lower(v_mpn)
      and (v_gtin is null or gtin is null or lpad(gtin,14,'0')=v_gtin)
      and (v_upid is null or upid is null or upid=v_upid) having count(*)=1;
  end if;
  if v_id is null then
    insert into public.products(source,external_id,title,brand,gtin,mpn,upid,category,roles,attributes,image_url)
    values(p_product->>'source',p_product->>'externalId',p_product->>'title',v_brand,v_gtin,v_mpn,v_upid,
      p_product->>'category',array(select jsonb_array_elements_text(coalesce(p_product->'roles','[]'))),
      coalesce(p_product->'attributes','{}'),p_product->>'imageUrl') returning id into v_id;
  else
    update public.products set gtin=coalesce(gtin,v_gtin), upid=coalesce(upid,v_upid),
      brand=coalesce(brand,v_brand),mpn=coalesce(mpn,v_mpn) where id=v_id;
  end if;
  insert into public.product_external_refs(product_id,source,external_id,gtin,upid,url)
    values(v_id,p_product->>'source',p_product->>'externalId',v_gtin,v_upid,p_product->>'url')
    on conflict(source,external_id) do update set gtin=coalesce(excluded.gtin,product_external_refs.gtin),
      upid=coalesce(excluded.upid,product_external_refs.upid),url=coalesce(excluded.url,product_external_refs.url);
  return v_id;
end;
$$;
revoke all on function public.srv_catalog_identity(jsonb) from public,anon,authenticated;
grant execute on function public.srv_catalog_identity(jsonb) to service_role;

create or replace function public.catalog_search_products(p_query text, p_source text, p_limit integer default 20, p_ids uuid[] default null)
returns table(product_id uuid, rank real) language sql stable security invoker
set search_path='' as $$
  with q as (select btrim(p_query) raw, websearch_to_tsquery('english',p_query) ts)
  select p.id,(ts_rank(p.search_tsv,q.ts)+extensions.word_similarity(q.raw,p.title))::real
  from public.products p,q
  where char_length(q.raw) between 1 and 200
    and (p.source=p_source or exists(select 1 from public.product_external_refs r where r.product_id=p.id and r.source=p_source))
    and (case when p_ids is not null then p.id=any(p_ids) else p.search_tsv@@q.ts or extensions.word_similarity(q.raw,p.title)>=0.3 end)
  order by 2 desc,p.title,p.id limit least(greatest(p_limit,1),100);
$$;
revoke all on function public.catalog_search_products(text,text,integer,uuid[]) from public;
grant execute on function public.catalog_search_products(text,text,integer,uuid[]) to anon,authenticated,service_role;

create or replace function public.srv_fork_kit(p_user_id uuid,p_slug text,p_specs jsonb,p_hash text)
returns jsonb language plpgsql security definer set search_path='' as $$
declare
  v_kit public.kits; v_plan uuid; v_set uuid; v_basket uuid; v_item record; v_offer uuid; v_expected jsonb;
begin
  select * into v_kit from public.kits where slug=p_slug for share;
  if not found then raise exception 'kit_not_found'; end if;
  -- Detect edits between the server's validated hash calculation and this transaction.
  select coalesce(jsonb_agg((spec || jsonb_build_object('id',requirement_key,'importance',importance,'provenance',
    jsonb_build_object('kind','pack_default','pack',v_kit.pack,'ruleId',requirement_key))) order by requirement_key),'[]')
    into v_expected from public.kit_requirements where kit_slug=p_slug;
  if p_specs is distinct from v_expected then raise exception 'kit_changed'; end if;
  insert into public.plans(user_id,title,brief,packs) values(p_user_id,v_kit.title,v_kit.description,array[v_kit.pack]) returning id into v_plan;
  insert into public.requirement_sets(plan_id,version,hash,created_by) values(v_plan,1,p_hash,'kit:'||p_slug) returning id into v_set;
  insert into public.requirements(set_id,requirement_key,spec,importance,provenance_kind)
    select v_set,s->>'id',s,(s->>'importance')::public.requirement_importance,'pack_default'
    from jsonb_array_elements(p_specs) s;
  insert into public.baskets(plan_id,label) values(v_plan,'A') returning id into v_basket;
  for v_item in select * from public.kit_items where kit_slug=p_slug order by sort_order,id loop
    select id into v_offer from public.offers where product_id=v_item.product_id
      order by reference_only, (source='demomart') desc, (availability in ('in_stock','limited')) desc,retrieved_at desc,id limit 1;
    if v_offer is null then raise exception 'kit_offer_unavailable'; end if;
    insert into public.basket_items(basket_id,role,offer_id,qty) values(v_basket,v_item.role,v_offer,v_item.qty);
  end loop;
  return jsonb_build_object('planId',v_plan,'setId',v_set,'basketId',v_basket);
end;
$$;
revoke all on function public.srv_fork_kit(uuid,text,jsonb,text) from public,anon,authenticated;
grant execute on function public.srv_fork_kit(uuid,text,jsonb,text) to service_role;
