import { readFileSync } from "node:fs";
for (const line of readFileSync(".env.local", "utf8").split("\n")) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) process.env[m[1]] = m[2];
}
import { beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { db, asUser } from "../lib/db";
import { execute, type User } from "../lib/service";
import { snapshot, download } from "../lib/queries";
import { detectMime, sha256 } from "../lib/security";
import { demoPdf } from "../scripts/demo-pdf";
let users: Record<string, User>;
let org: string;
let template: any;
const command = (
  u: User,
  action: any,
  entityId?: string,
  payload: any = {},
  rowVersion?: number,
  key = randomUUID(),
) => execute(u, key, { action, entityId, payload, rowVersion });
beforeAll(async () => {
  const pp = await db`select * from profiles`;
  users = Object.fromEntries(
    pp.map((p) => [p.full_name, { id: p.id, role: p.role }]),
  );
  users.manager = users["Дана Ибраева"];
  users.designer = users["Арман Касымов"];
  users.prepress = users["Тимур Ахметов"];
  users.approver = users["Айгерим Нурлан"];
  users.approver2 = users["Марат Оспанов"];
  users.observer = users["Алина Серик"];
  users.production = users["Ерлан Байжанов"];
  users.clientb = users["Анна Ким"];
  org = (
    await db`select id from organizations where name='ТОО «Tea House Kazakhstan»'`
  )[0].id;
  template = (await db`select * from checklist_template_versions limit 1`)[0];
});
async function newVersion(aid: string) {
  const [a] = await db`select * from artworks where id=${aid}`;
  const base64 = demoPdf("TEST TEA", 2).toString("base64");
  return command(
    users.designer,
    "version.create",
    aid,
    {
      changes: "Тестовая версия",
      files: ["preview", "production"].map((kind) => ({
        kind,
        filename: `test-${kind}.pdf`,
        base64,
      })),
    },
    a.row_version,
  );
}
async function fixture(options: { technical?: boolean; two?: boolean } = {}) {
  const project = await command(users.manager, "project.create", undefined, {
    name: "TEST " + randomUUID().slice(0, 8),
    organizationId: org,
    designerId: users.designer.id,
    prepressId: users.prepress.id,
    deadline: "2026-12-20",
    artworks: ["Test artwork"],
  });
  const [a] = await db`select * from artworks where project_id=${project.id}`;
  const v = await newVersion(a.id);
  await command(users.designer, "version.submit", v.id as string);
  if (options.technical !== false)
    await command(users.prepress, "review.complete", v.id as string, {
      templateId: template.id,
      status: "ready",
      items: template.items.map((label: string) => ({ label, passed: true })),
    });
  const r = await command(users.manager, "round.open", v.id as string, {
    approvers: options.two
      ? [users.approver.id, users.approver2.id]
      : [users.approver.id],
    deadline: "2026-12-20T12:00:00Z",
  });
  return { a: a.id, v: v.id as string, r: r.id as string, project: project.id };
}
async function approved() {
  const f = await fixture();
  await command(users.approver, "decision.create", f.r, { result: "approved" });
  return f;
}
describe("PackApprove real PostgreSQL + RLS + Storage invariants", () => {
  it("1. Client A cannot read Client B project or files", async () => {
    const foreign = (
      await db`select p.id from projects p join organizations o on o.id=p.organization_id where o.name='ТОО «Almaty Foods»' limit 1`
    )[0];
    const s = await snapshot(users.approver);
    expect(s.projects.some((p) => p.id === foreign.id)).toBe(false);
    const [f] =
      await db`select f.id from version_files f join artwork_versions v on v.id=f.version_id join artworks a on a.id=v.artwork_id where a.project_id=${foreign.id} limit 1`;
    await expect(download(users.approver, f.id, false)).rejects.toThrow(
      "Файл недоступен",
    );
  });
  it("2. Internal threads and replies are absent from client API data", async () => {
    const s = await snapshot(users.approver);
    expect(s.threads.every((t) => t.visibility === "client")).toBe(true);
    const internal =
      await db`select c.id from comments c join comment_threads t on t.id=c.thread_id where t.visibility='internal'`;
    expect(internal.length).toBeGreaterThan(0);
    expect(s.comments.some((c) => internal.some((x) => x.id === c.id))).toBe(
      false,
    );
  });
  it("3. Fixed and approved version files cannot be replaced, even by manager", async () => {
    const f = await approved();
    const [file] =
      await db`select * from version_files where version_id=${f.v} limit 1`;
    await expect(
      asUser(users.manager.id, async (tx) => {
        await tx`update version_files set sha256=${"0".repeat(64)} where id=${file.id}`;
      }),
    ).rejects.toThrow("Immutable record");
    await expect(
      asUser(users.manager.id, async (tx) => {
        await tx`update artwork_versions set changes='replaced' where id=${f.v}`;
      }),
    ).rejects.toThrow("Immutable version content");
  });
  it("4. Decision on superseded round is rejected by server", async () => {
    const f = await fixture();
    await newVersion(f.a);
    await expect(
      command(users.approver, "decision.create", f.r, { result: "approved" }),
    ).rejects.toThrow("устарел");
  });
  it("5. All policy requires both participants", async () => {
    const f = await fixture({ two: true });
    await command(users.approver, "decision.create", f.r, {
      result: "approved",
    });
    expect(
      (await db`select status from approval_rounds where id=${f.r}`)[0].status,
    ).toBe("open");
    await command(users.approver2, "decision.create", f.r, {
      result: "approved",
    });
    expect(
      (await db`select status from approval_rounds where id=${f.r}`)[0].status,
    ).toBe("approved");
  });
  it("6. Change request closes round and prevents contradictory decision", async () => {
    const f = await fixture({ two: true });
    await command(users.approver, "decision.create", f.r, {
      result: "changes_requested",
      comment: "Исправить текст",
    });
    expect(
      (await db`select status from approval_rounds where id=${f.r}`)[0].status,
    ).toBe("changes_requested");
    await expect(
      command(users.approver2, "decision.create", f.r, { result: "approved" }),
    ).rejects.toThrow("устарел");
  });
  it("7. Version with change request cannot enter production", async () => {
    const f = await fixture();
    await command(users.approver, "decision.create", f.r, {
      result: "changes_requested",
      comment: "Исправить",
    });
    await expect(command(users.manager, "package.issue", f.v)).rejects.toThrow(
      "утверждённая",
    );
  });
  it("8. Production download matches frozen SHA-256; receipt records verified hash", async () => {
    const f = await approved();
    const pkg = await command(users.manager, "package.issue", f.v);
    const bytes = await download(users.production, pkg.id as string, true);
    const [p] = await db`select * from production_packages where id=${pkg.id}`;
    expect(sha256(bytes.bytes)).toBe(p.sha256);
    await command(
      users.production,
      "package.ack",
      p.id,
      { sha256: p.sha256 },
      p.row_version,
    );
    expect(
      (await db`select status from production_packages where id=${p.id}`)[0]
        .status,
    ).toBe("received");
  });
  it("9. Revoked package cannot be downloaded and history survives", async () => {
    const f = await approved();
    const pkg = await command(users.manager, "package.issue", f.v);
    const [p] = await db`select * from production_packages where id=${pkg.id}`;
    await download(users.production, p.id, true);
    await command(
      users.manager,
      "package.revoke",
      p.id,
      { reason: "Остановка тиража" },
      p.row_version,
    );
    await expect(download(users.production, p.id, true)).rejects.toThrow(
      "отозван",
    );
    expect(
      (await db`select id from download_events where package_id=${p.id}`)
        .length,
    ).toBe(1);
  });
  it("10. Concurrent duplicate decisions and transfers are idempotent", async () => {
    const f = await fixture();
    const key = randomUUID();
    const decisions = await Promise.all([
      command(
        users.approver,
        "decision.create",
        f.r,
        { result: "approved" },
        undefined,
        key,
      ),
      command(
        users.approver,
        "decision.create",
        f.r,
        { result: "approved" },
        undefined,
        key,
      ),
    ]);
    expect(decisions[0]).toEqual(decisions[1]);
    expect(
      (await db`select id from approval_decisions where round_id=${f.r}`)
        .length,
    ).toBe(1);
    const k = randomUUID();
    const packs = await Promise.all([
      command(users.manager, "package.issue", f.v, {}, undefined, k),
      command(users.manager, "package.issue", f.v, {}, undefined, k),
    ]);
    expect(packs[0].id).toBe(packs[1].id);
    expect(
      (await db`select id from production_packages where version_id=${f.v}`)
        .length,
    ).toBe(1);
    await expect(
      command(
        users.manager,
        "package.issue",
        f.v,
        { changed: true },
        undefined,
        k,
      ),
    ).rejects.toThrow("Ключ");
  });
  it("11. Observer cannot approve", async () => {
    const f = await fixture();
    await expect(
      command(users.observer, "decision.create", f.r, { result: "approved" }),
    ).rejects.toThrow("Недостаточно прав");
  });
  it("12. Designer cannot decide for client", async () => {
    const f = await fixture();
    await expect(
      command(users.designer, "decision.create", f.r, { result: "approved" }),
    ).rejects.toThrow("Недостаточно прав");
  });
  it("13. Client approval alone cannot authorize production", async () => {
    const f = await fixture({ technical: false });
    await command(users.approver, "decision.create", f.r, {
      result: "approved",
    });
    await expect(command(users.manager, "package.issue", f.v)).rejects.toThrow(
      "технической проверки",
    );
  });
  it("14. Immutable decisions cannot be edited by an administrator", async () => {
    const f = await approved();
    const admin = users["Алия Сарсенова"];
    await expect(
      asUser(admin.id, async (tx) => {
        await tx`update approval_decisions set result='changes_requested' where round_id=${f.r}`;
      }),
    ).rejects.toThrow("Immutable record");
  });
  it("15. MIME and size validation reject active content and empty uploads", () => {
    expect(() => detectMime(Buffer.from("<script>alert(1)</script>"))).toThrow(
      "PDF",
    );
    expect(() => detectMime(Buffer.alloc(0))).toThrow("размер");
    expect(detectMime(demoPdf())).toBe("application/pdf");
  });
});

describe("Follow-up workflow operations", () => {
  it("16. Carries an open comment to a new version, preserving the source thread", async () => {
    const f = await fixture();
    const thread = await command(users.approver, "comment.create", f.v, {
      x: 0.3,
      y: 0.4,
      page: 1,
      visibility: "client",
      type: "design",
      body: "Уточнить логотип",
    });
    const next = await newVersion(f.a);
    await command(users.designer, "comment.carry", thread.id as string, {
      targetVersionId: next.id,
    });
    const [copy] =
      await db`select * from comment_threads where carried_from_id=${thread.id}`;
    expect(copy.version_id).toBe(next.id);
    expect(
      (await db`select body from comments where thread_id=${copy.id}`)[0].body,
    ).toBe("Уточнить логотип");
    expect(
      (await db`select id from comment_threads where id=${thread.id}`).length,
    ).toBe(1);
  });
  it("17. Editing a project checks optimistic locking and preserves organization", async () => {
    const f = await fixture();
    const [p] = await db`select * from projects where id=${f.project}`;
    const payload = {
      name: p.name,
      description: "Updated",
      contacts: "Контакт",
      customerOrder: "Q-123",
      deadline: "2026-12-22",
      priority: "high",
      status: "paused",
      designerId: users.designer.id,
      prepressId: users.prepress.id,
    };
    await command(
      users.manager,
      "project.update",
      p.id,
      payload,
      p.row_version,
    );
    await expect(
      command(users.manager, "project.update", p.id, payload, p.row_version),
    ).rejects.toThrow("изменился");
    expect(
      (
        await db`select organization_id,status from projects where id=${p.id}`
      )[0],
    ).toMatchObject({ organization_id: org, status: "paused" });
  });
  it("18. An observer cannot read a production file or download a package", async () => {
    const f = await approved();
    const pkg = await command(users.manager, "package.issue", f.v);
    const [file] =
      await db`select id from version_files where version_id=${f.v} and kind='production'`;
    await expect(download(users.observer, file.id, false)).rejects.toThrow(
      "недоступен",
    );
    await expect(
      download(users.observer, pkg.id as string, true),
    ).rejects.toThrow("Недостаточно прав");
  });
});

describe("Invitations and role boundaries", () => {
  it("19. Manager cannot issue an employee/admin invitation", async () => {
    const [manufacturer] =
      await db`select id from organizations where kind='manufacturer'`;
    await expect(
      command(users.manager, "invitation.create", undefined, {
        email: "blocked@packapprove.local",
        organizationId: manufacturer.id,
        role: "admin",
      }),
    ).rejects.toThrow("Недостаточно прав");
  });
  it("20. One-time invitation creates a real Auth account with the exact client role", async () => {
    const { invitationInfo, acceptInvitation } = await import(
      "../lib/invitations"
    );
    const { adminClient } = await import("../lib/platform");
    const key = randomUUID();
    const email = `integration-${randomUUID()}@packapprove.local`;
    let uid: string | undefined;
    let invitationId: string | undefined;
    try {
      const r = await command(
        users.manager,
        "invitation.create",
        undefined,
        { email, organizationId: org, role: "observer" },
        undefined,
        key,
      );
      invitationId = r.id as string;
      const token = String(r.invitationUrl).split("token=")[1];
      expect((await invitationInfo(token)).role).toBe("observer");
      const session = await acceptInvitation(
        token,
        "IntegrationTest2026!",
        "Тестовый наблюдатель",
      );
      uid = session.user.id;
      expect(Boolean(session.access_token)).toBe(true);
      const [profile] = await db`select role from profiles where id=${uid}`;
      expect(profile.role).toBe("observer");
      expect(
        (
          await db`select organization_id from organization_memberships where user_id=${uid}`
        )[0].organization_id,
      ).toBe(org);
      await expect(
        acceptInvitation(token, "IntegrationTest2026!", "Повтор"),
      ).rejects.toThrow("уже принято");
    } finally {
      await db.begin(async (tx) => {
        await tx`set local session_replication_role='replica'`;
        if (uid) {
          await tx`delete from audit_logs where actor_id=${uid}`;
          await tx`delete from organization_memberships where user_id=${uid}`;
          await tx`delete from profiles where id=${uid}`;
        }
        if (invitationId) {
          await tx`delete from audit_logs where entity_id=${invitationId}`;
          await tx`delete from invitations where id=${invitationId}`;
        }
        await tx`delete from idempotency_keys where user_id=${users.manager.id} and key=${key}`;
      });
      if (uid) await adminClient().auth.admin.deleteUser(uid);
    }
  });
});
