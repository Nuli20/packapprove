import { readFileSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import postgres from "postgres";
import { describe, it, expect, vi } from "vitest";
const cookieJar = vi.hoisted(() => new Map<string, string>());
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: (key: string) =>
      cookieJar.has(key) ? { value: cookieJar.get(key) } : undefined,
    set: (key: string, value: string) => cookieJar.set(key, value),
    delete: (key: string) => cookieJar.delete(key),
    getAll: () => Array.from(cookieJar, ([name, value]) => ({ name, value })),
  }),
}));
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
if (
  process.env.NEXT_PUBLIC_DEMO_MODE !== "true" ||
  !/^postgres(ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):54322\//.test(
    process.env.DATABASE_URL || "",
  ) ||
  !/^http:\/\/(127\.0\.0\.1|localhost):54321$/.test(
    process.env.SUPABASE_URL || "",
  )
)
  throw Error(
    "Recovery integration tests require the isolated local demo stack",
  );
import { acceptRecovery, changeRecoveredPassword } from "../lib/recovery";
describe("Real Supabase Auth recovery on an isolated temporary account", () => {
  it("consumes one-time provider recovery token, updates password and preserves profile role", async () => {
    const admin = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { persistSession: false, autoRefreshToken: false } },
    );
    const db = postgres(process.env.DATABASE_URL!, { max: 1 });
    let id: string | undefined;
    const email = `recovery-${randomUUID()}@packapprove.local`;
    try {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password: "InitialTemporary2026!",
        email_confirm: true,
      });
      expect(Boolean(error)).toBe(false);
      id = data.user!.id;
      await db`insert into profiles(id,full_name,role) values(${id},'Recovery test','observer')`;
      await expect(
        changeRecoveredPassword("NewTemporaryPassword2026!"),
      ).rejects.toMatchObject({ status: 401 });
      const link = await admin.auth.admin.generateLink({
        type: "recovery",
        email,
      });
      expect(Boolean(link.error)).toBe(false);
      const token = link.data.properties!.hashed_token;
      await acceptRecovery(new URLSearchParams({ token_hash: token }));
      expect(cookieJar.has("pa_recovery")).toBe(true);
      await changeRecoveredPassword("NewTemporaryPassword2026!");
      expect(cookieJar.has("pa_recovery")).toBe(false);
      expect(
        (await db`select role,full_name from profiles where id=${id}`)[0],
      ).toMatchObject({ role: "observer", full_name: "Recovery test" });
      const anon = createClient(
        process.env.SUPABASE_URL!,
        process.env.SUPABASE_ANON_KEY!,
        { auth: { persistSession: false, autoRefreshToken: false } },
      );
      expect(
        Boolean(
          (
            await anon.auth.signInWithPassword({
              email,
              password: "NewTemporaryPassword2026!",
            })
          ).data.user,
        ),
      ).toBe(true);
      expect(
        Boolean(
          (
            await anon.auth.signInWithPassword({
              email,
              password: "InitialTemporary2026!",
            })
          ).error,
        ),
      ).toBe(true);
      await expect(
        acceptRecovery(new URLSearchParams({ token_hash: token })),
      ).rejects.toMatchObject({ status: 400 });
    } finally {
      cookieJar.clear();
      if (id) {
        await db`delete from profiles where id=${id}`;
        await admin.auth.admin.deleteUser(id);
      }
      await db.end();
    }
  });
});
