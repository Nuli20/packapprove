import { test, expect } from "vitest";
import { readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import designs from "../public/showcase/manifest.json";
import { CAN_PRESETS, boundedImageDimensions } from "../lib/can-spec";
import { authorizeCommand } from "../lib/commands/permissions";
test("six fixed original wraps fit the actual approximate print surface and match hashes", async () => {
  expect(designs).toHaveLength(6);
  for (const d of designs) {
    const bytes = await readFile("public" + d.url);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(d.sha256);
    const size = boundedImageDimensions(bytes, "image/png"),
      preset = CAN_PRESETS[d.preset as keyof typeof CAN_PRESETS];
    expect(
      Math.abs(
        size.width / size.height -
          (Math.PI * preset.diameterMm) / preset.printHeightMm,
      ),
    ).toBeLessThan(0.003);
    for (let n = 1; n <= d.versions; n++) {
      const svg = await readFile(`public/showcase/${d.slug}-v${n}.svg`, "utf8");
      expect(svg).toContain("DEMO — NOT FOR PRODUCTION");
      const pdf = await readFile(`public/showcase/${d.slug}-v${n}.pdf`);
      expect(pdf.subarray(0, 5).toString()).toBe("%PDF-");
    }
  }
});
test("only admin can bootstrap the fixed portfolio, never impersonate designer actions", () => {
  for (const role of [
    "manager",
    "designer",
    "prepress",
    "observer",
    "approver",
    "production",
  ])
    expect(() =>
      authorizeCommand(
        { id: "test", role },
        { action: "showcase.import", payload: {} },
      ),
    ).toThrow();
  expect(() =>
    authorizeCommand(
      { id: "test", role: "admin" },
      { action: "showcase.import", payload: {} },
    ),
  ).not.toThrow();
  expect(() =>
    authorizeCommand(
      { id: "test", role: "admin" },
      { action: "version.create", payload: {} },
    ),
  ).toThrow();
});

test("only exact public preview hashes acquire a fallback; explicit per-version metadata wins", async () => {
  const { appendShowcaseSpecs } = await import("../lib/showcase-spec");
  const d = designs[0];
  const visuals: any[] = [];
  appendShowcaseSpecs(
    [
      { version_id: "v1", kind: "preview", sha256: d.sha256 },
      { version_id: "other", kind: "preview", sha256: "0".repeat(64) },
      { version_id: "prod", kind: "production", sha256: d.sha256 },
    ],
    visuals,
  );
  expect(visuals).toHaveLength(1);
  expect(visuals[0].version_id).toBe("v1");
  expect(visuals[0].spec.preset).toBe(d.preset);
  visuals[0].spec.preset = "slim250";
  appendShowcaseSpecs(
    [{ version_id: "v1", kind: "preview", sha256: d.sha256 }],
    visuals,
  );
  expect(visuals).toHaveLength(1);
  expect(visuals[0].spec.preset).toBe("slim250");
});
