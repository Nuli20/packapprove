// Read-only browser benchmark. Never accepts an external site or production credentials.
import { chromium, devices, expect } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const args = Object.fromEntries(
  process.argv.slice(2).map((s) => s.replace(/^--/, "").split("=")),
);
const origin = args.origin || "http://127.0.0.1:3020";
const target = new URL(origin);
if (
  target.protocol !== "http:" ||
  !["localhost", "127.0.0.1"].includes(target.hostname)
)
  throw Error("Only isolated localhost is accepted");
const env = Object.fromEntries(
  (await readFile(".env.local", "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const [key, port] of [
  ["DATABASE_URL", "54322"],
  ["SUPABASE_URL", "54321"],
]) {
  const u = new URL(env[key]);
  if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.port !== port)
    throw Error("Not an isolated fixture");
}
if (env.NEXT_PUBLIC_DEMO_MODE !== "true") throw Error("Demo fixture required");
const out = args.out || ".data/quality-baseline";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.CHROMIUM_PATH || "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const runs = [],
  median = (a) => [...a].sort((a, b) => a - b)[Math.floor(a.length / 2)];
async function login(ctx, role) {
  const r = await ctx.request.post(origin + "/api/auth/login", {
    data: { email: role + "@packapprove.local", password: "PackApprove2026!" },
  });
  if (!r.ok()) throw Error("Local fixture login failed: " + r.status());
}
async function api(ctx, path) {
  const t = performance.now(),
    r = await ctx.request.get(origin + path),
    body = await r.body();
  if (!r.ok()) throw Error("Read failed " + r.status());
  return {
    ms: performance.now() - t,
    bytes: body.length,
    data: JSON.parse(body),
  };
}
const init = await browser.newContext();
await login(init, "manager");
const full = (await api(init, "/api/state")).data;
const project =
  full.projects.find(
    (p) => p.name.includes("DEMO / ZHYRA") && p.name.includes("серия"),
  ) || full.projects.find((p) => p.name.includes("DEMO /"));
if (!project) throw Error("The existing can demo fixture must be present");
const artwork = full.artworks.find((a) => a.project_id === project.id),
  pdf = full.files.find(
    (f) => f.kind === "preview" && f.mime_type === "application/pdf",
  );
const pdfVersion = full.versions.find((v) => v.id === pdf?.version_id);
const fixture = {
  projectId: project.id,
  artworkId: artwork.id,
  pdfArtworkId: pdfVersion?.artwork_id,
  projects: full.projects.length,
  artworks: full.artworks.length,
  versions: full.versions.length,
  datasetHash: createHash("sha256")
    .update(
      JSON.stringify([
        full.projects.map((p) => p.id).sort(),
        full.artworks.map((a) => a.id).sort(),
        full.versions.map((v) => v.id).sort(),
      ]),
    )
    .digest("hex"),
};
await init.close();
await writeFile(out + "/fixture.json", JSON.stringify(fixture, null, 2));
for (const width of [1440, 390])
  for (let run = 0; run < 3; run++) {
    const ctx = await browser.newContext(
      width === 390
        ? devices["iPhone 13"]
        : { viewport: { width, height: 1050 } },
    );
    await login(ctx, "manager");
    const page = await ctx.newPage(),
      errors = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await page.addInitScript(() => {
      window.__quality = { lcp: 0, cls: 0 };
      new PerformanceObserver((l) => {
        for (const e of l.getEntries()) window.__quality.lcp = e.startTime;
      }).observe({ type: "largest-contentful-paint", buffered: true });
      new PerformanceObserver((l) => {
        for (const e of l.getEntries())
          if (!e.hadRecentInput) window.__quality.cls += e.value;
      }).observe({ type: "layout-shift", buffered: true });
    });
    const homeCold = await api(ctx, "/api/state?view=home"),
      homeWarm = [];
    for (let n = 0; n < 3; n++)
      homeWarm.push(await api(ctx, "/api/state?view=home"));
    async function visit(path, ready) {
      const start = performance.now();
      await page.goto(origin + path);
      await ready();
      return performance.now() - start;
    }
    const dashboardMs = await visit("/", () =>
      expect(page.locator(".user-card")).toBeAttached(),
    );
    await page.waitForLoadState("networkidle");
    const nav = await page.evaluate(() => {
      const n = performance.getEntriesByType("navigation")[0];
      return {
        ttfb: n.responseStart - n.requestStart,
        fcp:
          performance.getEntriesByName("first-contentful-paint")[0]
            ?.startTime ?? null,
        ...window.__quality,
        resources: performance
          .getEntriesByType("resource")
          .filter((r) => /\.js|\.css/.test(r.name))
          .map((r) => ({
            name: new URL(r.name).pathname,
            bytes: r.encodedBodySize,
            type: r.initiatorType,
          })),
      };
    });
    const projectsMs = await visit("/?view=projects", () =>
      expect(page.locator(".catalog-toolbar")).toBeVisible(),
    );
    const projectMs = await visit("/?project=" + project.id, () =>
      expect(page.locator("main h1")).toContainText(project.name),
    );
    const artifactMs = await visit("/?artwork=" + artwork.id + "&mode=2d", () =>
      expect(page.locator(".studio-mode-tabs")).toBeVisible(),
    );
    if (run === 0)
      await page.screenshot({
        path: out + `/artwork-${width}.png`,
        fullPage: true,
      });
    // Force a genuinely lazy first 3D activation, even when saved visualization defaults to 3D.
    await page.getByRole("tab", { name: "2D-развёртка", exact: true }).click();
    const threeStart = performance.now();
    await page.getByRole("tab", { name: "3D-банка", exact: true }).click();
    await expect(page.locator(".can-stage")).toHaveAttribute(
      "data-webgl",
      "ready",
      { timeout: 30000 },
    );
    await expect(page.locator(".can-loading-overlay")).toHaveCount(0);
    const threeMs = performance.now() - threeStart;
    if (run === 0) {
      await page.screenshot({
        path: out + `/studio-${width}.png`,
        fullPage: true,
      });
      await page.goto(origin + "/?view=projects");
      await expect(page.locator(".catalog-toolbar")).toBeVisible();
      await page.screenshot({
        path: out + `/projects-${width}.png`,
        fullPage: true,
      });
    }
    let pdfMs = null;
    if (fixture.pdfArtworkId) {
      pdfMs = await visit(
        "/?artwork=" + fixture.pdfArtworkId + "&mode=2d",
        () =>
          expect(page.locator("canvas.pdf-canvas").first()).toHaveAttribute(
            "data-rendered",
            "true",
            { timeout: 30000 },
          ),
      );
    }
    const projectsAPI = await api(ctx, "/api/state?view=projects");
    runs.push({
      width,
      run,
      browserCache: "new context per run; server process warm",
      homeFirst: { ms: homeCold.ms, bytes: homeCold.bytes },
      homeWarmMedianMs: median(homeWarm.map((r) => r.ms)),
      homeWarmBytes: homeWarm[0].bytes,
      projectsAPI: { ms: projectsAPI.ms, bytes: projectsAPI.bytes },
      dashboardMs,
      projectsMs,
      projectMs,
      artifactMs,
      pdfMs,
      threeMs,
      nav,
      errors,
    });
    await ctx.close();
  }
const client = await browser.newContext({
  viewport: { width: 1440, height: 1050 },
});
await login(client, "can-approver");
const page = await client.newPage();
await page.goto(origin + "/?artwork=" + artwork.id);
await expect(page.locator(".studio-mode-tabs")).toBeVisible();
await page.getByRole("tab", { name: "3D-банка", exact: true }).click();
await expect(page.locator(".can-stage")).toHaveAttribute(
  "data-webgl",
  "ready",
  { timeout: 30000 },
);
await page
  .locator(".studio-panel")
  .getByRole("button", { name: "Согласование клиента" })
  .click();
await page.screenshot({ path: out + "/client-1440.png", fullPage: true });
await client.close();
await browser.close();
const summary = [1440, 390].map((width) => {
  const rows = runs.filter((r) => r.width === width);
  return {
    width,
    medians: Object.fromEntries(
      [
        "dashboardMs",
        "projectsMs",
        "projectMs",
        "artifactMs",
        "pdfMs",
        "threeMs",
        "homeWarmMedianMs",
      ].map((k) => [k, median(rows.map((r) => r[k]))]),
    ),
    homeFirstMedianMs: median(rows.map((r) => r.homeFirst.ms)),
    homeBytes: rows[0].homeWarmBytes,
    projectsBytes: rows[0].projectsAPI.bytes,
    jsBytes: median(
      rows.map((r) =>
        r.nav.resources
          .filter((x) => x.name.includes(".js"))
          .reduce((n, r) => n + r.bytes, 0),
      ),
    ),
    cssBytes: median(
      rows.map((r) =>
        r.nav.resources
          .filter((x) => x.name.includes(".css"))
          .reduce((n, r) => n + r.bytes, 0),
      ),
    ),
    ttfb: median(rows.map((r) => r.nav.ttfb)),
    fcp: median(rows.map((r) => r.nav.fcp)),
    lcpAfterNetworkIdle: median(rows.map((r) => r.nav.lcp)),
    clsAfterNetworkIdle: median(rows.map((r) => r.nav.cls)),
  };
});
await writeFile(
  out + "/benchmark.json",
  JSON.stringify(
    {
      origin,
      fixture,
      conditions:
        "Local production build, same machine, no network throttling, 3 fresh browser contexts per width; warm process. INP not measured. GPU SwiftShader.",
      runs,
      summary,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify({ fixture, summary }));
