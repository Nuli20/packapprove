import type postgres from "postgres";
/** One shared check for the server and CLI, including privileges reachable through SET ROLE. */
export async function runtimeDiagnosis(sql: Pick<postgres.Sql, "unsafe">) {
  const [r] = await sql.unsafe(`select r.rolsuper,r.rolbypassrls,
 exists(select 1 from pg_roles elevated where (elevated.rolsuper or elevated.rolbypassrls) and pg_has_role(current_user,elevated.oid,'MEMBER')) as can_escalate,
 exists(select 1 from pg_database d where d.datname=current_database() and (d.datdba=r.oid or pg_has_role(current_user,d.datdba,'MEMBER'))) as database_owner,
 exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and (c.relowner=r.oid or pg_has_role(current_user,c.relowner,'MEMBER'))) as owns_public_objects,
 coalesce(pg_has_role(current_user,to_regrole('packapprove_app'),'MEMBER'),false) as can_set_app_role,
 exists(select 1 from pg_roles ar where ar.rolname='packapprove_app' and not ar.rolsuper and not ar.rolbypassrls and not ar.rolcanlogin) as app_role_safe from pg_roles r where r.rolname=current_user`);
  return {
    superuser: r.rolsuper,
    bypassRls: r.rolbypassrls,
    canEscalate: r.can_escalate,
    databaseOwner: r.database_owner,
    ownsPublicObjects: r.owns_public_objects,
    canSetAppRole: r.can_set_app_role,
    appRoleSafe: r.app_role_safe,
    safe:
      !r.rolsuper &&
      !r.rolbypassrls &&
      !r.can_escalate &&
      !r.database_owner &&
      !r.owns_public_objects &&
      r.can_set_app_role &&
      r.app_role_safe,
  };
}
