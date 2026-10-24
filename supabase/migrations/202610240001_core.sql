create extension if not exists pgcrypto;
create table organizations(id uuid primary key default gen_random_uuid(), name text not null, kind text not null check(kind in ('manufacturer','client')), unique(name));
create unique index one_manufacturer on organizations(kind) where kind='manufacturer';
create table profiles(id uuid primary key references auth.users(id), full_name text not null, role text not null check(role in ('admin','manager','designer','prepress','observer','approver','production')), active boolean not null default true);
create table organization_memberships(id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations, user_id uuid not null references profiles, unique(organization_id,user_id));
create table projects(id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations, name text not null, description text not null default '', customer_order text not null default '', contacts text not null default '', manager_id uuid references profiles, designer_id uuid references profiles, prepress_id uuid references profiles, deadline date not null, priority text not null default 'normal' check(priority in ('low','normal','high')), status text not null default 'active' check(status in ('active','paused','completed','archived')));
create table project_members(id uuid primary key default gen_random_uuid(), project_id uuid not null references projects, user_id uuid not null references profiles, unique(project_id,user_id));
create table artworks(id uuid primary key default gen_random_uuid(), project_id uuid not null references projects, name text not null, packaging_type text not null default 'Коробка', deadline date not null, status text not null default 'draft' check(status in ('draft','in_progress','review','approved','production')), active_version_id uuid);
create table brief_versions(id uuid primary key default gen_random_uuid(), artwork_id uuid not null references artworks, number integer not null check(number>0), content jsonb not null, author_id uuid not null references profiles, unique(artwork_id,number));
create table artwork_versions(id uuid primary key default gen_random_uuid(), artwork_id uuid not null references artworks, number integer not null check(number>0), previous_version_id uuid references artwork_versions, author_id uuid not null references profiles, changes text not null, status text not null default 'fixed' check(status in ('fixed','internal_review','published','approved','changes_requested','superseded')), unique(artwork_id,number));
alter table artworks add constraint active_version_fk foreign key(active_version_id) references artwork_versions;
create table version_files(id uuid primary key default gen_random_uuid(), version_id uuid not null references artwork_versions, kind text not null check(kind in ('source','preview','production')), storage_path text not null unique, filename text not null, mime_type text not null check(mime_type in ('application/pdf','image/png','image/jpeg')), size bigint not null check(size>0 and size<=26214400), sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), unique(version_id,kind));
create table file_previews(id uuid primary key default gen_random_uuid(), file_id uuid not null references version_files, page integer not null check(page>0), storage_path text not null, unique(file_id,page));
create table comment_threads(id uuid primary key default gen_random_uuid(), version_id uuid not null references artwork_versions, author_id uuid not null references profiles, page integer not null default 1 check(page>0), x numeric not null check(x between 0 and 1), y numeric not null check(y between 0 and 1), type text not null default 'design' check(type in ('design','technical','question')), visibility text not null check(visibility in ('client','internal')), status text not null default 'open' check(status in ('open','resolved')));
create table comments(id uuid primary key default gen_random_uuid(), thread_id uuid not null references comment_threads, author_id uuid not null references profiles, body text not null check(length(body) between 1 and 5000));
create table comment_resolution_links(id uuid primary key default gen_random_uuid(), thread_id uuid not null references comment_threads, fixed_in_version_id uuid not null references artwork_versions, unique(thread_id));
create table checklist_templates(id uuid primary key default gen_random_uuid(), name text not null);
create table checklist_template_versions(id uuid primary key default gen_random_uuid(), template_id uuid not null references checklist_templates, number integer not null check(number>0), items jsonb not null check(jsonb_typeof(items)='array'), unique(template_id,number));
create table technical_reviews(id uuid primary key default gen_random_uuid(), version_id uuid not null references artwork_versions, template_version_id uuid not null references checklist_template_versions, reviewer_id uuid not null references profiles, status text not null check(status in ('ready','limited','correction')), notes text not null default '', unique(version_id));
create table technical_review_items(id uuid primary key default gen_random_uuid(), review_id uuid not null references technical_reviews, label text not null, passed boolean not null, unique(review_id,label));
create table approval_rounds(id uuid primary key default gen_random_uuid(), version_id uuid not null references artwork_versions, artwork_id uuid not null references artworks, opened_by uuid not null references profiles, deadline timestamptz not null, policy text not null default 'all' check(policy='all'), status text not null default 'open' check(status in ('open','approved','changes_requested','superseded','cancelled')), closed_at timestamptz);
create unique index one_open_round on approval_rounds(artwork_id) where status='open';
create table approval_participants(id uuid primary key default gen_random_uuid(), round_id uuid not null references approval_rounds, user_id uuid not null references profiles, kind text not null check(kind in ('approver','observer')), unique(round_id,user_id));
create table approval_decisions(id uuid primary key default gen_random_uuid(), round_id uuid not null references approval_rounds, version_id uuid not null references artwork_versions, user_id uuid not null references profiles, result text not null check(result in ('approved','changes_requested')), comment text not null default '', ip inet, user_agent text, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), unique(round_id,user_id));
create table production_orders(id uuid primary key default gen_random_uuid(), project_id uuid not null references projects, number text not null unique);
create table production_packages(id uuid primary key default gen_random_uuid(), number text not null unique, order_id uuid references production_orders, project_id uuid not null references projects, artwork_id uuid not null references artworks, version_id uuid not null references artwork_versions unique, approval_round_id uuid not null references approval_rounds, technical_review_id uuid not null references technical_reviews, file_id uuid not null references version_files, sha256 text not null check(sha256 ~ '^[a-f0-9]{64}$'), issued_by uuid not null references profiles, status text not null default 'transferred' check(status in ('prepared','transferred','received','revoked','replaced')));
create table production_package_files(id uuid primary key default gen_random_uuid(), package_id uuid not null references production_packages, file_id uuid not null references version_files, unique(package_id,file_id));
create table package_acknowledgements(id uuid primary key default gen_random_uuid(), package_id uuid not null references production_packages unique, user_id uuid not null references profiles, sha256 text not null);
create table package_revocations(id uuid primary key default gen_random_uuid(), package_id uuid not null references production_packages unique, user_id uuid not null references profiles, reason text not null check(length(reason)>0));
create table download_events(id uuid primary key default gen_random_uuid(), package_id uuid references production_packages, file_id uuid not null references version_files, user_id uuid not null references profiles, sha256 text not null);
create table invitations(id uuid primary key default gen_random_uuid(), organization_id uuid not null references organizations, email text not null, role text not null check(role in ('admin','manager','designer','prepress','observer','approver','production')), invited_by uuid not null references profiles, token_hash text unique, expires_at timestamptz not null default now()+interval '7 days', accepted_at timestamptz);
create table notifications(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles, project_id uuid references projects, kind text not null, message text not null, read_at timestamptz);
create table audit_logs(id uuid primary key default gen_random_uuid(), actor_id uuid references profiles, project_id uuid references projects, action text not null, entity_id uuid, detail jsonb not null default '{}');
create table idempotency_keys(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles, key text not null, operation text not null, request_hash text not null, response jsonb, unique(user_id,key));
create table rate_limits(id uuid primary key default gen_random_uuid(), user_id uuid not null references profiles, bucket timestamptz not null, count integer not null default 1, unique(user_id,bucket));
-- Common optimistic locking and timestamps, including join and audit records.
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('alter table %I add column created_at timestamptz not null default now(), add column updated_at timestamptz not null default now(), add column row_version integer not null default 1 check(row_version>0)',t);
end loop; end $$;
create function touch_row() returns trigger language plpgsql as $$ begin new.updated_at=now(); new.row_version=old.row_version+1; return new; end $$;
create function reject_mutation() returns trigger language plpgsql as $$ begin raise exception 'Immutable record'; end $$;
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('create trigger touch before update on %I for each row execute function touch_row()',t);
end loop; foreach t in array array['version_files','artwork_versions','brief_versions','approval_decisions','technical_reviews','technical_review_items','checklist_template_versions','package_acknowledgements','package_revocations','audit_logs','download_events'] loop
 if t<>'artwork_versions' then execute format('create trigger immutable before update or delete on %I for each row execute function reject_mutation()',t); end if;
end loop; end $$;
-- Version content is permanently fixed; only workflow status can change.
create function protect_version() returns trigger language plpgsql as $$ begin
 if tg_op='DELETE' then raise exception 'Immutable version'; end if;
 if (new.id,new.artwork_id,new.number,new.previous_version_id,new.author_id,new.changes) is distinct from (old.id,old.artwork_id,old.number,old.previous_version_id,old.author_id,old.changes) then raise exception 'Immutable version content'; end if; return new;
end $$;
create trigger protect_version before update or delete on artwork_versions for each row execute function protect_version();
create function actor_id() returns uuid language sql stable as $$ select coalesce(auth.uid(),nullif(current_setting('app.user_id',true),'')::uuid) $$;
create function actor_role() returns text language sql stable security definer set search_path=public as $$ select role from profiles where id=actor_id() and active $$;
create function can_project(pid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from projects p where p.id=pid and (
 actor_role() in ('admin','manager') or (actor_role() in ('designer','prepress') and exists(select 1 from project_members m where m.project_id=p.id and m.user_id=actor_id())) or
 (actor_role() in ('observer','approver') and exists(select 1 from organization_memberships m where m.organization_id=p.organization_id and m.user_id=actor_id())))) $$;
create function can_version(vid uuid) returns boolean language sql stable security definer set search_path=public as $$
 select exists(select 1 from artwork_versions v join artworks a on a.id=v.artwork_id where v.id=vid and can_project(a.project_id) and (actor_role() not in ('observer','approver') or exists(select 1 from approval_rounds r where r.version_id=v.id))) $$;
create function can_package(pid uuid) returns boolean language sql stable security definer set search_path=public as $$ select exists(select 1 from production_packages p where p.id=pid and (actor_role() in ('admin','manager','production') or can_project(p.project_id))) $$;
-- Runtime server uses a dedicated non-BYPASSRLS role; browsers receive SELECT only.
do $$ begin if not exists(select 1 from pg_roles where rolname='packapprove_app') then create role packapprove_app nologin; end if; end $$;
grant usage on schema public to authenticated, packapprove_app;
grant select on all tables in schema public to authenticated;
grant select,insert,update,delete on all tables in schema public to packapprove_app;
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop execute format('alter table %I enable row level security',t); end loop; end $$;
create policy read_org on organizations for select using(actor_role() in ('admin','manager') or exists(select 1 from organization_memberships m where m.organization_id=organizations.id and m.user_id=actor_id()));
create policy read_profiles on profiles for select using(id=actor_id() or actor_role() in ('admin','manager') or (actor_role() in ('designer','prepress') and role not in ('observer','approver')) or exists(select 1 from organization_memberships m join organization_memberships mine on mine.organization_id=m.organization_id where m.user_id=profiles.id and mine.user_id=actor_id()));
create policy read_memberships on organization_memberships for select using(user_id=actor_id() or actor_role() in ('admin','manager'));
create policy read_projects on projects for select using(can_project(id));
create policy read_project_members on project_members for select using(can_project(project_id));
create policy read_artworks on artworks for select using(can_project(project_id));
create policy read_briefs on brief_versions for select using(exists(select 1 from artworks a where a.id=artwork_id and can_project(a.project_id)));
create policy read_versions on artwork_versions for select using(can_version(id));
create policy read_files on version_files for select using((can_version(version_id) and (actor_role() not in ('observer','approver') or kind='preview')) or (actor_role()='production' and exists(select 1 from production_packages p where p.file_id=version_files.id and p.status in ('transferred','received'))));
create policy read_previews on file_previews for select using(exists(select 1 from version_files f where f.id=file_id));
create policy read_threads on comment_threads for select using(can_version(version_id) and (visibility='client' or actor_role() not in ('observer','approver','production')));
create policy read_comments on comments for select using(exists(select 1 from comment_threads t where t.id=thread_id));
create policy read_resolutions on comment_resolution_links for select using(exists(select 1 from comment_threads t where t.id=thread_id));
create policy read_templates on checklist_templates for select using(actor_role() in ('admin','manager','prepress','designer'));
create policy read_template_versions on checklist_template_versions for select using(actor_role() in ('admin','manager','prepress','designer'));
create policy read_technical on technical_reviews for select using(can_version(version_id) and actor_role() not in ('observer','approver'));
create policy read_technical_items on technical_review_items for select using(exists(select 1 from technical_reviews r where r.id=review_id));
create policy read_rounds on approval_rounds for select using(can_version(version_id));
create policy read_participants on approval_participants for select using(exists(select 1 from approval_rounds r where r.id=round_id));
create policy read_decisions on approval_decisions for select using(exists(select 1 from approval_rounds r where r.id=round_id));
create policy read_orders on production_orders for select using(can_project(project_id) or actor_role()='production');
create policy read_packages on production_packages for select using(can_package(id));
create policy read_package_files on production_package_files for select using(can_package(package_id));
create policy read_acks on package_acknowledgements for select using(can_package(package_id));
create policy read_revocations on package_revocations for select using(can_package(package_id));
create policy read_downloads on download_events for select using(user_id=actor_id() or actor_role() in ('admin','manager'));
create policy read_invitations on invitations for select using(actor_role() in ('admin','manager'));
create policy read_notifications on notifications for select using(user_id=actor_id());
create policy read_audit on audit_logs for select using(actor_role()='admin');
create policy read_idempotency on idempotency_keys for select to packapprove_app using(user_id=actor_id());
create policy read_limits on rate_limits for select to packapprove_app using(user_id=actor_id());
-- Only trusted transaction service can write. Clients cannot invoke writes directly via PostgREST.
do $$ declare t text; begin for t in select tablename from pg_tables where schemaname='public' loop
 execute format('create policy service_insert on %I for insert to packapprove_app with check(actor_role() is not null)',t);
 execute format('create policy service_update on %I for update to packapprove_app using(actor_role() is not null) with check(actor_role() is not null)',t);
end loop; end $$;
-- Private objects are accessed only by server after independent permission check.
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('artworks','artworks',false,26214400,array['application/pdf','image/png','image/jpeg']) on conflict(id) do nothing;
create index projects_organization on projects(organization_id);
create index artworks_project on artworks(project_id);
create index versions_artwork on artwork_versions(artwork_id);
create index rounds_version on approval_rounds(version_id);
create index threads_version on comment_threads(version_id);
create index comments_thread on comments(thread_id);
create index notifications_user on notifications(user_id,created_at desc);
create index packages_status on production_packages(status);
create index audit_project on audit_logs(project_id,created_at desc);
drop policy read_org on organizations;
create policy read_org on organizations for select using(actor_role() in ('admin','manager','designer','prepress') or exists(select 1 from organization_memberships m where m.organization_id=organizations.id and m.user_id=actor_id()));
create function enqueue_event(pid uuid,event text) returns void language plpgsql security definer set search_path=public as $$ begin
 if actor_role() is null then raise exception 'Authentication required'; end if;
 insert into notifications(user_id,project_id,kind,message)
 select p.id,pid,event,event from profiles p where p.active and (
 p.role in ('admin','manager') or
 (p.role in ('designer','prepress') and exists(select 1 from project_members m where m.project_id=pid and m.user_id=p.id)) or
 (p.role='production' and event like 'package.%') or
 (p.role in ('observer','approver') and event in ('round.open','decision.create','comment.create','comment.reply') and exists(select 1 from organization_memberships m join projects pr on pr.organization_id=m.organization_id where pr.id=pid and m.user_id=p.id)));
end $$;
revoke all on function enqueue_event(uuid,text) from public;
grant execute on function enqueue_event(uuid,text) to packapprove_app;
create policy production_project on projects for select using(actor_role()='production' and exists(select 1 from production_packages pp where pp.project_id=projects.id));
create policy production_artwork on artworks for select using(actor_role()='production' and exists(select 1 from production_packages pp where pp.artwork_id=artworks.id));
create policy production_version on artwork_versions for select using(actor_role()='production' and exists(select 1 from production_packages pp where pp.version_id=artwork_versions.id));
create function guard_package() returns trigger language plpgsql as $$ begin
 if tg_op='UPDATE' then
  if (new.version_id,new.file_id,new.sha256,new.approval_round_id,new.technical_review_id,new.artwork_id,new.project_id,new.issued_by,new.number) is distinct from (old.version_id,old.file_id,old.sha256,old.approval_round_id,old.technical_review_id,old.artwork_id,old.project_id,old.issued_by,old.number) then raise exception 'Immutable package identity'; end if;
  if old.status in ('revoked','replaced') then raise exception 'Terminal package status'; end if;
 else
  if not exists(select 1 from artwork_versions v join artworks a on a.id=v.artwork_id join version_files f on f.version_id=v.id join approval_rounds r on r.version_id=v.id join technical_reviews t on t.version_id=v.id where v.id=new.version_id and a.id=new.artwork_id and a.project_id=new.project_id and a.active_version_id=v.id and v.status='approved' and f.id=new.file_id and f.kind='production' and f.sha256=new.sha256 and r.id=new.approval_round_id and r.status='approved' and t.id=new.technical_review_id and t.status='ready') then raise exception 'Package prerequisites not met'; end if;
 end if; return new;
end $$;
create trigger guard_package before insert or update on production_packages for each row execute function guard_package();
create policy project_profile_names on profiles for select using(exists(select 1 from project_members m where m.user_id=profiles.id and can_project(m.project_id)));

create policy service_delete_members on project_members for delete to packapprove_app using(actor_role() in ('admin','manager'));
grant usage on schema auth to packapprove_app;
grant execute on function auth.uid() to packapprove_app;
-- RETURNING checks must evaluate existing parents, never re-read the not-yet-visible inserted row.
create policy staff_project_read on projects for select using(actor_role() in ('admin','manager'));
create policy staff_version_read on artwork_versions for select using(actor_role() in ('admin','manager','designer','prepress') and exists(select 1 from artworks a where a.id=artwork_versions.artwork_id and can_project(a.project_id)));
create policy production_org on organizations for select using(actor_role()='production' and exists(select 1 from projects p join production_packages pp on pp.project_id=p.id where p.organization_id=organizations.id));
alter table comment_threads add column carried_from_id uuid references comment_threads(id);
create unique index unique_carried_comment on comment_threads(version_id,carried_from_id) where carried_from_id is not null;
