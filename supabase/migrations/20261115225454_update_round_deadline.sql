create function public.set_round_deadline(actor uuid, target uuid, closes timestamptz)
returns void language plpgsql set search_path = '' as $$
declare current_round public.rounds;
begin
  select * into current_round from public.rounds where id = target for update;
  if not found or current_round.status <> 'open' then raise exception 'Deze ronde is niet open.'; end if;
  perform 1 from public.accounts where user_id = actor and active and role = 'superuser' for share;
  if not found then raise exception 'Geen toegang.'; end if;
  if current_round.deadline <= clock_timestamp() then raise exception 'De stemronde is gesloten.'; end if;
  if closes <= clock_timestamp() then raise exception 'Kies een deadline in de toekomst.'; end if;
  update public.rounds set deadline = closes where id = target;
end
$$;
revoke all on function public.set_round_deadline(uuid,uuid,timestamptz) from public, anon, authenticated;
grant execute on function public.set_round_deadline(uuid,uuid,timestamptz) to service_role;
