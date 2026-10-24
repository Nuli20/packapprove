import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
if (
  process.env.NEXT_PUBLIC_DEMO_MODE !== "true" ||
  !/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):54322\//.test(
    process.env.DATABASE_URL || "",
  )
)
  throw Error("Cleanup is allowed only on explicitly local demo database");
const db = postgres(process.env.DATABASE_URL!, { max: 1 });
const supa = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
);
try {
  const p = (
    await db`select id from projects where name like 'TEST %' or name like 'E2E %'`
  ).map((r) => r.id);
  if (p.length) {
    const a = (
      await db`select id from artworks where project_id in ${db(p)}`
    ).map((r) => r.id);
    const v = (
      await db`select id from artwork_versions where artwork_id in ${db(a)}`
    ).map((r) => r.id);
    const f = v.length
      ? await db`select id,storage_path from version_files where version_id in ${db(v)}`
      : [];
    const r = v.length
      ? (
          await db`select id from approval_rounds where version_id in ${db(v)}`
        ).map((r) => r.id)
      : [];
    const pkg = (
      await db`select id from production_packages where project_id in ${db(p)}`
    ).map((r) => r.id);
    const tr = v.length
      ? (
          await db`select id from technical_reviews where version_id in ${db(v)}`
        ).map((r) => r.id)
      : [];
    const threads = v.length
      ? (
          await db`select id from comment_threads where version_id in ${db(v)}`
        ).map((r) => r.id)
      : [];
    if (f.length) {
      const { error } = await supa.storage
        .from("artworks")
        .remove(f.map((r) => r.storage_path));
      if (error) throw error;
    }
    await db.begin(async (tx) => {
      await tx`set local session_replication_role='replica'`;
      const del = async (table: string, column: string, ids: string[]) => {
        if (ids.length)
          await tx`delete from ${tx(table)} where ${tx(column)} in ${tx(ids)}`;
      };
      for (const t of [
        "package_acknowledgements",
        "package_revocations",
        "production_package_files",
        "download_events",
      ])
        await del(t, "package_id", pkg);
      await del(
        "download_events",
        "file_id",
        f.map((r) => r.id),
      );
      await del("production_packages", "id", pkg);
      await del("production_orders", "project_id", p);
      for (const t of ["approval_decisions", "approval_participants"])
        await del(t, "round_id", r);
      await del("approval_rounds", "id", r);
      await del("technical_review_items", "review_id", tr);
      await del("technical_reviews", "id", tr);
      for (const t of ["comments", "comment_resolution_links"])
        await del(t, "thread_id", threads);
      await del("comment_threads", "id", threads);
      await del(
        "file_previews",
        "file_id",
        f.map((r) => r.id),
      );
      await del(
        "version_files",
        "id",
        f.map((r) => r.id),
      );
      await del("artwork_versions", "id", v);
      await del("brief_versions", "artwork_id", a);
      await del("artworks", "id", a);
      for (const t of ["project_members", "notifications", "audit_logs"])
        await del(t, "project_id", p);
      await del("projects", "id", p);
      const entities = [...p, ...a, ...v, ...r, ...pkg, ...tr, ...threads];
      await tx`delete from idempotency_keys where response->>'id' in ${tx(entities)}`;
    });
    console.log(
      `Removed ${p.length} generated test projects and their private objects.`,
    );
  } else console.log("No generated test projects.");
  const markers = (
    await db`select t.id from comment_threads t where exists(select 1 from comments c where c.thread_id=t.id and c.body like 'E2E marker %') and not exists(select 1 from comments c where c.thread_id=t.id and c.body not like 'E2E marker %')`
  ).map((r) => r.id);
  if (markers.length)
    await db.begin(async (tx) => {
      await tx`set local session_replication_role='replica'`;
      await tx`delete from comments where thread_id in ${tx(markers)}`;
      await tx`delete from comment_threads where id in ${tx(markers)}`;
      await tx`delete from audit_logs where entity_id in ${tx(markers)}`;
      await tx`delete from idempotency_keys where response->>'id' in ${tx(markers)}`;
    });
} finally {
  await db.end();
}
