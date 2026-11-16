-- Auth records remain private; only the two service-role RPCs can read them.
alter function public.pending_registrations(uuid) security definer;
alter function public.approve_registration(uuid,uuid,uuid,text) security definer;
