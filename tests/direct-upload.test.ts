import { beforeAll, describe, it, expect } from "vitest";
import { randomUUID } from "node:crypto";
import { db, asUser } from "../lib/db";
import { execute, type User } from "../lib/service";
import { prepareUpload } from "../lib/uploads";
import { download, snapshot } from "../lib/queries";
import { sha256 } from "../lib/security";
import { DEFAULT_CAN_SPEC } from "../lib/can-spec";
import { demoPdf } from "../scripts/demo-pdf";
let designer: User, manager: User, client: User, organization: string;
const act = (
  u: User,
  action: any,
  id?: string,
  payload: any = {},
  rowVersion?: number,
  key = randomUUID(),
) => execute(u, key, { action, entityId: id, payload, rowVersion });
beforeAll(async () => {
  const profiles = await db`select * from profiles`;
  designer = profiles.find((p) => p.full_name === "Арман Касымов") as User;
  manager = profiles.find((p) => p.full_name === "Дана Ибраева") as User;
  client = profiles.find((p) => p.full_name === "Айгерим Нурлан") as User;
  organization = (
    await db`select id from organizations where name='ТОО «Tea House Kazakhstan»'`
  )[0].id;
});
async function fixture() {
  const prepress = (
    await db`select id from profiles where full_name='Тимур Ахметов'`
  )[0].id;
  const pr = await act(manager, "project.create", undefined, {
    name: "TEST CAN " + randomUUID().slice(0, 8),
    organizationId: organization,
    designerId: designer.id,
    prepressId: prepress,
    deadline: "2026-12-20",
    artworks: ["Can upload"],
  });
  return (await db`select * from artworks where project_id=${pr.id}`)[0];
}
async function upload(
  artwork: string,
  kind: string,
  bytes: Buffer,
  expected = sha256(bytes),
) {
  const ticket = await prepareUpload(designer, {
    artworkId: artwork,
    kind,
    filename: "large-print.pdf",
    size: bytes.length,
    sha256: expected,
  });
  const r = await fetch(ticket.signedUrl, {
    method: "PUT",
    headers: { "Content-Type": "application/pdf", "x-upsert": "false" },
    body: bytes as BodyInit,
  });
  expect(r.status).toBe(200);
  return ticket;
}
describe("Private direct upload and immutable 3D version binding", () => {
  it("finalizes >Vercel-body-limit PDF with tiny metadata, validates hash, consumes tickets and preserves exact bytes", async () => {
    const a = await fixture();
    const bytes = Buffer.concat([
      demoPdf("CAN"),
      Buffer.alloc(5 * 1024 * 1024, 32),
    ]);
    const files = [];
    const tickets = [];
    for (const kind of ["preview", "production"]) {
      const t = await upload(a.id, kind, bytes);
      tickets.push(t);
      files.push({ kind, filename: "large-print.pdf", uploadId: t.id });
    }
    const key = randomUUID();
    const payload = {
      changes: "Direct >5MB upload",
      canSpec: { ...DEFAULT_CAN_SPEC, preset: "sleek330" },
      files,
    };
    expect(JSON.stringify(payload).length).toBeLessThan(1500);
    const result = await act(
      designer,
      "version.create",
      a.id,
      payload,
      a.row_version,
      key,
    );
    const again = await act(
      designer,
      "version.create",
      a.id,
      payload,
      a.row_version,
      key,
    );
    expect(result.id).toBe(again.id);
    const [v] =
      await db`select * from version_visualizations where version_id=${result.id}`;
    expect(v.spec.preset).toBe("sleek330");
    const [f] =
      await db`select * from version_files where version_id=${result.id} and kind='production'`;
    expect(f.sha256).toBe(sha256(bytes));
    expect(f.storage_path).not.toContain("_quarantine");
    const actual = await download(designer, f.id, false);
    expect(sha256(actual.bytes)).toBe(f.sha256);
    expect(
      (await db`select status from upload_tickets where id=${tickets[0].id}`)[0]
        .status,
    ).toBe("consumed");
    // Even if a capability can be reused to recreate quarantine, it never targets frozen data.
    await fetch(tickets[0].signedUrl, {
      method: "PUT",
      headers: { "Content-Type": "application/pdf", "x-upsert": "true" },
      body: demoPdf("TAMPER") as BodyInit,
    });
    expect(sha256((await download(designer, f.id, false)).bytes)).toBe(
      f.sha256,
    );
    await expect(
      db`update version_visualizations set spec='{}'::jsonb where id=${v.id}`,
    ).rejects.toThrow("Immutable");
    await expect(
      act(
        designer,
        "version.create",
        a.id,
        { ...payload, changes: "replay" },
        a.row_version + 1,
      ),
    ).rejects.toThrow("использована");
  });
  it("rejects hash mismatch, wrong MIME, client uploads and cross-artwork ticket reuse", async () => {
    const a = await fixture(),
      b = await fixture();
    const bytes = demoPdf("CAN");
    await expect(
      prepareUpload(client, {
        artworkId: a.id,
        kind: "preview",
        filename: "x.pdf",
        size: bytes.length,
        sha256: sha256(bytes),
      }),
    ).rejects.toThrow("Недостаточно прав");
    const t = await upload(a.id, "preview", bytes, "0".repeat(64));
    await expect(
      act(
        designer,
        "version.create",
        a.id,
        {
          changes: "bad hash",
          files: [
            { kind: "preview", filename: "x.pdf", uploadId: t.id },
            {
              kind: "production",
              filename: "x.pdf",
              base64: bytes.toString("base64"),
            },
          ],
        },
        a.row_version,
      ),
    ).rejects.toThrow("SHA-256");
    const valid = await upload(a.id, "preview", bytes);
    await expect(
      act(
        designer,
        "version.create",
        b.id,
        {
          changes: "cross artwork",
          files: [
            { kind: "preview", filename: "x.pdf", uploadId: valid.id },
            {
              kind: "production",
              filename: "x.pdf",
              base64: bytes.toString("base64"),
            },
          ],
        },
        b.row_version,
      ),
    ).rejects.toThrow("не принадлежит");
    const evil = Buffer.from("<html><script>bad()</script></html>");
    const bad = await upload(a.id, "preview", evil);
    await expect(
      act(
        designer,
        "version.create",
        a.id,
        {
          changes: "bad mime",
          files: [
            { kind: "preview", filename: "x.pdf", uploadId: bad.id },
            {
              kind: "production",
              filename: "x.pdf",
              base64: bytes.toString("base64"),
            },
          ],
        },
        a.row_version,
      ),
    ).rejects.toThrow("PDF");
  });
  it("RLS hides unpublished visualization from client and denies editing even after publication", async () => {
    const a = await fixture();
    const bytes = demoPdf("SAFE").toString("base64");
    const v = await act(
      designer,
      "version.create",
      a.id,
      {
        changes: "Bound can spec",
        canSpec: DEFAULT_CAN_SPEC,
        files: ["preview", "production"].map((kind) => ({
          kind,
          filename: "safe.pdf",
          base64: bytes,
        })),
      },
      a.row_version,
    );
    expect(
      (await snapshot(client)).visualizations.some(
        (x) => x.version_id === v.id,
      ),
    ).toBe(false);
    await act(designer, "version.submit", v.id);
    await act(manager, "round.open", v.id, {
      approvers: [client.id],
      deadline: "2026-12-20T12:00:00Z",
    });
    expect(
      (await snapshot(client)).visualizations.some(
        (x) => x.version_id === v.id,
      ),
    ).toBe(true);
    await expect(
      asUser(client.id, async (tx) => {
        await tx`update version_files set filename='evil' where version_id=${v.id}`;
      }),
    ).rejects.toThrow();
  });
});
