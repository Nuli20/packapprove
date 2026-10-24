import postgres from "postgres";
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
  return (await db.begin(async (tx) => {
    await tx`set local role packapprove_app`;
    await tx`select set_config('app.user_id',${id},true)`;
    return await fn(tx);
  })) as T;
}
