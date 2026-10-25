import { test, expect, type APIRequestContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
test("large design bypasses JSON body limits; private verified download streams exact bytes", async ({
  playwright,
}, info) => {
  test.skip(
    info.project.name === "mobile",
    "Identical HTTP transport; viewer mobile tests run separately.",
  );
  const contexts: APIRequestContext[] = [];
  const api = async (role: string) => {
    const c = await playwright.request.newContext({
      baseURL: "http://127.0.0.1:3000",
    });
    contexts.push(c);
    expect(
      (
        await c.post("/api/auth/login", {
          data: {
            email: role + "@packapprove.local",
            password: "PackApprove2026!",
          },
        })
      ).status(),
    ).toBe(200);
    return c;
  };
  try {
    const m = await api("manager"),
      d = await api("designer");
    const state = await (await m.get("/api/state")).json();
    const post = async (
      action: string,
      entityId: string | undefined,
      payload: any = {},
      rowVersion?: number,
    ) => {
      const r = await m.post("/api/command", {
        headers: { "Idempotency-Key": randomUUID() },
        data: { action, entityId, payload, rowVersion },
      });
      expect(r.status()).toBe(200);
      return r.json();
    };
    const pr = await post("project.create", undefined, {
      name: "E2E Large Can " + randomUUID().slice(0, 8),
      organizationId: state.organizations.find((o: any) => o.kind === "client")
        .id,
      designerId: state.profiles.find(
        (p: any) => p.full_name === "Арман Касымов",
      ).id,
      prepressId: state.profiles.find((p: any) => p.role === "prepress").id,
      deadline: "2026-12-20",
      artworks: ["Large private design"],
    });
    const a = (await (await m.get("/api/state")).json()).artworks.find(
      (a: any) => a.project_id === pr.id,
    );
    const bytes = Buffer.concat([
      await readFile("public/can-demos/standard450.png"),
      Buffer.alloc(5 * 1024 * 1024),
    ]);
    const hash = createHash("sha256").update(bytes).digest("hex");
    const files = [];
    for (const kind of ["preview", "production"]) {
      const prepared = await d.post("/api/uploads/prepare", {
        data: {
          artworkId: a.id,
          kind,
          filename: "large-can.png",
          size: bytes.length,
          sha256: hash,
        },
      });
      expect(prepared.status()).toBe(200);
      const ticket = await prepared.json();
      expect(
        (
          await d.put(ticket.signedUrl, {
            headers: { "Content-Type": "image/png", "x-upsert": "false" },
            data: bytes,
          })
        ).status(),
      ).toBe(200);
      files.push({ kind, filename: "large-can.png", uploadId: ticket.id });
    }
    const payload = {
      action: "version.create",
      entityId: a.id,
      rowVersion: a.row_version,
      payload: {
        changes: "Large direct-upload verification",
        canSpec: { preset: "standard450" },
        files,
      },
    };
    expect(JSON.stringify(payload).length).toBeLessThan(2000);
    const response = await d.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: payload,
    });
    expect(response.status()).toBe(200);
    const v = await response.json();
    const file = (await (await d.get("/api/state")).json()).files.find(
      (f: any) => f.version_id === v.id && f.kind === "preview",
    );
    const result = await d.get("/api/files/" + file.id);
    expect(result.status()).toBe(200);
    expect(result.headers()["content-length"]).toBeUndefined();
    expect(result.headers()["x-content-sha256"]).toBe(hash);
    expect(
      createHash("sha256")
        .update(await result.body())
        .digest("hex"),
    ).toBe(hash);
  } finally {
    for (const c of contexts) await c.dispose();
  }
});
