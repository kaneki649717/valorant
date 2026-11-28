-- 裁决记录写入/撤销/读取 RPC：前端线上直连，不依赖 8502 端口
-- anon 只能通过这三个函数读写自己的记录，表本身无权限

-- 1) 历史表补 client_id 索引（若不存在）
create index if not exists idx_history_client_id on public.history (client_id);
create index if not exists idx_history_timestamp on public.history (timestamp desc);

-- 2) 写入一条裁决记录
create or replace function public.draw_add(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid text := nullif(btrim(coalesce(p->>'cid', '')), '');
  v_rule text := nullif(btrim(coalesce(p->>'rule_id', '')), '');
  v_content text := coalesce(p->>'content', '');
  v_cat text := coalesce(p->>'category', '');
  v_id bigint;
begin
  if v_cid is null or v_rule is null then
    raise exception 'cid and rule_id required';
  end if;
  if length(v_cid) > 80 or length(v_rule) > 40 or length(v_content) > 2000 or length(v_cat) > 40 then
    raise exception 'field too long';
  end if;

  insert into history (rule_id, content, category, timestamp, client_id)
  values (v_rule, v_content, v_cat, now(), v_cid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

-- 3) 撤销：只删自己的、指定 id 的记录
create or replace function public.draw_undo(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid text := nullif(btrim(coalesce(p->>'cid', '')), '');
  v_ids bigint[] := coalesce(
    (select array_agg(x::bigint) from jsonb_array_elements_text(p->'ids') t(x)),
    '{}'::bigint[]
  );
  v_deleted int := 0;
begin
  if v_cid is null then
    raise exception 'cid required';
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

-- 4) 读取自己的记录
create or replace function public.draw_list(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_cid text := nullif(btrim(coalesce(p->>'cid', '')), '');
  v_limit int := coalesce((p->>'limit')::int, 20);
  v_rows jsonb;
begin
  if v_cid is null then
    raise exception 'cid required';
  end if;
  v_limit := greatest(1, least(v_limit, 100));

  select coalesce(jsonb_agg(row_to_json(t)), '[]'::jsonb) into v_rows
  from (
    select id, rule_id, content, category, client_id,
           to_char(timestamp at time zone 'Asia/Shanghai', 'YYYY-MM-DD HH24:MI:SS') as timestamp
    from history
    where client_id = v_cid
    order by id desc
    limit v_limit
  ) t;

  return jsonb_build_object('ok', true, 'items', v_rows);
end;
$$;

-- 5) 权限：只有这三个 RPC 对 anon 开放
revoke all on function public.draw_add(jsonb) from public;
revoke all on function public.draw_undo(jsonb) from public;
revoke all on function public.draw_list(jsonb) from public;
revoke all on public.history from anon, authenticated;
grant execute on function public.draw_add(jsonb) to anon, authenticated;
grant execute on function public.draw_undo(jsonb) to anon, authenticated;
grant execute on function public.draw_list(jsonb) to anon, authenticated;
