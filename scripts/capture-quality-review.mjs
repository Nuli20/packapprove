import { chromium, devices, expect } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
const args = Object.fromEntries(
    process.argv.slice(2).map((s) => s.replace(/^--/, "").split("=")),
  ),
  origin = args.origin || "http://127.0.0.1:3030",
  out = args.out || ".data/quality-screens";
if (!["localhost", "127.0.0.1"].includes(new URL(origin).hostname))
  throw Error("Isolated localhost only");
await mkdir(out, { recursive: true });
const browser = await chromium.launch({
    executablePath: "/usr/bin/chromium",
    args: [
      "--no-sandbox",
      "--use-angle=swiftshader",
      "--enable-unsafe-swiftshader",
    ],
  }),
  logs = [];
const init = await browser.newContext();
await init.request.post(origin + "/api/auth/login", {
  data: { email: "manager@packapprove.local", password: "PackApprove2026!" },
});
const fixture = await (await init.request.get(origin + "/api/state")).json();
const project = fixture.projects.find(
  (p) => p.name.includes("DEMO / ZHYRA") && p.name.includes("серия"),
);
const artwork = fixture.artworks.find((a) => a.project_id === project?.id)?.id;
await init.close();
if (!artwork) throw Error("Run the isolated can demo seed first");
try {
  for (const width of [1440, 768, 390])
    for (const role of ["manager", "can-approver"]) {
      const ctx = await browser.newContext(
        width === 390
          ? devices["iPhone 13"]
          : { viewport: { width, height: 1050 } },
      );
      try {
        const login = await ctx.request.post(origin + "/api/auth/login", {
          data: {
            email: role + "@packapprove.local",
            password: "PackApprove2026!",
          },
        });
        if (!login.ok()) throw Error("Local login failed: " + login.status());
        const p = await ctx.newPage(),
          errors = [];
        p.on("pageerror", (e) => errors.push(e.message));
        if (role === "manager") {
          await p.goto(origin + "/?view=projects&q=DEMO%20%2F%20ZHYRA");
          await expect(p.locator(".catalog-toolbar")).toBeVisible();
          await p.locator(".catalog-search input").fill("DEMO / ZHYRA");
          await expect(
            p.locator(".project-studio-card,.project-table tbody tr"),
          ).toHaveCount(2, { timeout: 30000 });
          await p.screenshot({
            path: `${out}/projects-${width}.png`,
            fullPage: true,
          });
        }
        await p.goto(origin + "/?artwork=" + artwork);
        await expect(p.locator(".studio-mode-tabs")).toBeVisible();
        await p.getByRole("tab", { name: "3D-банка", exact: true }).click();
        await expect(p.locator(".can-stage")).toHaveAttribute(
          "data-webgl",
          "ready",
          { timeout: 30000 },
        );
        await expect(p.locator(".can-loading-overlay")).toHaveCount(0);
        if (role === "can-approver")
          await p
            .locator(".studio-panel")
            .getByRole("button", { name: "Согласование клиента", exact: true })
            .click();
        await p.screenshot({
          path: `${out}/${role === "manager" ? "studio" : "client"}-${width}.png`,
          fullPage: true,
        });
        logs.push({
          width,
          role,
          errors,
          layout: await p.evaluate(() => ({
            viewport: document.documentElement.clientWidth,
            documentWidth: document.documentElement.scrollWidth,
          })),
        });
        expect(errors).toEqual([]);
      } finally {
        await ctx.close();
      }
    }
  for (const width of [1440, 390]) {
    const ctx = await browser.newContext(
      width === 390
        ? devices["iPhone 13"]
        : { viewport: { width, height: 1050 } },
    );
    try {
      await ctx.request.post(origin + "/api/auth/login", {
        data: {
          email: "designer@packapprove.local",
          password: "PackApprove2026!",
        },
      });
      const p = await ctx.newPage();
      await p.goto(origin + "/?artwork=" + artwork);
      await expect(p.locator(".artwork-heading")).toBeVisible();
      await p
        .locator(".artwork-heading")
        .getByRole("button", { name: /Новая версия|Добавить новую версию/ })
        .click();
      const dialog = p.getByRole("dialog");
      await dialog
        .getByLabel("Список изменений")
        .fill("Проверка композиции и читаемости текста");
      for (const [i, path] of [
        [0, "public/can-demos/zhyra-450.png"],
        [1, "public/can-demos/saia-330.pdf"],
      ]) {
        const group = dialog.locator(".design-file-picker").nth(i);
        const pending = p.waitForEvent("filechooser");
        await group
          .getByRole("button", { name: "Выбрать файл", exact: true })
          .click();
        await (await pending).setFiles(path);
        await expect(group.getByRole("status")).toContainText(
          "Готов к загрузке",
        );
      }
      await p.screenshot({
        path: out + `/upload-${width}.png`,
        fullPage: true,
      });
      await p.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    } finally {
      await ctx.close();
    }
  }
  await writeFile(
    out + "/evidence.json",
    JSON.stringify(
      {
        origin,
        fixtureArtworkId: artwork,
        businessMutations: false,
        note: "Auth login and normal private file reads may record access events.",
        records: logs,
      },
      null,
      2,
    ),
  );
  console.log(JSON.stringify(logs));
} finally {
  await browser.close();
}
