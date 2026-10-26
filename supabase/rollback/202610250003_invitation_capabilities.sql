-- Emergency capability disable, not a destructive down migration.
-- Deploy a verified fix before restoring EXECUTE. Keep accepted identities intact.
begin;
revoke execute on function public.invitation_lookup(text,boolean),public.invitation_finish(text,uuid,text),public.invitation_registration_state(text,uuid) from packapprove_app;
commit;
