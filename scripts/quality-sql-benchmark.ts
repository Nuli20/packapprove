import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import { localTestEnvironment } from "../tests/local-environment";
localTestEnvironment();
import { mkdir, writeFile } from "node:fs/promises";
const { db } = await import("../lib/db");
const { snapshot } = await import("../lib/queries");
const { workspaceSnapshot } = await import("../lib/queries/workspace");
const user = (
  await db`select id,role,full_name from profiles where id=(select id from auth.users where email='manager@packapprove.local')`
)[0];
const runs: Record<string, number[]> = { before: [], after: [] };
try {
  for (let i = 0; i < 4; i++)
    for (const name of ["before", "after"]) {
      const t = performance.now();
      if (name === "before") await snapshot(user as any);
      else await workspaceSnapshot(user as any, { view: "home" });
      runs[name].push(performance.now() - t);
    }
  await mkdir(".data/quality-performance", { recursive: true });
  await writeFile(
    ".data/quality-performance/sql.json",
    JSON.stringify(
      {
        measurement:
          "RLS transaction wall time, includes PostgreSQL round trips and materialization; excludes Auth/HTTP/JSON serialization. Same running database and runtime connection. Four alternating samples per projection on a warmed connection; discard the first as query warm-up and take the median of the following three.",
        runs,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(runs));
} finally {
  await db.end();
}
