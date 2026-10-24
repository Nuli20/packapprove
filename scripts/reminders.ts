import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
const db = postgres(process.env.DATABASE_URL!, { max: 1 });
try {
  const sent =
    await db`insert into notifications(user_id,project_id,kind,message)
 select ap.user_id,a.project_id,case when r.deadline<now() then 'deadline.overdue' else 'deadline.soon' end,r.id::text
 from approval_rounds r join artworks a on a.id=r.artwork_id join approval_participants ap on ap.round_id=r.id
 where r.status='open' and r.deadline<now()+interval '24 hours' and not exists(select 1 from notifications n where n.user_id=ap.user_id and n.message=r.id::text and n.kind=case when r.deadline<now() then 'deadline.overdue' else 'deadline.soon' end) returning id`;
  console.log(`${sent.length} deadline notifications created.`);
} finally {
  await db.end();
}
