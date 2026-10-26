-- Read-only verification. No tokens or user rows are selected.
select p.proname,p.proowner::regrole as owner,p.prosecdef as security_definer,p.proconfig,
 has_function_privilege('packapprove_app',p.oid,'EXECUTE') as server_can_execute,
 has_function_privilege('anon',p.oid,'EXECUTE') as anon_can_execute,
 has_function_privilege('authenticated',p.oid,'EXECUTE') as browser_can_execute
from pg_proc p where p.pronamespace='public'::regnamespace
and p.proname in ('invitation_lookup','invitation_finish','invitation_registration_state');
select relname,relrowsecurity from pg_class where oid in ('public.invitations'::regclass,'public.profiles'::regclass,'public.organization_memberships'::regclass);
