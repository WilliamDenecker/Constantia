create function public.pending_registrations(actor uuid)
returns table (user_id uuid, email text, display_name text)
language sql stable set search_path = '' as $$
  select u.id, lower(u.email), left(btrim(u.raw_user_meta_data->>'display_name'), 120)
  from auth.users u
  where exists (select 1 from public.accounts a where a.user_id=actor and a.active and a.role='superuser')
    and u.email_confirmed_at is not null and u.email is not null
    and not exists (select 1 from public.accounts a where a.user_id=u.id or a.email=lower(u.email))
  order by u.created_at;
$$;

create function public.approve_registration(actor uuid, target uuid, profile uuid, profile_name text)
returns void language plpgsql set search_path = '' as $$
declare mailbox text;
begin
  perform pg_advisory_xact_lock(714208361);
  perform 1 from public.accounts where user_id=actor and active and role='superuser';
  if not found then raise exception 'Geen toegang.'; end if;
  select lower(u.email) into mailbox from auth.users u where u.id=target and u.email_confirmed_at is not null for share;
  if mailbox is null then raise exception 'Dit e-mailadres is nog niet bevestigd.'; end if;
  if profile is null then
    insert into public.players(name) values (btrim(profile_name)) returning id into profile;
  else
    perform 1 from public.players where id=profile and active for share;
    if not found then raise exception 'Kies een actief spelersprofiel.'; end if;
  end if;
  insert into public.accounts(email,user_id,player_id,role) values (mailbox,target,profile,'lid');
end
$$;

create function public.change_member_access(actor uuid, target_email text, change_to text)
returns void language plpgsql set search_path = '' as $$
begin
  perform pg_advisory_xact_lock(714208361);
  perform 1 from public.accounts where user_id=actor and active and role='superuser';
  if not found then raise exception 'Geen toegang.'; end if;
  update public.accounts
  set role=case when change_to in ('lid','superuser') then change_to else role end,
      active=case when change_to='deactivate' then false when change_to='activate' then true else active end
  where email=target_email and user_id is distinct from actor
    and (change_to in ('deactivate','activate') or (active and user_id is not null and change_to in ('lid','superuser')));
  if not found then raise exception 'Deze wijziging is niet mogelijk voor dit account.'; end if;
end
$$;

revoke all on function public.pending_registrations(uuid), public.approve_registration(uuid,uuid,uuid,text), public.change_member_access(uuid,text,text) from public, anon, authenticated;
grant execute on function public.pending_registrations(uuid), public.approve_registration(uuid,uuid,uuid,text), public.change_member_access(uuid,text,text) to service_role;
