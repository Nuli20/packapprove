import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { readFile, readdir } from "node:fs/promises";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
const baseline = "202610240001_core.sql";
try {
  const files = (await readdir("supabase/migrations"))
    .filter((f) => /^\d+_.*\.sql$/.test(f))
    .sort();
  const existing = (
    await sql`select to_regclass('public.organizations') as name`
  )[0].name;
  const registry = (
    await sql`select to_regclass('public.schema_migrations') as name`
  )[0].name;
  const applied = registry
    ? (await sql`select name from public.schema_migrations`).map((r) => r.name)
    : [];
  if (process.argv.includes("--plan")) {
    for (const f of files)
      console.log(
        `${applied.includes(f) || (f === baseline && existing) ? "applied" : "pending"} ${f}`,
      );
  } else
    await sql.begin(async (tx) => {
      await tx`select pg_advisory_xact_lock(703251001)`;
      await tx`create table if not exists public.schema_migrations(name text primary key,applied_at timestamptz not null default now())`;
      for (const name of files) {
        if (
          (
            await tx`select name from public.schema_migrations where name=${name}`
          ).length
        )
          continue;
        if (name === baseline && existing) {
          await tx`insert into public.schema_migrations(name) values(${name})`;
          continue;
        }
        await tx.unsafe(await readFile(`supabase/migrations/${name}`, "utf8"));
        await tx`insert into public.schema_migrations(name) values(${name})`;
        console.log(`Applied ${name}`);
      }
    });
  console.log("Migration check complete.");
} finally {
  await sql.end();
}
