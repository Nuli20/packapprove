import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { execFileSync } from "node:child_process";
import { readFile, readdir } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { isolatedDemoEnabled } from "../lib/demo-environment";
if (!isolatedDemoEnabled())
  throw Error("Scratch migration test requires the separate local fixture.");
const owner = postgres(process.env.DATABASE_URL!, { max: 1 });
const name =
  "packapprove_migration_check_" +
  randomUUID().replaceAll("-", "").slice(0, 12);
let scratch: ReturnType<typeof postgres> | undefined;
let created = false;
try {
  await owner.unsafe(`create database ${name}`);
  created = true;
  const schema = execFileSync(
    "docker",
    [
      "exec",
      "packapprove-db-1",
      "pg_dump",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "--schema-only",
      "--schema=auth",
      "--schema=storage",
      "--schema=extensions",
    ],
    { maxBuffer: 16 * 1024 * 1024 },
  );
  execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "packapprove-db-1",
      "psql",
      "-U",
      "postgres",
      "-d",
      name,
      "-v",
      "ON_ERROR_STOP=1",
    ],
    {
      input: schema,
      stdio: ["pipe", "pipe", "pipe"],
      maxBuffer: 16 * 1024 * 1024,
    },
  );
  const url = new URL(process.env.DATABASE_URL!);
  url.pathname = "/" + name;
  scratch = postgres(url.href, { max: 1 });
  const migrations = (await readdir("supabase/migrations"))
    .filter((n) => /^\d+_.*\.sql$/.test(n))
    .sort();
  await scratch.begin(async (tx) => {
    for (const file of migrations)
      await tx.unsafe(await readFile("supabase/migrations/" + file, "utf8"));
  });
  const functions =
    await scratch`select proname,prosecdef,proconfig,has_function_privilege('anon',oid,'EXECUTE') as anon,has_function_privilege('authenticated',oid,'EXECUTE') as browser,has_function_privilege('packapprove_app',oid,'EXECUTE') as server from pg_proc where pronamespace='public'::regnamespace and proname in ('invitation_lookup','invitation_finish','invitation_registration_state')`;
  if (
    functions.length !== 3 ||
    functions.some(
      (p) =>
        !p.prosecdef ||
        !p.proconfig.includes("search_path=pg_catalog") ||
        p.anon ||
        p.browser ||
        !p.server,
    )
  )
    throw Error("Capability function ACL/search_path check failed");
  const tables =
    await scratch`select relname,relrowsecurity from pg_class where oid in ('public.invitations'::regclass,'public.profiles'::regclass,'public.organization_memberships'::regclass,'public.version_visualizations'::regclass)`;
  if (tables.some((t) => !t.relrowsecurity)) throw Error("RLS is disabled");
  console.log(
    JSON.stringify({
      migrations: migrations.length,
      functions: 3,
      serverOnlyExecute: true,
      fixedSearchPath: true,
      rls: true,
      scratchOnly: true,
    }),
  );
} finally {
  await scratch?.end();
  if (created) await owner.unsafe(`drop database ${name}`);
  await owner.end();
}
