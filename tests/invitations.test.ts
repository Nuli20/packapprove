import { beforeAll, afterAll, describe, it, expect, vi } from "vitest";
import postgres from "postgres";
import { randomUUID, randomBytes } from "node:crypto";
import { db } from "../lib/db";
import { execute, type User } from "../lib/service";
import { invitationInfo, acceptInvitation } from "../lib/invitations";
import * as platform from "../lib/platform";
import { adminClient, authClient } from "../lib/platform";
import { sha256 } from "../lib/security";
let admin: User, organization: string, restricted: ReturnType<typeof postgres>;
const ids: string[] = [];
const users: string[] = [];
beforeAll(async () => {
  admin = (
    await db`select id,role from profiles where role='admin' and active limit 1`
  )[0] as User;
  organization = (
    await db`select id from organizations where kind='manufacturer'`
  )[0].id;
  const password = randomBytes(24).toString("hex");
  await db.unsafe(
    `do $$ begin if not exists(select 1 from pg_roles where rolname='packapprove_invitation_test') then create role packapprove_invitation_test login noinherit; end if; end $$`,
  );
  await db.unsafe(
    `alter role packapprove_invitation_test password '${password}'`,
  );
  await db`grant packapprove_app to packapprove_invitation_test`;
  const url = new URL(process.env.DATABASE_URL!);
  url.username = "packapprove_invitation_test";
  url.password = password;
  restricted = postgres(url.href, { max: 3, prepare: false });
});
afterAll(async () => {
  await restricted?.end();
  await db.begin(async (tx) => {
    await tx`set local session_replication_role='replica'`;
    for (const id of ids) {
      await tx`delete from audit_logs where entity_id=${id}`;
      await tx`delete from idempotency_keys where response->>'id'=${id}`;
      await tx`delete from invitations where id=${id}`;
    }
    for (const uid of users) {
      await tx`delete from audit_logs where actor_id=${uid}`;
      await tx`delete from organization_memberships where user_id=${uid}`;
      await tx`delete from profiles where id=${uid}`;
    }
  });
  for (const uid of users) await adminClient().auth.admin.deleteUser(uid);
});
async function invite(
  email = `invite-${randomUUID()}@packapprove.local`,
  role = "designer",
) {
  const r = await execute(admin, randomUUID(), {
    action: "invitation.create",
    payload: { organizationId: organization, email, role },
  });
  ids.push(String(r.id));
  return {
    id: String(r.id),
    token: String(r.invitationUrl).split("token=")[1],
    email,
  };
}
describe("Invitation capabilities under restricted server login", () => {
  it("reproduces the old direct-query failure and exposes only token-bound metadata", async () => {
    const i = await invite();
    await expect(
      restricted`select email from invitations where token_hash=${sha256(i.token)}`,
    ).rejects.toMatchObject({ code: "42501" });
    const info = await invitationInfo(i.token, restricted);
    expect(Object.keys(info).sort()).toEqual(["email", "organization", "role"]);
    expect(info.email).toBe(i.email);
    for (const role of ["anon", "authenticated"]) {
      await expect(
        db.begin(async (tx) => {
          await tx.unsafe(`set local role ${role}`);
          await tx`select * from public.invitation_lookup(${sha256(i.token)},false)`;
        }),
      ).rejects.toMatchObject({ code: "42501" });
    }
    const functions =
      await db`select proconfig,prosecdef from pg_proc where pronamespace='public'::regnamespace and proname in ('invitation_lookup','invitation_finish','invitation_registration_state')`;
    expect(functions).toHaveLength(3);
    for (const f of functions) {
      expect(f.prosecdef).toBe(true);
      expect(f.proconfig).toContain("search_path=pg_catalog");
    }
  });
  it("creates one confirmed identity/profile/membership with the exact invited role, then rejects replay", async () => {
    const i = await invite();
    const session = await acceptInvitation(
      i.token,
      "InvitationSecure2026!",
      "Тест дизайнер",
      restricted,
    );
    users.push(session.user.id);
    expect(
      (await db`select role from profiles where id=${session.user.id}`)[0].role,
    ).toBe("designer");
    expect(
      (
        await db`select user_id from organization_memberships where organization_id=${organization} and user_id=${session.user.id}`
      ).length,
    ).toBe(1);
    expect(
      (await db`select accepted_user_id from invitations where id=${i.id}`)[0]
        .accepted_user_id,
    ).toBe(session.user.id);
    await expect(
      acceptInvitation(
        i.token,
        "AnotherPassword2026!",
        "Другой пользователь",
        restricted,
      ),
    ).rejects.toMatchObject({ status: 409 });
    await expect(invitationInfo(i.token, restricted)).rejects.toMatchObject({
      status: 409,
    });
    const signIn = await authClient().auth.signInWithPassword({
      email: i.email,
      password: "InvitationSecure2026!",
    });
    expect(signIn.error).toBeNull();
  });
  it("serializes concurrent accept clicks into exactly one registration", async () => {
    const i = await invite(undefined, "prepress");
    const result = await Promise.allSettled([
      acceptInvitation(
        i.token,
        "InvitationSecure2026!",
        "Тест допечатник",
        restricted,
      ),
      acceptInvitation(
        i.token,
        "InvitationSecure2026!",
        "Тест допечатник",
        restricted,
      ),
    ]);
    const good = result.filter((r) => r.status === "fulfilled");
    expect(good).toHaveLength(1);
    if (good[0].status === "fulfilled") users.push(good[0].value.user.id);
    expect(result.filter((r) => r.status === "rejected")).toHaveLength(1);
  });
  it("rejects expired, revoked and invalid tokens before creating an Auth identity", async () => {
    const i = await invite();
    await db`update invitations set expires_at=now()-interval '1 second' where id=${i.id}`;
    await expect(invitationInfo(i.token, restricted)).rejects.toMatchObject({
      status: 410,
    });
    await expect(
      acceptInvitation(
        i.token,
        "InvitationSecure2026!",
        "Тест имя",
        restricted,
      ),
    ).rejects.toMatchObject({ status: 410 });
    await expect(
      invitationInfo(randomBytes(32).toString("hex"), restricted),
    ).rejects.toMatchObject({ status: 404 });
    await expect(invitationInfo("bad", restricted)).rejects.toMatchObject({
      status: 400,
    });
  });
  it("does not reset an existing account password, role, membership or invitation", async () => {
    const existing = await adminClient().auth.admin.listUsers({
      perPage: 1000,
    });
    const account = existing.data.users.find(
      (u) => u.email === "manager@packapprove.local",
    )!;
    const before = (
      await db`select role from profiles where id=${account.id}`
    )[0].role;
    const i = await invite(account.email!);
    await expect(
      acceptInvitation(
        i.token,
        "DifferentPassword2026!",
        "Подмена",
        restricted,
      ),
    ).rejects.toMatchObject({ status: 409 });
    expect(
      (await db`select role from profiles where id=${account.id}`)[0].role,
    ).toBe(before);
    expect((await invitationInfo(i.token, restricted)).email).toBe(
      account.email,
    );
    expect(
      (
        await authClient().auth.signInWithPassword({
          email: account.email!,
          password: "PackApprove2026!",
        })
      ).error,
    ).toBeNull();
  });
  it("rejects a mismatched Auth UUID and does not grant the invited role", async () => {
    const i = await invite();
    await expect(
      restricted.begin(async (tx) => {
        await tx`set local role packapprove_app`;
        await tx`select public.invitation_finish(${sha256(i.token)},${admin.id}::uuid,'Имя')`;
      }),
    ).rejects.toMatchObject({ code: "PA006" });
    expect((await invitationInfo(i.token, restricted)).role).toBe("designer");
  });
  it("compensates a failed profile write and leaves the invitation reusable", async () => {
    const i = await invite();
    await db.unsafe(
      `create function public.test_invitation_failure() returns trigger language plpgsql as $$ begin if new.full_name='FAIL INVITE FIXTURE' then raise exception 'Simulated profile write failure'; end if; return new; end $$`,
    );
    await db.unsafe(
      `create trigger test_invitation_failure before insert on public.profiles for each row execute function public.test_invitation_failure()`,
    );
    try {
      await expect(
        acceptInvitation(
          i.token,
          "InvitationSecure2026!",
          "FAIL INVITE FIXTURE",
          restricted,
        ),
      ).rejects.toMatchObject({ status: 503 });
      expect((await invitationInfo(i.token, restricted)).email).toBe(i.email);
      const all = await adminClient().auth.admin.listUsers({ perPage: 1000 });
      expect(all.data.users.some((u) => u.email === i.email)).toBe(false);
    } finally {
      await db.unsafe(
        "drop trigger test_invitation_failure on public.profiles",
      );
      await db.unsafe("drop function public.test_invitation_failure()");
    }
    const session = await acceptInvitation(
      i.token,
      "InvitationSecure2026!",
      "Повтор регистрации",
      restricted,
    );
    users.push(session.user.id);
  });
  it("handles Auth create failure without consuming the token", async () => {
    const i = await invite();
    const spy = vi
      .spyOn(platform, "adminClient")
      .mockReturnValueOnce({
        auth: {
          admin: {
            createUser: async () => ({
              data: { user: null },
              error: { code: "unexpected_failure" },
            }),
          },
        },
      } as any);
    try {
      await expect(
        acceptInvitation(
          i.token,
          "InvitationSecure2026!",
          "Тест имя",
          restricted,
        ),
      ).rejects.toMatchObject({ status: 503 });
    } finally {
      spy.mockRestore();
    }
    expect((await invitationInfo(i.token, restricted)).email).toBe(i.email);
  });
  it("preserves a committed account if automatic sign-in fails", async () => {
    const i = await invite();
    const spy = vi
      .spyOn(platform, "authClient")
      .mockReturnValueOnce({
        auth: {
          signInWithPassword: async () => ({
            data: { session: null },
            error: { code: "unexpected_failure" },
          }),
        },
      } as any);
    try {
      await expect(
        acceptInvitation(
          i.token,
          "InvitationSecure2026!",
          "Готовый аккаунт",
          restricted,
        ),
      ).rejects.toMatchObject({ status: 401 });
    } finally {
      spy.mockRestore();
    }
    const row = (
      await db`select accepted_user_id from invitations where id=${i.id}`
    )[0];
    expect(row.accepted_user_id).toBeTruthy();
    users.push(row.accepted_user_id);
    expect(
      (
        await authClient().auth.signInWithPassword({
          email: i.email,
          password: "InvitationSecure2026!",
        })
      ).error,
    ).toBeNull();
    await expect(invitationInfo(i.token, restricted)).rejects.toMatchObject({
      status: 409,
    });
  });
});
