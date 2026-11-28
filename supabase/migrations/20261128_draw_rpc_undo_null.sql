-- draw_undo: ids 为 null 或空数组时，删这个 client 最新一条
create or replace function public.draw_undo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid text := nullif(btrim(coalesce(p->>'cid', '')), '');
  v_ids bigint[] := '{}';
  v_raw jsonb := p->'ids';
  v_deleted int := 0;
begin
  if v_cid is null then
    raise exception 'cid required';
  end if;

  if v_raw is not null and jsonb_typeof(v_raw) = 'array' and v_raw != '[]'::jsonb then
    select coalesce(array_agg(x::bigint), '{}') into v_ids
    from jsonb_array_elements_text(v_raw) t(x);
  end if;

  if array_length(v_ids, 1) is null then
    -- 没给 ids：删这个 client 最新一条
    delete from history h
    using (
      select id from history
      where client_id = v_cid
      order by id desc
      limit 1
    ) latest
    where h.id = latest.id and h.client_id = v_cid;
    get diagnostics v_deleted = row_count;
  else
    delete from history
    where client_id = v_cid and id = any(v_ids);
    get diagnostics v_deleted = row_count;
  end if;

  return jsonb_build_object('ok', true, 'deleted', v_deleted);
end;
$$;

revoke all on function public.draw_undo(jsonb) from public;
grant execute on function public.draw_undo(jsonb) to anon, authenticated;
