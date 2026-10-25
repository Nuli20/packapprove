-- Read-only helper: clients may see names of colleagues in their own organization,
-- without granting them SELECT on other users' membership records.
create or replace function public.shares_client_organization(subject uuid)
returns boolean language sql stable security definer set search_path=pg_catalog,public as $$
 select public.actor_role() in ('observer','approver') and exists(
 select 1 from public.organization_memberships mine
 join public.organization_memberships colleague on colleague.organization_id=mine.organization_id
 join public.organizations o on o.id=mine.organization_id and o.kind='client'
 where mine.user_id=public.actor_id() and colleague.user_id=subject)
$$;
revoke all on function public.shares_client_organization(uuid) from public;
grant execute on function public.shares_client_organization(uuid) to authenticated,packapprove_app;
create policy client_peer_names on public.profiles for select
 using(public.shares_client_organization(id));
