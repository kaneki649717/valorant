-- draw_add 支持传入原始时间戳（迁移老记录时保留真实时间）
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
  v_ts_raw text := nullif(btrim(coalesce(p->>'timestamp', '')), '');
  v_ts timestamptz;
  v_id bigint;
begin
  if v_cid is null or v_rule is null then
    raise exception 'cid and rule_id required';
  end if;
  if length(v_cid) > 80 or length(v_rule) > 40 or length(v_content) > 2000 or length(v_cat) > 40 then
    raise exception 'field too long';
  end if;

  -- 允许传时间戳，但只认合理范围：不早于 2024-01-01，不晚于未来 5 分钟
  if v_ts_raw is not null then
    begin
      v_ts := v_ts_raw::timestamptz;
    exception when others then
      v_ts := now();
    end;
    if v_ts < '2024-01-01'::timestamptz or v_ts > now() + interval '5 minutes' then
      v_ts := now();
    end if;
  else
    v_ts := now();
  end if;

  insert into history (rule_id, content, category, timestamp, client_id)
  values (v_rule, v_content, v_cat, v_ts, v_cid)
  returning id into v_id;

  return jsonb_build_object('ok', true, 'id', v_id);
end;
$$;

revoke all on function public.draw_add(jsonb) from public;
grant execute on function public.draw_add(jsonb) to anon, authenticated;
