import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { readFile } from "node:fs/promises";
const sql = postgres(process.env.DATABASE_URL!, { max: 1 });
try {
  await sql`create table if not exists public.schema_migrations(name text primary key, applied_at timestamptz not null default now())`;
  const name = "202610240001_core.sql";
  if (
    !(await sql`select to_regclass('public.organizations') as exists`)[0].exists
  ) {
    await sql.begin(async (tx) => {
      await tx.unsafe(await readFile(`supabase/migrations/${name}`, "utf8"));
      await tx`insert into schema_migrations(name) values(${name})`;
    });
  }
  console.log("Schema ready.");
} finally {
  await sql.end();
}
