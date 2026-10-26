-- Additive migration under trusted migration owner. No browser table grants.
alter table public.invitations add column accepted_user_id uuid references public.profiles(id);
create function public.invitation_lookup(p_hash text,p_lock boolean default false)
returns table(email text,role text,organization text)
language plpgsql security definer set search_path=pg_catalog as $$
declare i public.invitations%rowtype; o public.organizations%rowtype;
begin
 if p_hash is null or p_hash !~ '^[a-f0-9]{64}$' then raise exception using errcode='PA001',message='Invitation not found'; end if;
 if p_lock then
  select inv.* into i from public.invitations inv where inv.token_hash=p_hash for update;
 else
  select inv.* into i from public.invitations inv where inv.token_hash=p_hash;
 end if;
 if i.id is null then raise exception using errcode='PA001',message='Invitation not found'; end if;
 if i.accepted_at is not null then raise exception using errcode='PA003',message='Invitation already accepted'; end if;
 if i.expires_at<=clock_timestamp() then raise exception using errcode='PA002',message='Invitation expired'; end if;
 select org.* into o from public.organizations org where org.id=i.organization_id;
 if not exists(select 1 from public.profiles p where p.id=i.invited_by and p.active and (p.role='admin' or (p.role='manager' and i.role in ('observer','approver'))))
  or o.kind is distinct from (case when i.role in ('observer','approver') then 'client' else 'manufacturer' end)
 then raise exception using errcode='PA004',message='Invitation no longer authorized'; end if;
 return query select i.email,i.role,o.name;
end $$;
create function public.invitation_finish(p_hash text,p_user uuid,p_name text)
returns void language plpgsql security definer set search_path=pg_catalog as $$
declare i public.invitations%rowtype;
begin
 -- Recheck after Auth and serialize competing attempts on the same invitation.
 perform public.invitation_lookup(p_hash,true);
 select inv.* into strict i from public.invitations inv where inv.token_hash=p_hash;
 if length(btrim(p_name)) not between 2 and 100 then raise exception using errcode='PA006',message='Invalid profile name'; end if;
 if not exists(select 1 from auth.users u where u.id=p_user and lower(u.email)=lower(i.email) and u.email_confirmed_at is not null and coalesce(u.is_anonymous,false)=false)
 then raise exception using errcode='PA006',message='Auth identity does not match invitation'; end if;
 if exists(select 1 from public.profiles p where p.id=p_user) then raise exception using errcode='PA005',message='Profile already exists'; end if;
 insert into public.profiles(id,full_name,role) values(p_user,btrim(p_name),i.role);
 insert into public.organization_memberships(organization_id,user_id) values(i.organization_id,p_user);
 update public.invitations set accepted_at=clock_timestamp(),accepted_user_id=p_user where id=i.id;
 insert into public.audit_logs(actor_id,action,entity_id,detail) values(p_user,'invitation.accept',i.id,jsonb_build_object('role',i.role,'organizationId',i.organization_id));
end $$;
-- Resolve ambiguous COMMIT before compensating a newly created Auth identity.
create function public.invitation_registration_state(p_hash text,p_user uuid)
returns text language sql security definer set search_path=pg_catalog as $$
 select case
  when exists(select 1 from public.invitations i join public.profiles p on p.id=i.accepted_user_id where i.token_hash=p_hash and i.accepted_user_id=p_user and i.accepted_at is not null) then 'accepted'
  when exists(select 1 from public.invitations i where i.token_hash=p_hash and i.accepted_at is null) and not exists(select 1 from public.profiles p where p.id=p_user) then 'pending'
  else 'unknown' end
$$;
revoke all on function public.invitation_lookup(text,boolean),public.invitation_finish(text,uuid,text),public.invitation_registration_state(text,uuid) from public,anon,authenticated;
grant execute on function public.invitation_lookup(text,boolean),public.invitation_finish(text,uuid,text),public.invitation_registration_state(text,uuid) to packapprove_app;
