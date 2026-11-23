-- visitor intel v1
-- Run in Supabase SQL Editor. Safe to re-run.

create table if not exists public.visitors (
  id uuid primary key default gen_random_uuid(),
  fp text,
  fp_full text,
  first_seen timestamptz not null default now(),
  last_seen timestamptz not null default now(),
  visits int not null default 0,
  ip_first inet,
  ip_last inet,
  ua text,
  platform text,
  arch text,
  timezone text,
  lang text,
  gpu text,
  screen text,
  label text,
  merged_into uuid references public.visitors(id),
  note text
);

create index if not exists visitors_fp on public.visitors (fp);
create index if not exists visitors_last on public.visitors (last_seen desc);

create table if not exists public.visitor_keys (
  key text primary key,
  kind text not null,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_seen timestamptz not null default now()
);

create index if not exists visitor_keys_visitor on public.visitor_keys (visitor_id);
create index if not exists visitor_keys_seen on public.visitor_keys (last_seen desc);

create table if not exists public.visits (
  id bigserial primary key,
  visitor_id uuid not null references public.visitors(id) on delete cascade,
  created_at timestamptz not null default now(),
  ip inet,
  ip_stun4 inet,
  ip_stun6 inet,
  leaked boolean not null default false,
  fp text,
  fp_full text,
  sig jsonb not null,
  dur_ms int,
  clicks int not null default 0,
  keypress int not null default 0,
  scroll numeric(4,2) not null default 0
);

create index if not exists visits_visitor on public.visits (visitor_id, created_at desc);
create index if not exists visits_time on public.visits (created_at desc);
create index if not exists visits_ip on public.visits (ip);
create index if not exists visits_leaked on public.visits (created_at desc) where leaked;

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
  v_s4 inet := nullif(btrim(coalesce(p->>'stun4', '')), '')::inet;
  v_s6 inet := nullif(btrim(coalesce(p->>'stun6', '')), '')::inet;
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
      v_fp, v_fp2, v_ip, v_ip,
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
      ip_last = coalesce(v_ip, ip_last),
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

  insert into visits (visitor_id, ip, ip_stun4, ip_stun6, leaked, fp, fp_full, sig)
  values (
    v_visitor, v_ip, v_s4, v_s6,
    coalesce((p->>'leaked')::boolean, false),
    v_fp, v_fp2, p
  )
  returning id into v_visit;

  return jsonb_build_object('visit', v_visit, 'visitor', v_visitor, 'new', v_new);
end;
$$;

create or replace function public.track_leave(p jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update visits set
    dur_ms = coalesce(nullif(p->>'dur','')::int, dur_ms),
    clicks = coalesce(nullif(p->>'clicks','')::int, clicks),
    keypress = coalesce(nullif(p->>'keys','')::int, keypress),
    scroll = coalesce(nullif(p->>'scroll','')::numeric, scroll)
  where id = nullif(p->>'visit','')::bigint;
end;
$$;

alter table public.visitors enable row level security;
alter table public.visitor_keys enable row level security;
alter table public.visits enable row level security;

revoke all on public.visitors from anon, authenticated;
revoke all on public.visitor_keys from anon, authenticated;
revoke all on public.visits from anon, authenticated;
revoke all on sequence public.visits_id_seq from anon, authenticated;

revoke all on function public.track_visit(jsonb) from public;
revoke all on function public.track_leave(jsonb) from public;
grant execute on function public.track_visit(jsonb) to anon, authenticated;
grant execute on function public.track_leave(jsonb) to anon, authenticated;

create or replace view public.visitor_overview
with (security_invoker = true) as
select
  v.id,
  v.label,
  v.first_seen,
  v.last_seen,
  v.visits,
  v.ip_last,
  v.platform,
  v.arch,
  v.timezone,
  v.lang,
  v.gpu,
  v.screen,
  (select count(*) from visits x where x.visitor_id = v.id) as visit_rows,
  (select count(*) from visits x where x.visitor_id = v.id and x.leaked) as leaked_rows
from visitors v
where v.merged_into is null;
