import postgres from "postgres";
import { runtimeDiagnosis } from "./runtime-database";
import { assertDeploymentBackend } from "./deployment-guard";
import { isolatedDemoEnabled } from "./demo-environment";
import { AppError } from "./security";
export type Tx = postgres.TransactionSql;
const globalDb = globalThis as unknown as {
  packDb?: ReturnType<typeof postgres>;
};
export const db =
  globalDb.packDb ??
  postgres(
    process.env.DATABASE_URL ||
      "postgresql://postgres:postgres@127.0.0.1:54322/postgres",
    { max: 8, prepare: false },
  );
if (process.env.NODE_ENV !== "production") globalDb.packDb = db;
export async function asUser<T>(
  id: string,
  fn: (tx: Tx) => Promise<T>,
): Promise<T> {
  assertDeploymentBackend();
  await verifyRuntime();
  return (await db.begin(async (tx) => {
    await tx`set local role packapprove_app`;
    await tx`select set_config('app.user_id',${id},true)`;
    return await fn(tx);
  })) as T;
}

let runtimeCheck: Promise<void> | undefined;
async function verifyRuntime() {
  if (process.env.NODE_ENV !== "production" || isolatedDemoEnabled()) return;
  if (!runtimeCheck)
    runtimeCheck = (async () => {
      const check = await runtimeDiagnosis(db);
      if (!check.safe)
        throw new AppError(
          503,
          "Нужна безопасная настройка подключения к базе. Обратитесь к администратору.",
        );
    })().catch((e) => {
      runtimeCheck = undefined;
      throw e;
    });
  await runtimeCheck;
}
