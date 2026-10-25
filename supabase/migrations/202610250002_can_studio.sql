-- Additive, private upload quarantine and immutable per-version visualization metadata.
create table public.upload_tickets(
 id uuid primary key default gen_random_uuid(), user_id uuid not null references public.profiles,
 artwork_id uuid not null references public.artworks, kind text not null check(kind in ('source','preview','production')),
 filename text not null check(length(filename) between 1 and 180), storage_path text not null unique,
 expected_size bigint not null check(expected_size>0 and expected_size<=26214400),
 expected_sha256 text not null check(expected_sha256 ~ '^[a-f0-9]{64}$'),
 status text not null default 'pending' check(status in ('pending','consumed')),
 expires_at timestamptz not null default now()+interval '2 hours',
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1 check(row_version>0)
);
create table public.version_visualizations(
 id uuid primary key default gen_random_uuid(),version_id uuid not null unique references public.artwork_versions,
 author_id uuid not null references public.profiles,spec jsonb not null check(jsonb_typeof(spec)='object' and spec->>'preset' in ('standard450','sleek330','slim250','experimental')),
 created_at timestamptz not null default now(),updated_at timestamptz not null default now(),row_version integer not null default 1 check(row_version>0)
);
alter table public.upload_tickets enable row level security;
alter table public.version_visualizations enable row level security;
grant select,insert,update on public.upload_tickets to packapprove_app;
grant select,insert on public.version_visualizations to packapprove_app;
grant select on public.version_visualizations to authenticated;
create policy tickets_read on public.upload_tickets for select to packapprove_app using(user_id=public.actor_id());
create policy tickets_insert on public.upload_tickets for insert to packapprove_app with check(user_id=public.actor_id() and public.actor_role()='designer' and exists(select 1 from public.artworks a where a.id=artwork_id and public.can_project(a.project_id)));
create policy tickets_update on public.upload_tickets for update to packapprove_app using(user_id=public.actor_id() and public.actor_role()='designer') with check(user_id=public.actor_id());
create policy visual_read on public.version_visualizations for select using(public.can_version(version_id));
create policy visual_insert on public.version_visualizations for insert to packapprove_app with check(author_id=public.actor_id() and public.actor_role()='designer' and public.can_version(version_id));
create trigger visual_immutable before update or delete on public.version_visualizations for each row execute function public.reject_mutation();
create trigger ticket_touch before update on public.upload_tickets for each row execute function public.touch_row();
create index upload_tickets_cleanup on public.upload_tickets(expires_at,status);
-- New artworks use the manufacturer's aluminium packaging type; existing rows stay intact.
alter table public.artworks alter column packaging_type set default 'Алюминиевая банка';
