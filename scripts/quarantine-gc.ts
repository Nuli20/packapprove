import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
const remote = !["127.0.0.1", "localhost"].includes(
  new URL(process.env.DATABASE_URL!).hostname,
);
if (remote && !process.argv.includes("--allow-remote"))
  throw Error(
    "Remote maintenance requires explicit --allow-remote. Default is local only.",
  );
const apply = process.argv.includes("--apply");
if (apply && !process.argv.includes("--confirm-quarantine-only"))
  throw Error(
    "Confirm scope with --confirm-quarantine-only; final version files are never selected.",
  );
const db = postgres(process.env.DATABASE_URL!, { max: 1 });
try {
  await db.begin(async (tx) => {
    await tx`select pg_advisory_xact_lock(703253005)`;
    const tickets =
      await tx`select id,user_id,storage_path from upload_tickets where expires_at<now()-interval '5 minutes' order by expires_at limit 100 for update`;
    for (const t of tickets)
      if (t.storage_path !== `_quarantine/${t.user_id}/${t.id}`)
        throw Error("Unexpected staging path. Refusing maintenance.");
    console.log(
      `${apply ? "Apply" : "Dry run"}: ${tickets.length} expired quarantine objects. Final version objects excluded.`,
    );
    if (apply && tickets.length) {
      const storage = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { auth: { persistSession: false } },
      ).storage.from("artworks");
      const { error } = await storage.remove(
        tickets.map((t) => t.storage_path),
      );
      if (error)
        throw Error("Storage cleanup failed; ticket metadata retained.");
      await tx`delete from upload_tickets where id in ${tx(tickets.map((t) => t.id))}`;
      await tx`insert into audit_logs(action,detail) values('storage.quarantine.gc',${tx.json({ count: tickets.length })})`;
    }
  });
} finally {
  await db.end();
}
