import { z } from "zod";
import { asUser, type Tx } from "../db";
import { assert, permit } from "../security";
import { isolatedDemoEnabled } from "../demo-environment";
import { stateTables, type WorkspaceState } from "../models";
import type { User } from "../service";

export const workspaceQuery = z.object({
 view: z.enum(["home","projects","project","artwork","tasks","internal","approval","changes","ready","packages","clients","settings","setup","notifications","reports","audit","allArtworks","approvedVersions","clientComments","clientHistory"]),
 page: z.coerce.number().int().min(1).max(100000).default(1),
 pageSize: z.coerce.number().int().min(1).max(50).default(12),
 project: z.uuid().optional(), artwork: z.uuid().optional(), version: z.uuid().optional(), compare: z.uuid().optional(),
 q: z.string().trim().max(120).default(""), organization: z.uuid().optional(),
 status: z.enum(["","active","paused","completed","archived"]).default(""),
 sort: z.enum(["deadline","name","created_at"]).default("deadline"),
});
export type WorkspaceQuery = z.infer<typeof workspaceQuery>;
const fileColumns = "id,version_id,kind,filename,mime_type,size,sha256,created_at";
const unique = (values: (string|null|undefined)[]) => [...new Set(values.filter(Boolean))] as string[];

/** Every statement remains on the same verified-user RLS transaction. No shared cache. */
export async function workspaceSnapshot(u: User, input: unknown): Promise<WorkspaceState> {
 const q = workspaceQuery.parse(input), offset = (q.page-1)*q.pageSize;
 if(q.view==='home'&&u.role==='production')q.view='packages';
 return asUser(u.id, async tx => {
  const d = Object.fromEntries(stateTables.map(k=>[k,[]])) as unknown as WorkspaceState;
  d.user = u as WorkspaceState["user"];
  d.demo_context = isolatedDemoEnabled() ? [{enabled:true}] : [];
  let total=0;
  const projectIds: string[] = [], artworkIds: string[] = [];
  const setPage = (n:number) => { d.pagination={page:q.page,pageSize:q.pageSize,total:n,pages:Math.max(1,Math.ceil(n/q.pageSize))}; };
  const projectsByIds = async(ids:string[]) => ids.length ? tx`select p.*,o.name as organization_name from projects p join organizations o on o.id=p.organization_id where p.id in ${tx(ids)} order by p.deadline,p.id` : [];
  const catalog = async() => {
   const where = tx`(${q.q}='' or p.name ilike ${'%'+q.q+'%'} or o.name ilike ${'%'+q.q+'%'}) and (${q.status}='' or p.status=${q.status}) and (${q.organization||null}::uuid is null or p.organization_id=${q.organization||null}::uuid)`;
   const rows=await tx`select p.*,o.name as organization_name,(select count(*)::int from artworks a where a.project_id=p.id) as artwork_count,count(*) over()::int as _total from projects p join organizations o on o.id=p.organization_id where ${where} order by ${tx('p.'+q.sort)},p.id limit ${q.pageSize} offset ${offset}`;
   total=rows[0]?._total ?? Number((await tx`select count(*)::int as n from projects p join organizations o on o.id=p.organization_id where ${where}`)[0].n);
   d.projects=rows as unknown as WorkspaceState["projects"];setPage(total);projectIds.push(...rows.map(p=>p.id));
  };
  if(q.view==='home') {
   const [metrics]=await tx`select
    (select count(*)::int from projects where status='active') as "activeProjects",
    (select count(*)::int from artworks) as artworks,
    (select count(*)::int from projects) as projects,
    (select count(*)::int from approval_rounds where status='open') as awaiting,
    (select count(*)::int from approval_rounds where status='open' and deadline<now()) as overdue,
    (select count(*)::int from artworks a join artwork_versions v on v.id=a.active_version_id where v.status='approved') as approved,
    (select count(*)::int from production_packages where status='transferred') as "pendingReceive",
    (select count(*)::int from production_packages where status='revoked') as revoked,
    (select count(*)::int from notifications where read_at is null) as unread`;
   d.metrics=metrics as Record<string,number>;
   if(u.role==='admin') {
    const [s]=await tx`select exists(select 1 from organizations where kind='manufacturer') and exists(select 1 from organizations where kind='client') and exists(select 1 from profiles where role='designer' and active) and exists(select 1 from profiles where role='prepress' and active) and exists(select 1 from projects) as complete`;
    d.setup_complete=s.complete;
    if(!s.complete) await setupContext(tx,d);
   }
   d.projects=await tx`select p.*,o.name as organization_name from projects p join organizations o on o.id=p.organization_id where p.status='active' order by p.deadline,p.id limit 6` as unknown as WorkspaceState['projects'];
   projectIds.push(...d.projects.map(p=>p.id));
   d.notifications=await tx`select * from notifications order by created_at desc,id limit 6`;
  } else if(q.view==='projects') await catalog();
  else if(q.view==='project') {
   assert(q.project,'Укажите проект',400);d.projects=await projectsByIds([q.project]) as WorkspaceState['projects'];assert(d.projects.length,'Проект недоступен',404);projectIds.push(q.project);
  } else if(q.view==='artwork') {
   assert(q.artwork,'Укажите макет',400);d.artworks=await tx`select * from artworks where id=${q.artwork}` as unknown as WorkspaceState['artworks'];assert(d.artworks.length,'Макет недоступен',404);
   d.projects=await projectsByIds([d.artworks[0].project_id]) as WorkspaceState['projects'];
  } else if(q.view==='clientHistory') {
   const rows=await tx`select r.*,a.project_id as _project_id,count(*) over()::int as _total from approval_rounds r join artwork_versions v on v.id=r.version_id join artworks a on a.id=v.artwork_id order by r.created_at desc,r.id limit ${q.pageSize} offset ${offset}`;
   d.rounds=rows as unknown as WorkspaceState['rounds'];setPage(rows[0]?._total||0);artworkIds.push(...unique(rows.map(r=>r.artwork_id)));projectIds.push(...unique(rows.map(r=>r._project_id)));
  } else if(q.view==='clientComments') {
   const rows=await tx`select t.*,a.project_id as _project_id,count(*) over()::int as _total from comment_threads t join artwork_versions v on v.id=t.version_id join artworks a on a.id=v.artwork_id order by t.created_at desc,t.id limit ${q.pageSize} offset ${offset}`;
   d.threads=rows;setPage(rows[0]?._total||0);artworkIds.push(...unique(rows.map(r=>r._artwork_id)));
   // Resolve parents from the permitted versions, never from caller-provided IDs.
   if(rows.length){const parents=await tx`select distinct a.id,a.project_id from artworks a join artwork_versions v on v.artwork_id=a.id where v.id in ${tx(unique(rows.map(r=>r.version_id)))}`;artworkIds.push(...parents.map(a=>a.id));projectIds.push(...parents.map(a=>a.project_id));}
  } else if(['clients','settings','setup'].includes(q.view)) {
   permit(u.role,['admin','manager']);await setupContext(tx,d);
   if(q.view!=='setup') {
    d.invitations=await tx`select id,organization_id,email,role,invited_by,accepted_at,expires_at,created_at from invitations order by created_at desc,id limit ${q.pageSize} offset ${offset}`;
    setPage(Number((await tx`select count(*)::int as n from invitations`)[0].n));
   }
  } else if(q.view==='notifications') {
   d.notifications=await tx`select * from notifications order by created_at desc,id limit ${q.pageSize} offset ${offset}`;
   setPage(Number((await tx`select count(*)::int as n from notifications`)[0].n));projectIds.push(...unique(d.notifications.map(n=>n.project_id)));
  } else if(q.view==='audit') {
   permit(u.role,['admin']);d.audit=await tx`select * from audit_logs order by created_at desc,id limit ${q.pageSize} offset ${offset}`;
   setPage(Number((await tx`select count(*)::int as n from audit_logs`)[0].n));projectIds.push(...unique(d.audit.map(a=>a.project_id)));
  } else if(q.view==='packages') {
   // Production home is normalized to packages by the caller.
   d.packages=await tx`select * from production_packages order by created_at desc,id limit ${q.pageSize} offset ${offset}` as unknown as WorkspaceState['packages'];
   setPage(Number((await tx`select count(*)::int as n from production_packages`)[0].n));artworkIds.push(...d.packages.map(p=>p.artwork_id));projectIds.push(...d.packages.map(p=>p.project_id));
  } else if(q.view==='reports') {
   permit(u.role,['admin','manager','designer','prepress']);
   const [report]=await tx`select (select coalesce(avg(extract(epoch from (closed_at-created_at))/3600),0)::float from approval_rounds where status in ('approved','changes_requested') and closed_at is not null) as hours,(select count(*)::int from approval_rounds) as rounds,(select count(*)::int from artwork_versions) as versions,(select count(*)::int from approval_rounds where status='superseded') as replaced,(select count(*)::int from approval_rounds where status='cancelled') as cancelled`;
   const workload=await tx`select p.id,p.full_name,count(pr.id)::int as count from profiles p left join projects pr on pr.designer_id=p.id and pr.status='active' where p.role='designer' group by p.id,p.full_name order by count(pr.id) desc,p.id limit 50`;
   const overdue=await tx`select o.id,o.name,count(p.id)::int as count from organizations o join projects p on p.organization_id=o.id where p.status='active' and p.deadline<current_date group by o.id,o.name order by count(p.id) desc,o.id limit 50`;
   d.report={...report,workload,overdue} as unknown as WorkspaceState['report'];
   d.packages=await tx`select * from production_packages order by created_at desc,id limit 12` as unknown as WorkspaceState['packages'];
   d.metrics={pendingReceive:Number((await tx`select count(*)::int as n from production_packages where status='transferred'`)[0].n)};
   projectIds.push(...d.packages.map(p=>p.project_id));artworkIds.push(...d.packages.map(p=>p.artwork_id));
  } else {
   // Bounded operational queues. Ordinary comments are deliberately not a correction gate.
   const rows=await tx`with work as (
    select a.id,a.project_id,a.deadline,p.status as project_status,p.manager_id,p.designer_id,p.prepress_id,
     v.id as vid,v.status as vs,t.status as ts,r.id as rid,r.status as rs,r.deadline as rd,pp.id as pkg,
     case when pp.id is not null then 'production' when v.status='changes_requested' or t.status in ('limited','correction') then 'changes'
      when v.status='approved' and r.status='approved' and t.status='ready' then 'ready' when r.status='open' then 'approval'
      when v.status='internal_review' or (v.status='approved' and t.status is distinct from 'ready') then case when t.status='ready' then 'dispatch' else 'internal' end else 'design' end as stage
    from artworks a join projects p on p.id=a.project_id
    left join artwork_versions v on v.id=a.active_version_id
    left join technical_reviews t on t.version_id=v.id
    left join lateral(select id,status,deadline from approval_rounds where version_id=v.id order by created_at desc,id desc limit 1) r on true
    left join production_packages pp on pp.version_id=v.id
    where (${q.q}='' or a.name ilike ${'%'+q.q+'%'} or p.name ilike ${'%'+q.q+'%'})
   ) select *,count(*) over()::int as _total from work w where
    (${q.view}='allArtworks' or (${q.view}='approvedVersions' and vs='approved') or
     (${q.view}='clientHistory' and rid is not null) or (${q.view}='clientComments' and exists(select 1 from comment_threads where version_id=w.vid)) or
     (${q.view}='changes' and stage='changes') or (${q.view} in ('internal','approval','ready') and stage=${q.view}) or
     (${q.view}='tasks' and project_status='active' and pkg is null and (
      (${u.role}='designer' and stage in ('design','changes') and designer_id=${u.id}) or
      (${u.role}='prepress' and stage='internal' and prepress_id=${u.id}) or
      (${u.role}='manager' and stage in ('dispatch','ready') and manager_id=${u.id}) or
      (${u.role}='approver' and rs='open' and exists(select 1 from approval_participants where round_id=w.rid and user_id=${u.id} and kind='approver') and not exists(select 1 from approval_decisions where round_id=w.rid and user_id=${u.id}))
     ))) order by coalesce(rd,deadline::timestamptz),id limit ${q.pageSize} offset ${offset}`;
   setPage(rows[0]?._total||0);artworkIds.push(...rows.map(a=>a.id));projectIds.push(...rows.map(a=>a.project_id));
  }
  if(projectIds.length && !d.projects.length) d.projects=await projectsByIds(unique(projectIds)) as WorkspaceState['projects'];
  if(!d.artworks.length && (projectIds.length||artworkIds.length) && !['notifications','audit'].includes(q.view)) {
   d.artworks=artworkIds.length
    ? await tx`select * from artworks where id in ${tx(unique(artworkIds))} order by deadline,id` as unknown as WorkspaceState['artworks']
    : ['home','projects'].includes(q.view)
      ? await tx`select * from (select a.*,row_number() over(partition by project_id order by created_at,id) as _rank from artworks a where project_id in ${tx(unique(projectIds))}) a where _rank<=3 order by deadline,id` as unknown as WorkspaceState['artworks']
      : await tx`select * from artworks where project_id in ${tx(unique(projectIds))} order by deadline,id limit ${q.pageSize} offset ${offset}` as unknown as WorkspaceState['artworks'];
   if(q.view==='project')setPage(Number((await tx`select count(*)::int as n from artworks where project_id=${q.project!}`)[0].n));
  }
  const aids=d.artworks.map(a=>a.id);
  if(aids.length) {
   if(q.view==='artwork') {
    d.versions=await tx`select * from artwork_versions where artwork_id=${aids[0]} order by number desc limit 50` as unknown as WorkspaceState['versions'];
    for(const id of unique([q.version,q.compare])) if(!d.versions.some(v=>v.id===id)) {
     const rows=await tx`select * from artwork_versions where id=${id} and artwork_id=${aids[0]}`;
     assert(rows.length,'Версия недоступна',404);d.versions.push(...rows as unknown as WorkspaceState['versions']);
    }
   } else d.versions=await tx`select distinct on (artwork_id) * from artwork_versions where artwork_id in ${tx(aids)} order by artwork_id,number desc` as unknown as WorkspaceState['versions'];
   const extraPackageVersions=unique([...d.packages.map(p=>p.version_id),...d.rounds.map(r=>r.version_id),...d.threads.map(t=>t.version_id)]).filter(id=>!d.versions.some(v=>v.id===id));
   if(extraPackageVersions.length)d.versions.push(...await tx`select * from artwork_versions where id in ${tx(extraPackageVersions)}` as unknown as WorkspaceState['versions']);
   const vids=d.versions.map(v=>v.id),detail=q.view==='artwork';
   const selected=detail ? q.version||d.artworks[0].active_version_id : null;
   const fileVersions=detail ? unique([d.versions.find(v=>v.id===selected)?.id||d.versions[0]?.id,q.compare||d.versions.find(v=>v.id!==selected)?.id]) : vids;
   if(fileVersions.length) {
    d.files=await tx`select ${tx.unsafe(fileColumns)} from version_files where version_id in ${tx(fileVersions)}` as unknown as WorkspaceState['files'];
    d.visualizations=await tx`select * from version_visualizations where version_id in ${tx(fileVersions)}`;
   }
   if(vids.length) {
    if(q.view!=='clientHistory')d.rounds=await tx`select * from approval_rounds where version_id in ${tx(vids)} order by created_at desc,id desc` as unknown as WorkspaceState['rounds'];
    d.reviews=await tx`select * from technical_reviews where version_id in ${tx(detail?fileVersions:vids)}`;
    const rids=d.rounds.map(r=>r.id);
    if(rids.length){d.participants=await tx`select * from approval_participants where round_id in ${tx(rids)}`;d.decisions=await tx`select * from approval_decisions where round_id in ${tx(rids)}` as unknown as WorkspaceState['decisions'];}
    if(detail||q.view==='clientComments') {
     const threadVids=detail?fileVersions:vids;
     if(q.view!=='clientComments')d.threads=await tx`select * from comment_threads where version_id in ${tx(threadVids)} order by created_at,id limit 200`;
     if(d.threads.length){d.comments=await tx`select * from comments where thread_id in ${tx(d.threads.map(t=>t.id))} order by created_at,id`;d.resolutions=await tx`select * from comment_resolution_links where thread_id in ${tx(d.threads.map(t=>t.id))}`;}
    }
    if(!d.packages.length) d.packages=await tx`select * from production_packages where version_id in ${tx(vids)}` as unknown as WorkspaceState['packages'];
   }
   if(detail) {
    d.briefs=await tx`select * from brief_versions where artwork_id=${aids[0]} order by number desc limit 20`;
    if(['admin','manager','designer','prepress'].includes(u.role))d.templates=await tx`select v.*,t.name from checklist_template_versions v join checklist_templates t on t.id=v.template_id order by v.created_at desc limit 30`;
    if(d.reviews.length)d.reviewItems=await tx`select * from technical_review_items where review_id in ${tx(d.reviews.map(r=>r.id))}`;
   }
  }
  if(d.packages.length && ['packages','artwork'].includes(q.view)) {
   const ids=d.packages.map(p=>p.id);
   d.revocations=await tx`select * from package_revocations where package_id in ${tx(ids)}`;
   d.acknowledgements=await tx`select * from package_acknowledgements where package_id in ${tx(ids)}`;
   d.downloads=await tx`select * from download_events where package_id in ${tx(ids)} order by created_at desc limit 100`;
  }
  // Only directory records needed by this response, still filtered by RLS.
  if(!d.profiles.length) {
   const ids=unique([u.id,...d.projects.flatMap(p=>[p.manager_id,p.designer_id,p.prepress_id]),...d.participants.map(p=>p.user_id),...d.threads.map(t=>t.author_id),...d.comments.map(c=>c.author_id),...d.decisions.map(c=>c.user_id),...d.audit.map(a=>a.actor_id),...d.reviews.map(r=>r.reviewer_id)]);
   d.profiles=await tx`select id,full_name,role,active,row_version from profiles where id in ${tx(ids)}` as unknown as WorkspaceState['profiles'];
  }
  if(!d.organizations.length && d.projects.length) d.organizations=await tx`select * from organizations where id in ${tx(unique(d.projects.map(p=>p.organization_id)))}`;
  // Round dialog needs same-organization participants; no directory is returned to clients.
  if(q.view==='artwork'&&['admin','manager'].includes(u.role)&&d.projects[0]) {
   d.memberships=await tx`select * from organization_memberships where organization_id=${d.projects[0].organization_id}`;
   const ids=unique(d.memberships.map(m=>m.user_id));if(ids.length){const rows=await tx`select id,full_name,role,active,row_version from profiles where id in ${tx(ids)}`;d.profiles.push(...rows.filter(r=>!d.profiles.some(p=>p.id===r.id)) as unknown as WorkspaceState['profiles']);}
  }
  return d;
 });
}

async function setupContext(tx:Tx,d:WorkspaceState) {
 d.organizations=await tx`select * from organizations order by kind,name`;
 d.profiles=await tx`select id,full_name,role,active,row_version from profiles order by full_name` as unknown as WorkspaceState['profiles'];
 d.memberships=await tx`select * from organization_memberships`;
 d.templates=await tx`select v.*,t.name from checklist_template_versions v join checklist_templates t on t.id=v.template_id order by v.number desc`;
}
