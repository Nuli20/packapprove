import { localTestOrigin } from "../local-environment";
import { test, expect, APIRequestContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { localTestEnvironment } from "../local-environment";
import { createClient } from "@supabase/supabase-js";
import { demoPdf } from "../../scripts/demo-pdf";
import { OwnedFixture } from "./support/owned-fixture";
const local = localTestEnvironment();
test("invited staff complete V1 changes / V2 approval / exact production file and recovery", async ({
  playwright,
}, info) => {
  const fixture = new OwnedFixture(playwright, info);
  const contexts = fixture.contexts;
  // This is an integration journey with sequential real Auth/Storage/DB operations,
  // including bcrypt invitation acceptance and recovery; see docs/CI-STABILITY.md.
  // Other tests retain the 60s default; each HTTP request still has a 15s deadline.
  test.setTimeout(120000);
  const suffix = fixture.nonce;
  const password = "IsolatedCycle2026!";
  const ctx = () => fixture.context();
  const act = async (
    c: APIRequestContext,
    action: string,
    entityId?: string,
    payload: object = {},
    rowVersion?: number,
  ) => {
    return fixture.command(c, action, entityId, payload, rowVersion);
  };
  const state = (c: APIRequestContext, query: Record<string, string>) =>
    fixture.state(c, query);
  try {
    const admin = await ctx();
    expect(
      (
        await fixture.measure("auth.login", () =>
          admin.post("/api/auth/login", {
            data: {
              email: "admin@packapprove.local",
              password: "PackApprove2026!",
            },
          }),
        )
      ).status(),
    ).toBe(200);
    const client = await act(admin, "organization.create", undefined, {
      name: "TEST Client " + suffix,
    });
    const initial = await state(admin, { view: "setup" });
    const template = initial.templates[0];
    const manufacturer = initial.organizations.find(
      (o: any) => o.kind === "manufacturer",
    );
    const people: Record<
      string,
      { api: APIRequestContext; id: string; email: string }
    > = {};
    for (const role of ["designer", "prepress", "approver"]) {
      const email = `cycle-${role}-${suffix}@packapprove.local`;
      const invite = await act(admin, "invitation.create", undefined, {
        email,
        organizationId: role === "approver" ? client.id : manufacturer.id,
        role,
      });
      const token = new URL("http://local" + invite.invitationUrl).hash.slice(
        "#token=".length,
      );
      const api = await ctx();
      expect(
        (
          await fixture.measure("invitation.accept", () =>
            api.post("/api/invitations/accept", {
              data: {
                token,
                password,
                fullName: "Cycle " + role + " " + suffix,
              },
            }),
          )
        ).status(),
      ).toBe(200);
      const user = (await state(api, { view: "home" })).user;
      expect(user.role).toBe(role);
      people[role] = { api, id: user.id, email };
    }
    // Reproduce an expired access-cookie while retaining the real Supabase refresh cookie.
    const cookieState = await people.approver.api.storageState();
    const refreshOnly = await playwright.request.newContext({
      baseURL: localTestOrigin(),
      extraHTTPHeaders: fixture.clientHeaders,
      timeout: 15000,
      storageState: {
        cookies: cookieState.cookies.filter((c) => c.name === "pa_refresh"),
        origins: [],
      },
    });
    contexts.push(refreshOnly);
    const restored = await fixture.measure("auth.refresh", () =>
      refreshOnly.get("/api/state?view=home"),
    );
    expect(restored.status()).toBe(200);
    expect((await restored.json()).user.id).toBe(people.approver.id);
    expect(
      (await refreshOnly.storageState()).cookies.some(
        (c) => c.name === "pa_access",
      ),
    ).toBe(true);
    const project = await act(admin, "project.create", undefined, {
      name: "TEST full cycle " + suffix,
      organizationId: client.id,
      designerId: people.designer.id,
      prepressId: people.prepress.id,
      deadline: "2026-12-20",
      artworks: ["TEST package"],
    });
    let snapshot = await state(admin, { view: "project", project: project.id });
    const artwork = snapshot.artworks.find(
      (a: any) => a.project_id === project.id,
    );
    async function upload(n: number, technical = true) {
      snapshot = await state(people.designer.api, {
        view: "artwork",
        artwork: artwork.id,
      });
      const a = snapshot.artworks.find((x: any) => x.id === artwork.id);
      const pdf = demoPdf("CYCLE CAN", n);
      const v = await act(
        people.designer.api,
        "version.create",
        a.id,
        {
          changes: "Cycle V" + n,
          files: ["preview", "production"].map((kind) => ({
            kind,
            filename: `cycle-v${n}.pdf`,
            base64: pdf.toString("base64"),
          })),
        },
        a.row_version,
      );
      await act(people.designer.api, "version.submit", v.id);
      if (technical)
        await act(people.prepress.api, "review.complete", v.id, {
          templateId: template.id,
          status: "ready",
          items: template.items.map((label: string) => ({
            label,
            passed: true,
          })),
        });
      const round = await act(admin, "round.open", v.id, {
        approvers: [people.approver.id],
        deadline: "2026-12-20T12:00:00Z",
      });
      return { v, round, pdf };
    }
    const v1 = await upload(1);
    await act(people.approver.api, "comment.create", v1.v.id, {
      body: "Увеличить логотип",
      type: "design",
      visibility: "client",
      page: 1,
      x: 0.3,
      y: 0.3,
    });
    await act(people.approver.api, "decision.create", v1.round.id, {
      result: "changes_requested",
      comment: "Увеличить логотип",
    });
    expect(
      (
        await admin.post("/api/command", {
          headers: { "Idempotency-Key": randomUUID() },
          data: { action: "package.issue", entityId: v1.v.id, payload: {} },
        })
      ).status(),
    ).toBe(409);
    const v2 = await upload(2, false);
    expect(
      (
        await people.approver.api.post("/api/command", {
          headers: { "Idempotency-Key": randomUUID() },
          data: {
            action: "decision.create",
            entityId: v1.round.id,
            payload: { result: "approved" },
          },
        })
      ).status(),
    ).toBe(409);
    await act(people.approver.api, "decision.create", v2.round.id, {
      result: "approved",
    });
    expect(
      (
        await admin.post("/api/command", {
          headers: { "Idempotency-Key": randomUUID() },
          data: { action: "package.issue", entityId: v2.v.id, payload: {} },
        })
      ).status(),
    ).toBe(409);
    await act(people.prepress.api, "review.complete", v2.v.id, {
      templateId: template.id,
      status: "ready",
      items: template.items.map((label: string) => ({
        label,
        passed: true,
      })),
    });
    const issued = await act(admin, "package.issue", v2.v.id);
    const production = await ctx();
    expect(
      (
        await fixture.measure("auth.login", () =>
          production.post("/api/auth/login", {
            data: {
              email: "production@packapprove.local",
              password: "PackApprove2026!",
            },
          }),
        )
      ).status(),
    ).toBe(200);
    const response = await fixture.measure("package.download", () =>
      production.get("/api/packages/" + issued.id),
    );
    expect(response.status()).toBe(200);
    const hash = createHash("sha256")
      .update(await response.body())
      .digest("hex");
    expect(hash).toBe(createHash("sha256").update(v2.pdf).digest("hex"));
    expect(hash).not.toBe(createHash("sha256").update(v1.pdf).digest("hex"));
    const pkg = (
      await state(production, { view: "artwork", artwork: artwork.id })
    ).packages.find((p: any) => p.id === issued.id);
    await act(
      production,
      "package.ack",
      pkg.id,
      { sha256: hash },
      pkg.row_version,
    );
    // A genuine recovery token for the disposable invited account; no SMTP or production settings changed.
    const service = createClient(
      local.SUPABASE_URL,
      local.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } },
    );
    const generated = await service.auth.admin.generateLink({
      type: "recovery",
      email: people.approver.email,
    });
    expect(Boolean(generated.data.properties?.hashed_token)).toBe(true);
    const recovery = await ctx();
    const callback = await fixture.measure("auth.recovery.callback", () =>
      recovery.get(
        "/api/auth/callback?token_hash=" +
          generated.data.properties!.hashed_token,
        { maxRedirects: 0 },
      ),
    );
    expect(callback.status()).toBe(307);
    expect(callback.headers().location).toContain("/reset-password");
    expect(
      (
        await fixture.measure("auth.recovery.password", () =>
          recovery.post("/api/auth/password", {
            data: { password: "NewCyclePassword2026!" },
          }),
        )
      ).status(),
    ).toBe(200);
    const recovered = await state(recovery, { view: "home" });
    expect(recovered.user.id).toBe(people.approver.id);
    expect(recovered.user.role).toBe("approver");
  } finally {
    await fixture.cleanup();
  }
});
