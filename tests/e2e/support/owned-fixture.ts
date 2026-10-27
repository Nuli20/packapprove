import {
  expect,
  type APIRequestContext,
  type PlaywrightWorkerArgs,
  type TestInfo,
  type Page,
} from "@playwright/test";
import { randomUUID } from "node:crypto";
import postgres from "postgres";
import { createClient } from "@supabase/supabase-js";
import { localTestEnvironment, localTestOrigin } from "../../local-environment";
import { demoPdf } from "../../../scripts/demo-pdf";

/** Node-only fixture owner; never imported by the application or sent to a browser. */
export class OwnedFixture {
  readonly nonce = randomUUID();
  readonly contexts: APIRequestContext[] = [];
  // A test is an independent client behind the trusted local test proxy, not another
  // sign-in from the entire suite's shared "local" IP. Production limits stay intact.
  readonly clientHeaders = {
    "X-Forwarded-For":
      "2001:db8:" +
      this.nonce.replaceAll("-", "").slice(0, 24).match(/.{4}/g)!.join(":"),
  };
  async browser(page: Page) {
    await page.context().setExtraHTTPHeaders(this.clientHeaders);
    const started = new WeakMap<object, number>();
    page.on("request", (request) => {
      started.set(request, performance.now());
      if (new URL(request.url()).pathname === "/api/command") {
        const key = request.headers()["idempotency-key"];
        if (key) this.commandKeys.add(key);
      }
    });
    page.on("response", (response) => {
      const request = response.request(),
        url = new URL(request.url());
      let phase: string | undefined;
      try {
        if (url.pathname === "/api/command")
          phase = request.postDataJSON()?.action;
        if (url.pathname === "/api/state")
          phase = "state." + url.searchParams.get("view");
        if (url.pathname === "/api/auth/login") phase = "auth.login";
      } catch {
        return;
      }
      if (phase)
        this.timings.push({
          phase,
          status: response.status(),
          ms: Math.round(
            performance.now() - (started.get(request) ?? performance.now()),
          ),
        });
    });
  }
  private organizations = new Map<string, string>();
  private emails = new Set<string>();
  private commandKeys = new Set<string>();
  private started = performance.now();
  readonly timings: { phase: string; status: number; ms: number }[] = [];
  constructor(
    private playwright: PlaywrightWorkerArgs["playwright"],
    private info: TestInfo,
  ) {
    localTestEnvironment();
  }
  async context() {
    const c = await this.playwright.request.newContext({
      baseURL: localTestOrigin(),
      extraHTTPHeaders: this.clientHeaders,
      timeout: 15000,
    });
    this.contexts.push(c);
    return c;
  }
  async login(role: string) {
    const c = await this.context();
    const r = await this.measure("auth.login", () =>
      c.post("/api/auth/login", {
        data: {
          email: role + "@packapprove.local",
          password: "PackApprove2026!",
        },
      }),
    );
    expect(r.status(), "fixture auth.login").toBe(200);
    return c;
  }
  async measure(phase: string, operation: () => Promise<any>) {
    const t = performance.now();
    try {
      const r = await operation();
      this.timings.push({
        phase,
        status: r.status(),
        ms: Math.round(performance.now() - t),
      });
      return r;
    } catch (e) {
      this.timings.push({
        phase,
        status: 0,
        ms: Math.round(performance.now() - t),
      });
      throw e;
    }
  }
  async command(
    c: APIRequestContext,
    action: string,
    entityId?: string,
    payload: Record<string, any> = {},
    rowVersion?: number,
    key = randomUUID(),
  ) {
    this.commandKeys.add(key);
    if (action === "invitation.create") {
      const email = String(payload.email);
      if (!email.endsWith("@packapprove.local") || !email.includes(this.nonce))
        throw Error(
          "Invited fixture accounts must contain their unique owner nonce",
        );
      this.emails.add(email);
    }
    const r = await this.measure(action, () =>
      c.post("/api/command", {
        headers: { "Idempotency-Key": key },
        data: { action, entityId, payload, rowVersion },
      }),
    );
    expect(r.status(), `fixture ${action}`).toBe(200);
    const value = await r.json();
    if (action === "organization.create")
      this.organizations.set(value.id, String(payload.name));
    return value;
  }
  async state(c: APIRequestContext, query: Record<string, string>) {
    const r = await this.measure("state." + query.view, () =>
      c.get("/api/state?" + new URLSearchParams(query)),
    );
    expect(r.status(), "fixture scoped state").toBe(200);
    return r.json();
  }
  async organization(admin: APIRequestContext) {
    return this.command(admin, "organization.create", undefined, {
      name: "CI " + this.nonce,
    });
  }
  async invite(admin: APIRequestContext, organizationId: string, role: string) {
    const email = `ci-${role}-${this.nonce}@packapprove.local`,
      password = "IsolatedBrowser2026!",
      name = `CI ${role} ${this.nonce}`;
    const invite = await this.command(admin, "invitation.create", undefined, {
      email,
      organizationId,
      role,
    });
    const token = new URL(invite.invitationUrl, localTestOrigin()).hash.slice(
      "#token=".length,
    );
    const api = await this.context();
    const r = await this.measure("invitation.accept", () =>
      api.post("/api/invitations/accept", {
        data: { token, password, fullName: name },
      }),
    );
    expect(r.status(), "fixture invitation.accept").toBe(200);
    const { user } = await this.state(api, { view: "home" });
    expect(user.role).toBe(role);
    return { api, id: user.id, email, password, name };
  }
  async project(
    admin: APIRequestContext,
    organizationId: string,
    team?: { designerId: string; prepressId: string },
  ) {
    if (!team) {
      const setup = await this.state(admin, { view: "setup" });
      team = {
        designerId: setup.profiles.find(
          (p: any) => p.full_name === "Арман Касымов",
        ).id,
        prepressId: setup.profiles.find(
          (p: any) => p.full_name === "Тимур Ахметов",
        ).id,
      };
    }
    const project = await this.command(admin, "project.create", undefined, {
      name: "CI project " + this.nonce,
      organizationId,
      ...team,
      deadline: "2026-12-20",
      artworks: ["CI artwork " + this.nonce],
    });
    const d = await this.state(admin, { view: "project", project: project.id });
    return {
      project: { ...project, name: "CI project " + this.nonce },
      artwork: d.artworks[0],
    };
  }
  async version(designer: APIRequestContext, artworkId: string, number = 1) {
    const d = await this.state(designer, {
        view: "artwork",
        artwork: artworkId,
      }),
      a = d.artworks.find((a: any) => a.id === artworkId),
      pdf = demoPdf("CI isolated can", number);
    const version = await this.command(
      designer,
      "version.create",
      a.id,
      {
        changes: "CI V" + number,
        files: ["preview", "production"].map((kind) => ({
          kind,
          filename: `ci-v${number}.pdf`,
          base64: pdf.toString("base64"),
        })),
      },
      a.row_version,
    );
    return { version, pdf };
  }
  async approval() {
    const admin = await this.login("admin"),
      org = await this.organization(admin),
      setup = await this.state(admin, { view: "setup" }),
      first = await this.invite(admin, org.id, "approver"),
      second = await this.invite(admin, org.id, "observer");
    // Second independent approver, with a distinct nonce/email; no shared seed memberships.
    const email = `ci-approver2-${this.nonce}@packapprove.local`;
    const invite = await this.command(admin, "invitation.create", undefined, {
      email,
      organizationId: org.id,
      role: "approver",
    });
    const token = new URL(invite.invitationUrl, localTestOrigin()).hash.slice(
        7,
      ),
      api2 = await this.context();
    const response = await api2.post("/api/invitations/accept", {
      data: {
        token,
        password: first.password,
        fullName: "CI second " + this.nonce,
      },
    });
    expect(response.status()).toBe(200);
    const user2 = (await this.state(api2, { view: "home" })).user;
    const { project, artwork } = await this.project(admin, org.id),
      designer = await this.login("designer"),
      prepress = await this.login("prepress"),
      { version, pdf } = await this.version(designer, artwork.id);
    await this.command(designer, "version.submit", version.id);
    const template = setup.templates[0];
    await this.command(prepress, "review.complete", version.id, {
      templateId: template.id,
      status: "ready",
      items: template.items.map((label: string) => ({ label, passed: true })),
    });
    const round = await this.command(admin, "round.open", version.id, {
      approvers: [first.id, user2.id],
      observers: [second.id],
      deadline: "2026-12-20T12:00:00Z",
    });
    return {
      admin,
      org,
      project,
      artwork,
      designer,
      prepress,
      version,
      pdf,
      round,
      first,
      secondApprover: { api: api2, id: user2.id },
      observer: second,
    };
  }
  async cleanup() {
    for (const c of this.contexts) await c.dispose();
    const env = localTestEnvironment(),
      sql = postgres(env.DATABASE_URL, { max: 1, prepare: false }),
      storage = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
        auth: { persistSession: false },
      });
    try {
      const orgs = [...this.organizations.keys()],
        emails = [...this.emails];
      // Exact UUID/name pairs recorded from this fixture's successful API responses only.
      for (const [id, name] of this.organizations) {
        const [o] =
          await sql`select name,kind from organizations where id=${id}`;
        if (o && (o.name !== name || o.kind !== "client"))
          throw Error("Fixture ownership mismatch; cleanup refused");
      }
      const projects = orgs.length
          ? await sql`select id from projects where organization_id in ${sql(orgs)}`
          : [],
        pids = projects.map((p) => p.id);
      const artifacts = pids.length
        ? await sql`select f.id,f.storage_path from version_files f join artwork_versions v on v.id=f.version_id join artworks a on a.id=v.artwork_id where a.project_id in ${sql(pids)}`
        : [];
      const staging = pids.length
        ? await sql`select t.id,t.storage_path from upload_tickets t join artworks a on a.id=t.artwork_id where a.project_id in ${sql(pids)}`
        : [];
      if (artifacts.length || staging.length) {
        const { error } = await storage.storage
          .from("artworks")
          .remove([...artifacts, ...staging].map((f) => f.storage_path));
        if (error) throw Error("Owned fixture storage cleanup failed");
      }
      await sql.begin(async (tx) => {
        // Immutable test records are removed only in this local owner transaction. Runtime/RLS/guards are unchanged.
        await tx`set local session_replication_role='replica'`;
        const selectIds = async (
          table: string,
          column: string,
          ids: string[],
        ) =>
          ids.length
            ? (
                await tx`select id from ${tx(table)} where ${tx(column)} in ${tx(ids)}`
              ).map((r) => r.id)
            : [];
        const del = async (table: string, column: string, ids: string[]) => {
          if (ids.length)
            await tx`delete from ${tx(table)} where ${tx(column)} in ${tx(ids)}`;
        };
        const aids = await selectIds("artworks", "project_id", pids),
          vids = await selectIds("artwork_versions", "artwork_id", aids),
          rids = await selectIds("approval_rounds", "artwork_id", aids),
          reviews = await selectIds("technical_reviews", "version_id", vids),
          threads = await selectIds("comment_threads", "version_id", vids),
          pkgs = await selectIds("production_packages", "project_id", pids),
          users = emails.length
            ? (
                await tx`select id from auth.users where email in ${tx(emails)}`
              ).map((r) => r.id)
            : [],
          invites = emails.length
            ? (
                await tx`select id from invitations where email in ${tx(emails)}`
              ).map((r) => r.id)
            : [];
        for (const table of [
          "package_acknowledgements",
          "package_revocations",
          "production_package_files",
          "download_events",
        ])
          await del(table, "package_id", pkgs);
        await del(
          "download_events",
          "file_id",
          artifacts.map((f) => f.id),
        );
        await del("production_packages", "id", pkgs);
        await del("production_orders", "project_id", pids);
        for (const table of ["approval_decisions", "approval_participants"])
          await del(table, "round_id", rids);
        await del("approval_rounds", "id", rids);
        await del("technical_review_items", "review_id", reviews);
        await del("technical_reviews", "id", reviews);
        for (const table of ["comments", "comment_resolution_links"])
          await del(table, "thread_id", threads);
        await del("comment_threads", "id", threads);
        await del(
          "file_previews",
          "file_id",
          artifacts.map((f) => f.id),
        );
        await del(
          "version_files",
          "id",
          artifacts.map((f) => f.id),
        );
        await del("version_visualizations", "version_id", vids);
        await del("upload_tickets", "artwork_id", aids);
        await del("artwork_versions", "id", vids);
        await del("brief_versions", "artwork_id", aids);
        await del("artworks", "id", aids);
        for (const table of ["project_members", "notifications", "audit_logs"])
          await del(table, "project_id", pids);
        await del("projects", "id", pids);
        await del("invitations", "id", invites);
        const entities = [
          ...orgs,
          ...pids,
          ...aids,
          ...vids,
          ...rids,
          ...reviews,
          ...threads,
          ...pkgs,
          ...invites,
          ...users,
        ];
        await del("audit_logs", "entity_id", entities);
        if (entities.length)
          await tx`delete from idempotency_keys where response->>'id' in ${tx(entities)}`;
        await del("idempotency_keys", "key", [...this.commandKeys]);
        await del("idempotency_keys", "user_id", users);
        await del("notifications", "user_id", users);
        await del("rate_limits", "user_id", users);
        await del("organization_memberships", "user_id", users);
        await del("profiles", "id", users);
        await del("organization_memberships", "organization_id", orgs);
        await del("organizations", "id", orgs);
      });
      for (const email of emails) {
        const [user] =
          await sql`select id from auth.users where email=${email}`;
        if (user) {
          const { error } = await storage.auth.admin.deleteUser(user.id);
          if (error) throw Error("Owned fixture Auth cleanup failed");
        }
      }
      if (orgs.length)
        expect(
          Number(
            (
              await sql`select count(*)::int as n from organizations where id in ${sql(orgs)}`
            )[0].n,
          ),
        ).toBe(0);
    } finally {
      await sql.end();
      await this.info.attach("safe-api-timings", {
        body: JSON.stringify({
          durationMs: Math.round(performance.now() - this.started),
          requests: this.timings,
        }),
        contentType: "application/json",
      });
    }
  }
}
