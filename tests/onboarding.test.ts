import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const match = line.match(/^([A-Z_]+)=(.*)$/);
  if (match) process.env[match[1]] = match[2];
}
if (
  !/^postgres(?:ql)?:\/\/[^@]+@(127\.0\.0\.1|localhost):54322\//.test(
    process.env.DATABASE_URL || "",
  )
)
  throw Error(
    "Onboarding integration tests require the isolated local database",
  );
import { beforeAll, describe, it, expect } from "vitest";
import { db } from "../lib/db";
import { execute, type User } from "../lib/service";
import { invitationInfo } from "../lib/invitations";
import { randomUUID } from "node:crypto";
let admin: User, manager: User, org: string;
beforeAll(async () => {
  const profiles = await db`select id,role from profiles`;
  admin = profiles.find((p) => p.role === "admin") as User;
  manager = profiles.find((p) => p.role === "manager") as User;
  org = (await db`select id from organizations where kind='client' limit 1`)[0]
    .id;
});
describe("Production-safe onboarding commands", () => {
  it("initializes manufacturer and templates without duplicating existing records", async () => {
    const before =
      await db`select id from organizations where kind='manufacturer'`;
    const r = await execute(admin, randomUUID(), {
      action: "company.initialize",
      payload: {},
    });
    const second = await execute(admin, randomUUID(), {
      action: "company.initialize",
      payload: {},
    });
    expect(r.id).toBe(second.id);
    expect(
      (await db`select id from organizations where kind='manufacturer'`).length,
    ).toBe(1);
    if (before.length) expect(r.id).toBe(before[0].id);
  });
  it("refuses manufacturer initialization by a manager", async () => {
    await expect(
      execute(manager, randomUUID(), {
        action: "company.initialize",
        payload: {},
      }),
    ).rejects.toThrow("Недостаточно прав");
  });
  it("rotates an invitation link; the previous capability is invalidated", async () => {
    const key = randomUUID(),
      key2 = randomUUID();
    let id: string | undefined;
    try {
      const created = await execute(admin, key, {
        action: "invitation.create",
        payload: {
          organizationId: org,
          email: `onboarding-${randomUUID()}@packapprove.local`,
          role: "observer",
        },
      });
      id = created.id as string;
      const old = String(created.invitationUrl).split("token=")[1];
      const updated = await execute(admin, key2, {
        action: "invitation.resend",
        entityId: id,
        payload: {},
      });
      const current = String(updated.invitationUrl).split("token=")[1];
      expect(current).not.toBe(old);
      await expect(invitationInfo(old)).rejects.toThrow("недействительно");
      expect((await invitationInfo(current)).role).toBe("observer");
    } finally {
      if (id)
        await db.begin(async (tx) => {
          await tx`set local session_replication_role='replica'`;
          await tx`delete from audit_logs where entity_id=${id!}`;
          await tx`delete from invitations where id=${id!}`;
          await tx`delete from idempotency_keys where user_id=${admin.id} and key in (${key},${key2})`;
        });
    }
  });
});
