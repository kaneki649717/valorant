-- visitor intel v2: server-observed IP
alter table public.visits add column if not exists ip_srv inet;

create or replace function public.track_visit(p jsonb)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_vid text := nullif(p->>'vid', '');
  v_fp text := nullif(p->>'fp', '');
  v_fp2 text := nullif(p->>'fp2', '');
  v_ipua text := nullif(p->>'ipua', '');
  v_ip inet := nullif(btrim(coalesce(p->>'ip', '')), '')::inet;
  v_srv inet := nullif(btrim(coalesce(p->>'srv', '')), '')::inet;
  v_s4 inet := nullif(btrim(coalesce(p->>'stun4', '')), '')::inet;
  v_s6 inet := nullif(btrim(coalesce(p->>'stun6', '')), '')::inet;
  v_leak boolean;
  v_visitor uuid;
  v_visit bigint;
  v_new boolean := false;
begin
  if v_vid is null then
    raise exception 'vid required';
  end if;
  if length(p::text) > 12000 then
    raise exception 'payload too large';
  end if;

  v_leak := case
    when v_s4 is not null and v_srv is not null then v_s4 <> v_srv
    else coalesce((p->>'leaked')::boolean, false)
  end;

  select visitor_id into v_visitor from visitor_keys where key = 'v:' || v_vid;

  if v_visitor is null and v_fp is not null then
    select visitor_id into v_visitor
      from visitor_keys
     where key = 'f:' || v_fp
       and last_seen > now() - interval '90 days'
     order by last_seen desc
     limit 1;
  end if;

  if v_visitor is null and v_ipua is not null then
    select visitor_id into v_visitor
      from visitor_keys
     where key = 'i:' || v_ipua
       and last_seen > now() - interval '1 day'
     order by last_seen desc
     limit 1;
  end if;

  if v_visitor is null then
    insert into visitors (
      fp, fp_full, ip_first, ip_last, ua, platform, arch, timezone, lang, gpu, screen, visits
    ) values (
      v_fp, v_fp2, coalesce(v_srv, v_ip), coalesce(v_srv, v_ip),
      p->>'ua', p->>'uap', p->>'arch', p->>'tz', p->>'lang',
      p->'gl'->>'r',
      (p->'scr'->>'w') || 'x' || (p->'scr'->>'h'),
      1
    )
    returning id into v_visitor;
    v_new := true;
  else
    update visitors set
      last_seen = now(),
      visits = visits + 1,
      ip_last = coalesce(v_srv, v_ip, ip_last),
      fp = coalesce(fp, v_fp),
      ua = coalesce(ua, p->>'ua'),
      platform = coalesce(platform, p->>'uap'),
      arch = coalesce(arch, p->>'arch'),
      timezone = coalesce(timezone, p->>'tz'),
      lang = coalesce(lang, p->>'lang'),
      gpu = coalesce(gpu, p->'gl'->>'r'),
      screen = coalesce(screen, (p->'scr'->>'w') || 'x' || (p->'scr'->>'h'))
    where id = v_visitor;
  end if;

  insert into visitor_keys (key, kind, visitor_id)
  values ('v:' || v_vid, 'vid', v_visitor)
  on conflict (key) do update
    set last_seen = now(), visitor_id = excluded.visitor_id;

  if v_fp is not null then
    insert into visitor_keys (key, kind, visitor_id)
    values ('f:' || v_fp, 'fp', v_visitor)
    on conflict (key) do update
      set last_seen = now(), visitor_id = excluded.visitor_id;
  end if;

  if v_ipua is not null then
    insert into visitor_keys (key, kind, visitor_id)
    values ('i:' || v_ipua, 'ipua', v_visitor)
    on conflict (key) do update
      set last_seen = now();
  end if;

  insert into visits (visitor_id, ip, ip_srv, ip_stun4, ip_stun6, leaked, fp, fp_full, sig)
  values (v_visitor, v_ip, v_srv, v_s4, v_s6, v_leak, v_fp, v_fp2, p)
  returning id into v_visit;

  return jsonb_build_object('visit', v_visit, 'visitor', v_visitor, 'new', v_new);
end;
$$;
