import { describe, it, expect, beforeAll } from "vitest";
import { db } from "../lib/db";
import { workspaceSnapshot, workspaceQuery } from "../lib/queries/workspace";
import type { User } from "../lib/service";
let manager: User, client: User, foreign: string;
beforeAll(async () => {
  manager = (
    await db`select id,role,full_name from profiles where role='manager' and active order by created_at limit 1`
  )[0] as User;
  client = (
    await db`select p.id,p.role,p.full_name from profiles p join auth.users u on u.id=p.id where u.email='clientb@packapprove.local'`
  )[0] as User;
  foreign = (
    await db`select p.id from projects p where not exists(select 1 from organization_memberships m where m.organization_id=p.organization_id and m.user_id=${client.id}) limit 1`
  )[0].id;
});
describe("Scoped workspace projections retain RLS and avoid unrelated history", () => {
  it("dashboard omits discussions, invitations, audit and historical files", async () => {
    const d = await workspaceSnapshot(manager, { view: "home" });
    expect(d.comments).toEqual([]);
    expect(d.audit).toEqual([]);
    expect(d.invitations).toEqual([]);
    expect(d.projects.length).toBeLessThanOrEqual(6);
    expect(d.metrics!.projects).toBeGreaterThanOrEqual(d.projects.length);
    expect(JSON.stringify(d)).not.toContain("storage_path");
  });
  it("catalog pages have stable ordering, accurate totals and disjoint IDs", async () => {
    const a = await workspaceSnapshot(manager, {
        view: "projects",
        pageSize: 3,
      }),
      b = await workspaceSnapshot(manager, {
        view: "projects",
        pageSize: 3,
        page: 2,
      });
    expect(a.projects).toHaveLength(3);
    expect(b.projects).toHaveLength(3);
    expect(a.pagination!.total).toBe(b.pagination!.total);
    expect(a.projects.some((p) => b.projects.some((v) => v.id === p.id))).toBe(
      false,
    );
    expect(a.comments).toEqual([]);
    expect(a.artworks.length).toBeLessThanOrEqual(9);
  });
  it("search applies on the server before pagination", async () => {
    const d = await workspaceSnapshot(manager, {
      view: "projects",
      q: "DEMO / ZHYRA",
      pageSize: 1,
    });
    expect(d.projects).toHaveLength(1);
    expect(d.projects[0].name).toContain("DEMO / ZHYRA");
    expect(d.pagination!.total).toBeGreaterThan(0);
  });
  it("a foreign project remains inaccessible even when requested by UUID", async () => {
    await expect(
      workspaceSnapshot(client, { view: "project", project: foreign }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("clients cannot request staff directory or audit", async () => {
    for (const view of ["setup", "settings", "audit"])
      await expect(workspaceSnapshot(client, { view })).rejects.toMatchObject({
        status: 403,
      });
  });
  it("a specific artwork rejects a foreign-version query; internal comments are never returned", async () => {
    const all = await workspaceSnapshot(client, { view: "allArtworks" });
    if (!all.artworks[0]) throw Error("Client fixture missing");
    const d = await workspaceSnapshot(client, {
      view: "artwork",
      artwork: all.artworks[0].id,
    });
    expect(d.threads.every((t) => t.visibility === "client")).toBe(true);
    const [v] =
      await db`select v.id from artwork_versions v join artworks a on a.id=v.artwork_id where a.project_id=${foreign} limit 1`;
    await expect(
      workspaceSnapshot(client, {
        view: "artwork",
        artwork: all.artworks[0].id,
        version: v.id,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
  it("the newest saved discussion is visible on the first page, including after reload", async () => {
    const [latest] =
      await db`select t.id,t.version_id,v.artwork_id from comment_threads t join artwork_versions v on v.id=t.version_id order by t.created_at desc,t.id desc limit 1`;
    expect(latest).toBeTruthy();
    const first = await workspaceSnapshot(manager, {
      view: "artwork",
      artwork: latest.artwork_id,
      version: latest.version_id,
      pageSize: 1,
    });
    expect(first.threads[0].id).toBe(latest.id);
    expect(first.pagination!.total).toBeGreaterThanOrEqual(1);
  });
  it("query validation bounds page sizes and disallows SQL sort expressions", () => {
    expect(
      workspaceQuery.safeParse({ view: "projects", pageSize: 100000 }).success,
    ).toBe(false);
    expect(
      workspaceQuery.safeParse({
        view: "projects",
        sort: "name; drop table projects",
      }).success,
    ).toBe(false);
  });
});
