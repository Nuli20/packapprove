import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
const demos: {
  id: string;
  slug: string;
  brand: string;
  versions: number;
  sha256: string;
  preset: string;
}[] = JSON.parse(readFileSync("public/showcase/manifest.json", "utf8"));
import { OwnedFixture } from "./support/owned-fixture";

test("admin confirms six real private projects; repeat import preserves IDs and existing orders", async ({
  page,
  playwright,
}, info) => {
  test.setTimeout(120000);
  const f = new OwnedFixture(playwright, info);
  try {
    await f.browser(page);
    const admin = await f.login("admin"),
      org = await f.organization(admin),
      own = await f.project(admin, org.id);
    const original = (
      await f.state(admin, { view: "project", project: own.project.id })
    ).projects[0];
    await f.command(
      admin,
      "project.update",
      own.project.id,
      {
        name: "Кола Зеро",
        deadline: original.deadline.slice(0, 10),
        priority: original.priority,
        status: original.status,
        designerId: original.designer_id,
        prepressId: original.prepress_id,
      },
      original.row_version,
    );
    const before = await f.state(admin, {
      view: "project",
      project: own.project.id,
    });
    const setup = await f.state(admin, { view: "setup" });
    await page.goto("/login");
    await page.getByLabel("Электронная почта").fill("admin@packapprove.local");
    await page.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
    await page
      .getByRole("button", { name: "Войти в пространство", exact: true })
      .click();
    await expect(page.locator(".user-card")).toBeAttached();
    await page.goto("/?view=projects");
    await page
      .getByRole("button", { name: "Добавить демо-проекты", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await expect(dialog.locator("figure")).toHaveCount(6);
    await dialog
      .getByRole("combobox")
      .nth(0)
      .selectOption(
        setup.profiles.find((p: any) => p.full_name === "Арман Касымов").id,
      );
    await dialog
      .getByRole("combobox")
      .nth(1)
      .selectOption(
        setup.profiles.find((p: any) => p.full_name === "Тимур Ахметов").id,
      );
    await dialog.getByRole("checkbox").check();
    const saved = page.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/command" &&
        r.request().postDataJSON()?.action === "showcase.import",
    );
    await dialog
      .getByRole("button", { name: "Добавить шесть проектов", exact: true })
      .click();
    const response = await saved;
    expect(response.status()).toBe(200);
    const ids = (await response.json()).projects;
    expect(ids).toHaveLength(6);
    await expect(dialog).toBeHidden();
    const repeated = await f.command(admin, "showcase.import", undefined, {
      confirmed: true,
      designerId: setup.profiles.find(
        (p: any) => p.full_name === "Арман Касымов",
      ).id,
      prepressId: setup.profiles.find(
        (p: any) => p.full_name === "Тимур Ахметов",
      ).id,
    });
    expect(repeated.projects).toEqual(ids);
    const after = await f.state(admin, {
      view: "project",
      project: own.project.id,
    });
    expect(after.projects).toEqual(before.projects);
    expect(after.artworks).toEqual(before.artworks);
    const client = await f.login("approver");
    expect(
      (
        await client.post("/api/command", {
          headers: { "Idempotency-Key": crypto.randomUUID() },
          data: { action: "showcase.import", payload: { confirmed: true } },
        })
      ).status(),
    ).toBe(403);
    for (const [i, d] of demos.entries()) {
      const project = await f.state(admin, {
        view: "project",
        project: ids[i],
      });
      const artwork = project.artworks[0];
      await page.goto("/?artwork=" + artwork.id);
      await expect(page.locator(".large-version")).toContainText(
        "V" + d.versions,
      );
      await page.reload();
      await page
        .getByRole("tab", { name: "2D-развёртка", exact: true })
        .click();
      await expect(page.locator(".preview-document img")).toBeVisible();
      await page.getByRole("tab", { name: "3D-банка", exact: true }).click();
      await expect(page.locator(".can-stage")).toHaveAttribute(
        "data-webgl",
        "ready",
        { timeout: 30000 },
      );
      await expect(page.locator(".can-studio")).toHaveAttribute(
        "data-texture-hash",
        project.files.find(
          (f: any) =>
            f.version_id === artwork.active_version_id && f.kind === "preview",
        ).sha256,
      );
    }
  } finally {
    await f.cleanup();
  }
});
test("six public portfolio textures render and rotate without private API access", async ({
  page,
}, info) => {
  test.setTimeout(120000);
  const privateRequests: string[] = [];
  page.on("request", (r) => {
    if (new URL(r.url()).pathname.startsWith("/api/"))
      privateRequests.push(new URL(r.url()).pathname);
  });
  await page.goto("/can-lab");
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        window.visualViewport!.width + 1,
    ),
  ).toBe(true);
  for (const d of demos) {
    await page
      .getByRole("button", { name: new RegExp(d.brand + " /") })
      .click();
    await expect(page.locator(".can-stage")).toHaveAttribute(
      "data-webgl",
      "ready",
      { timeout: 30000 },
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      d.sha256,
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-can-format",
      d.preset,
    );
    const canvas = page.locator(".can-stage canvas");
    const box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await canvas.scrollIntoViewIfNeeded();
    await page.getByRole("button", { name: "Спереди", exact: true }).click();
    await page.screenshot({
      path: `.data/showcase/${info.project.name}-${d.slug}.png`,
      fullPage: true,
    });
    await page.locator(".can-stage").focus();
    for (let turn = 0; turn < 8; turn++)
      await page
        .getByRole("button", { name: "Повернуть влево", exact: true })
        .click();
    await page.getByRole("button", { name: "Сзади", exact: true }).click();
    await page.getByRole("button", { name: "Спереди", exact: true }).click();
  }
  expect(privateRequests).toEqual([]);
});
