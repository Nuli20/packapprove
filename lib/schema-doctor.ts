import {createHash} from 'node:crypto';
import type postgres from 'postgres';
export type CatalogConnection=Pick<postgres.Sql,'unsafe'>;
export type SchemaObjects=Record<string,unknown>;
export type SchemaContracts={version:1;migrations:{name:string;sha256:string;put:SchemaObjects;remove:string[]}[]};
const tables=new Set(['organizations','profiles','organization_memberships','projects','project_members','artworks','brief_versions','artwork_versions','version_files','file_previews','comment_threads','comments','comment_resolution_links','checklist_templates','checklist_template_versions','technical_reviews','technical_review_items','approval_rounds','approval_participants','approval_decisions','production_orders','production_packages','production_package_files','package_acknowledgements','package_revocations','download_events','invitations','notifications','audit_logs','idempotency_keys','rate_limits','upload_tickets','version_visualizations']);
const functions=new Set(['touch_row','reject_mutation','protect_version','actor_id','actor_role','can_project','can_version','can_package','enqueue_event','guard_package','shares_client_organization','invitation_lookup','invitation_finish','invitation_registration_state']);
export const digest=(s:string)=>createHash('sha256').update(s).digest('hex');
const json=(v:unknown)=>JSON.stringify(v);
/** Catalogs only. Caller uses READ ONLY and fixed pg_catalog search_path. No row contents. */
export async function collectSchema(sql:CatalogConnection):Promise<SchemaObjects>{
 const out:SchemaObjects={};
 for(const r of await sql.unsafe(`select c.relname,c.relrowsecurity,c.relforcerowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`))if(tables.has(r.relname))out['table:'+r.relname]={rls:r.relrowsecurity,forceRls:r.relforcerowsecurity};
 for(const r of await sql.unsafe(`select c.relname,a.attname,format_type(a.atttypid,a.atttypmod) as type,a.attnotnull as required,pg_get_expr(d.adbin,d.adrelid) as default from pg_attribute a join pg_class c on c.oid=a.attrelid join pg_namespace n on n.oid=c.relnamespace left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind='r' and a.attnum>0 and not a.attisdropped order by c.relname,a.attnum`))if(tables.has(r.relname))out[`column:${r.relname}:${r.attname}`]={type:r.type,required:r.required,default:r.default};
 for(const r of await sql.unsafe(`select c.relname,x.conname,x.contype,x.convalidated,pg_get_constraintdef(x.oid,true) as def from pg_constraint x join pg_class c on c.oid=x.conrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' order by c.relname,x.conname`))if(tables.has(r.relname))out[`constraint:${r.relname}:${r.conname}`]={type:r.contype,validated:r.convalidated,definition:r.def};
 for(const r of await sql.unsafe(`select tablename,indexname,indexdef from pg_indexes where schemaname='public' order by tablename,indexname`))if(tables.has(r.tablename))out[`index:${r.tablename}:${r.indexname}`]=r.indexdef;
 for(const r of await sql.unsafe(`select tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname='public' order by tablename,policyname`))if(tables.has(r.tablename))out[`policy:${r.tablename}:${r.policyname}`]={permissive:r.permissive,roles:[...r.roles].sort(),command:r.cmd,using:r.qual,check:r.with_check};
 for(const r of await sql.unsafe(`select c.relname,t.tgname,t.tgenabled,pg_get_triggerdef(t.oid,true) as def from pg_trigger t join pg_class c on c.oid=t.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal order by c.relname,t.tgname`))if(tables.has(r.relname))out[`trigger:${r.relname}:${r.tgname}`]={enabled:r.tgenabled,definition:r.def};
 for(const r of await sql.unsafe(`select p.oid,p.proname,pg_get_function_identity_arguments(p.oid) as args,pg_get_function_result(p.oid) as result,p.prosecdef,p.proconfig,pg_get_functiondef(p.oid) as def from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by p.proname,p.oid`))if(functions.has(r.proname)){
  const key=`function:${r.proname}(${r.args})`;
  const acl=(await sql.unsafe(`select has_function_privilege('anon',$1::oid,'EXECUTE') as anon,has_function_privilege('authenticated',$1::oid,'EXECUTE') as browser,has_function_privilege('packapprove_app',$1::oid,'EXECUTE') as server`,[r.oid]))[0];
  out[key]={result:r.result,securityDefiner:r.prosecdef,config:r.proconfig,definitionSha256:digest(r.def),execute:acl};
 }
 const app=(await sql.unsafe(`select 1 from pg_roles where rolname='packapprove_app'`)).length;
 if(app)for(const r of await sql.unsafe(`select c.relname,has_table_privilege('anon',c.oid,'SELECT') as anon_read,has_table_privilege('anon',c.oid,'INSERT,UPDATE,DELETE') as anon_write,has_table_privilege('authenticated',c.oid,'SELECT') as browser_read,has_table_privilege('authenticated',c.oid,'INSERT,UPDATE,DELETE') as browser_write,has_table_privilege('packapprove_app',c.oid,'SELECT') as server_read,has_table_privilege('packapprove_app',c.oid,'INSERT') as server_insert,has_table_privilege('packapprove_app',c.oid,'UPDATE') as server_update,has_table_privilege('packapprove_app',c.oid,'DELETE') as server_delete from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relkind='r' order by c.relname`))if(tables.has(r.relname)){const {relname,...acl}=r;out['acl:'+relname]=acl;}
 const storage=(await sql.unsafe(`select to_regclass('storage.buckets') as name`))[0].name;
 if(storage)for(const r of await sql.unsafe(`select id,public,file_size_limit,allowed_mime_types from storage.buckets where id='artworks'`))out['bucket:artworks']={public:r.public,fileSizeLimit:String(r.file_size_limit),mimeTypes:[...(r.allowed_mime_types||[])].sort()};
 return out;
}
export function expectedSchema(bundle:SchemaContracts,prefix=bundle.migrations.length){
 const state:SchemaObjects={};for(const step of bundle.migrations.slice(0,prefix)){for(const k of step.remove)delete state[k];Object.assign(state,step.put)}return state;
}
export function schemaDifference(expected:SchemaObjects,actual:SchemaObjects){
 return {missing:Object.keys(expected).filter(k=>!(k in actual)),different:Object.keys(expected).filter(k=>k in actual&&json(expected[k])!==json(actual[k])),unexpected:Object.keys(actual).filter(k=>!(k in expected))};
}
export function exactPrefix(bundle:SchemaContracts,actual:SchemaObjects){
 for(let i=bundle.migrations.length;i>=0;i--){const diff=schemaDifference(expectedSchema(bundle,i),actual);if(!diff.missing.length&&!diff.different.length&&!diff.unexpected.length)return i;}return null;
}
export async function runtimeDiagnosis(sql:CatalogConnection){
 const [r]=await sql.unsafe(`select current_user as login,r.rolsuper,r.rolbypassrls,exists(select 1 from pg_database d where d.datname=current_database() and d.datdba=r.oid) as database_owner,exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relowner=r.oid) as owns_public_objects,pg_has_role(current_user,'packapprove_app','MEMBER') as can_set_app_role from pg_roles r where r.rolname=current_user`);
 return {superuser:r.rolsuper,bypassRls:r.rolbypassrls,databaseOwner:r.database_owner,ownsPublicObjects:r.owns_public_objects,canSetAppRole:r.can_set_app_role,safe:!r.rolsuper&&!r.rolbypassrls&&!r.database_owner&&!r.owns_public_objects&&r.can_set_app_role};
}
