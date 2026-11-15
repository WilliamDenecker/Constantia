create table public.players (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (length(btrim(name)) between 1 and 120),
  active boolean not null default true
);

create table public.accounts (
  email text primary key check (email = lower(btrim(email))),
  user_id uuid unique references auth.users(id),
  player_id uuid not null unique references public.players,
  role text not null default 'lid' check (role in ('lid', 'superuser')),
  active boolean not null default true
);

create table public.matches (
  id uuid primary key default gen_random_uuid(),
  played_on date not null,
  opponent text not null check (length(btrim(opponent)) between 1 and 120),
  source text not null default 'live' check (source in ('live', 'excel')),
  match_key text generated always as (lower(btrim(opponent))) stored,
  unique (source, played_on, match_key)
);

create table public.rounds (
  id uuid primary key references public.matches,
  status text not null default 'concept' check (status in ('concept', 'open', 'gesloten')),
  deadline timestamptz,
  closed_at timestamptz
);
create index rounds_due on public.rounds (deadline) where status = 'open';

create table public.candidates (
  round_id uuid references public.rounds,
  player_id uuid references public.players,
  display_name text not null,
  primary key (round_id, player_id)
);

create table public.eligible (
  round_id uuid references public.rounds,
  user_id uuid references public.accounts(user_id),
  player_id uuid not null references public.players,
  primary key (round_id, user_id),
  unique (round_id, user_id, player_id)
);

create table public.ballots (
  round_id uuid,
  user_id uuid,
  voter_player uuid not null,
  man uuid not null,
  loser uuid not null,
  primary key (round_id, user_id),
  foreign key (round_id, user_id, voter_player) references public.eligible(round_id, user_id, player_id),
  foreign key (round_id, man) references public.candidates,
  foreign key (round_id, loser) references public.candidates,
  check (man <> loser and voter_player <> man and voter_player <> loser)
);

create table public.results (
  match_id uuid references public.matches,
  player_id uuid references public.players,
  category text check (category in ('man', 'loser')),
  display_name text not null,
  votes integer check (votes >= 0),
  rank integer check (rank > 0),
  excel_code integer check (excel_code in (1, 3)),
  check ((excel_code is null and votes is not null) or
         (excel_code is not null and votes is null and rank is null)),
  primary key (match_id, player_id, category)
);

-- All browser access goes through authenticated Next.js server actions.
-- Even a superuser's Supabase access token cannot read individual ballots.
do $$
declare t text;
begin
  foreach t in array array['players','accounts','matches','rounds','candidates','eligible','ballots','results'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select, insert, update on public.%I to service_role', t);
  end loop;
end
$$;

create function public.create_match(actor uuid, match_date date, match_opponent text)
returns uuid language plpgsql set search_path = '' as $$
declare new_id uuid;
begin
  perform 1 from public.accounts where user_id = actor and active and role = 'superuser' for share;
  if not found then raise exception 'Geen toegang.'; end if;
  insert into public.matches(played_on, opponent) values(match_date, trim(match_opponent)) returning id into new_id;
  insert into public.rounds(id) values(new_id);
  return new_id;
end
$$;

create function public.open_round(actor uuid, target uuid, chosen uuid[], voters uuid[], closes timestamptz)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.rounds where id = target and status = 'concept' for update;
  if not found then raise exception 'Deze ronde is geen concept.'; end if;
  perform 1 from public.accounts where user_id = actor and active and role = 'superuser' for share;
  if not found then raise exception 'Geen toegang.'; end if;
  if closes <= clock_timestamp() then raise exception 'De deadline is verstreken.'; end if;

  insert into public.candidates
    select target, id, name from public.players where id = any(chosen) and active for share;
  insert into public.eligible
    select target, user_id, player_id from public.accounts where user_id = any(voters) and active for share;

  if (select count(*) from public.candidates where round_id = target) <> coalesce(cardinality(chosen),0)
     or (select count(*) from public.eligible where round_id = target) <> coalesce(cardinality(voters),0)
     or coalesce(cardinality(chosen),0) < 2
     or coalesce(cardinality(voters),0) < 1
     or exists (
       select 1 from public.eligible e where e.round_id = target and
         (select count(*) from public.candidates c where c.round_id = target and c.player_id <> e.player_id) < 2
     )
  then raise exception 'Selecteer actieve leden en minstens twee keuzes per stemgerechtigde.'; end if;

  update public.rounds set status = 'open', deadline = closes where id = target;
end
$$;

create function public.cast_ballot(actor uuid, target uuid, man_choice uuid, loser_choice uuid)
returns void language plpgsql set search_path = '' as $$
declare current_round public.rounds;
declare voter uuid;
begin
  select * into current_round from public.rounds where id = target for update;
  select e.player_id into voter from public.eligible e join public.accounts a using (user_id)
    where e.round_id = target and e.user_id = actor and a.active for share of a;
  if not found then raise exception 'Je bent niet stemgerechtigd voor deze ronde.'; end if;
  if current_round.status <> 'open' or current_round.deadline <= clock_timestamp() then
    raise exception 'De stemronde is gesloten.';
  end if;
  insert into public.ballots values (target, actor, voter, man_choice, loser_choice);
end
$$;

create function public.finalize_round(target uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.rounds where id = target and status = 'open' for update;
  if not found then return; end if;

  insert into public.results(match_id, player_id, category, display_name, votes, rank)
    with choices as (
      select man as player_id, 'man' as category from public.ballots where round_id = target
      union all
      select loser, 'loser' from public.ballots where round_id = target
    ), totals as (
      select c.player_id, c.display_name, categories.category, count(v.player_id)::integer as votes
      from public.candidates c cross join (values ('man'), ('loser')) categories(category)
      left join choices v on v.player_id = c.player_id and v.category = categories.category
      where c.round_id = target group by c.player_id, c.display_name, categories.category
    )
    select target, player_id, category, display_name, votes,
      case when votes > 0 then rank() over (partition by category order by votes desc)::integer end
    from totals;

  update public.rounds set status = 'gesloten', closed_at = clock_timestamp() where id = target;
end
$$;

create function public.close_round(actor uuid, target uuid)
returns void language plpgsql set search_path = '' as $$
begin
  perform 1 from public.rounds where id = target for update;
  perform 1 from public.accounts where user_id = actor and active and role = 'superuser' for share;
  if not found then raise exception 'Geen toegang.'; end if;
  perform public.finalize_round(target);
end
$$;

create function public.close_due_rounds()
returns void language plpgsql set search_path = '' as $$
declare target uuid;
begin
  for target in select id from public.rounds where status = 'open' and deadline <= clock_timestamp()
    order by id for update skip locked
  loop
    perform public.finalize_round(target);
  end loop;
end
$$;

create function public.round_overview(actor uuid)
returns table (
  round_id uuid, played_on date, opponent text, status text, deadline timestamptz,
  has_voted boolean, can_vote boolean, turnout integer, electorate integer, candidates jsonb
) language sql stable set search_path = '' as $$
  select r.id, m.played_on, m.opponent,
    case when r.status = 'open' and r.deadline <= statement_timestamp() then 'gesloten' else r.status end,
    r.deadline, b.user_id is not null,
    e.user_id is not null and r.status = 'open' and (r.deadline is null or r.deadline > statement_timestamp()),
    case when a.role = 'superuser' then (select count(*)::int from public.ballots where ballots.round_id = r.id) end,
    case when a.role = 'superuser' then (select count(*)::int from public.eligible where eligible.round_id = r.id) end,
    coalesce((select jsonb_agg(jsonb_build_object('id', c.player_id, 'name', c.display_name) order by c.display_name)
              from public.candidates c where c.round_id = r.id and c.player_id <> a.player_id
              and e.user_id is not null and r.status = 'open'), '[]'::jsonb)
  from public.rounds r join public.matches m on m.id = r.id
  join public.accounts a on a.user_id = actor and a.active
  left join public.eligible e on e.round_id = r.id and e.user_id = actor
  left join public.ballots b on b.round_id = r.id and b.user_id = actor
  where a.role = 'superuser' or e.user_id is not null
  order by m.played_on desc, m.opponent
$$;

create function public.import_history(actor uuid, games jsonb)
returns integer language plpgsql set search_path = '' as $$
declare game jsonb;
declare match_id uuid;
declare imported integer := 0;
begin
  perform 1 from public.accounts where user_id = actor and active and role = 'superuser' for share;
  if not found then raise exception 'Geen toegang.'; end if;
  for game in select jsonb_array_elements(games) loop
    insert into public.matches(played_on, opponent, source)
      values ((game->>'date')::date, trim(game->>'opponent'), 'excel')
      on conflict (source, played_on, match_key) do update set opponent = public.matches.opponent
      returning id into match_id;

    insert into public.results(match_id, player_id, category, display_name, excel_code)
      select match_id, p.id, entry.category, p.name, entry.code
      from jsonb_to_recordset(game->'entries') as entry(player uuid, category text, code integer)
      left join public.players p on p.id = entry.player
      on conflict on constraint results_pkey do update set excel_code = excluded.excel_code;
    imported := imported + 1;
  end loop;
  return imported;
end
$$;

do $$
declare f regprocedure;
begin
  foreach f in array array[
    'public.create_match(uuid,date,text)'::regprocedure,
    'public.open_round(uuid,uuid,uuid[],uuid[],timestamptz)'::regprocedure,
    'public.cast_ballot(uuid,uuid,uuid,uuid)'::regprocedure,
    'public.finalize_round(uuid)'::regprocedure,
    'public.close_round(uuid,uuid)'::regprocedure,
    'public.close_due_rounds()'::regprocedure,
    'public.round_overview(uuid)'::regprocedure,
    'public.import_history(uuid,jsonb)'::regprocedure
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
    execute format('grant execute on function %s to service_role', f);
  end loop;
end
$$;

-- Hosted Supabase supports pg_cron. Voting enforces the precise cutoff independently.
create extension if not exists pg_cron;
select cron.schedule('constantia-close-rounds', '* * * * *', 'select public.close_due_rounds()');

create schema if not exists constantia_private;
revoke all on schema constantia_private from public, anon, authenticated;

-- Link reserved profiles only when Supabase verifies the invited mailbox.
create function constantia_private.link_verified_account()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.email_confirmed_at is not null then
    update public.accounts set user_id = new.id
      where email = lower(new.email) and user_id is null and active;
  end if;
  return new;
end
$$;
revoke all on function constantia_private.link_verified_account() from public, anon, authenticated;
create trigger constantia_link_verified_account
  after insert or update of email_confirmed_at on auth.users
  for each row execute function constantia_private.link_verified_account();
