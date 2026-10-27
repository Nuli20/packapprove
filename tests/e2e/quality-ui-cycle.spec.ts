import { test, expect, type Page, type BrowserContext } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, mkdir } from "node:fs/promises";
import { localTestOrigin } from "../local-environment";
test.use({ actionTimeout: 15000 });
const origin = localTestOrigin(),
  fixturePassword = "QualityBrowser2026!";
async function login(p: Page, email: string, password = "PackApprove2026!") {
  await p.bringToFront();
  await p.goto("/login");
  await p.getByLabel("Электронная почта", { exact: true }).fill(email);
  await p.getByLabel("Пароль", { exact: true }).fill(password);
  await p
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(p.locator(".user-card")).toBeAttached();
}
async function save(p: Page) {
  const d = p.getByRole("dialog"),
    response = p.waitForResponse(
      (r) =>
        new URL(r.url()).pathname === "/api/command" &&
        r.request().method() === "POST",
    );
  await d.getByRole("button", { name: "Сохранить", exact: true }).click();
  const r = await response;
  expect(r.status(), (await r.json()).error || "UI command").toBe(200);
  await expect(d).toBeHidden({ timeout: 30000 });
}
async function state(p: Page) {
  const r = await p.request.get("/api/state");
  expect(r.ok()).toBe(true);
  return r.json();
}
async function upload(p: Page, artwork: string, file: string, changes: string) {
  await p.bringToFront();
  await p.goto("/?artwork=" + artwork);
  await p
    .locator(".artwork-heading")
    .getByRole("button", {
      name: /Загрузить первый макет|Добавить новую версию/,
    })
    .click();
  const d = p.getByRole("dialog");
  await d.getByLabel("Список изменений").fill(changes);
  for (const kind of ["Предпросмотр", "Производственный файл"]) {
    const group = d.getByRole("group", { name: kind, exact: true }),
      event = p.waitForEvent("filechooser");
    await group
      .getByRole("button", { name: "Выбрать файл", exact: true })
      .click();
    await (await event).setFiles(file);
    await expect(group.getByRole("status")).toContainText("Готов к загрузке");
  }
  await save(p);
  await p.reload();
  await expect(p.locator(".large-version")).toContainText(
    changes.startsWith("V1") ? "V1" : "V2",
  );
}
async function review(p: Page, artwork: string) {
  await p.bringToFront();
  await p.goto("/?artwork=" + artwork);
  await p
    .locator(".artwork-heading")
    .getByRole("button", { name: "Техническая проверка", exact: true })
    .click();
  const d = p.getByRole("dialog");
  await expect(d.getByRole("checkbox").first()).toBeVisible();
  for (const c of await d.getByRole("checkbox").all()) await c.check();
  await save(p);
}
async function send(p: Page, artwork: string, person: string) {
  await p.bringToFront();
  await p.goto("/?artwork=" + artwork);
  await p
    .locator(".artwork-heading")
    .getByRole("button", { name: "Отправить клиенту", exact: true })
    .click();
  await p.getByRole("dialog").getByLabel(person, { exact: true }).check();
  await save(p);
}
async function decision(
  p: Page,
  result: "Утвердить версию" | "Запросить изменения",
) {
  await p.bringToFront();
  const mobile = p.locator(".mobile-decision-bar");
  const area = (await mobile.isVisible())
    ? mobile
    : p.locator(".decision-actions");
  await area.getByRole("button", { name: result, exact: true }).click();
  const d = p.getByRole("dialog");
  await expect(d.locator(".approval-file-identity b")).toContainText(
    await p.locator(".large-version").innerText(),
  );
  await expect(d.locator(".approval-file-identity")).toContainText(
    /SHA-256 · [a-f0-9]{64}/,
  );
  await d
    .getByLabel("Комментарий к решению", { exact: true })
    .fill(
      result === "Утвердить версию"
        ? "Утверждаю сохранённый V2"
        : "Увеличить название напитка",
    );
  if (result === "Утвердить версию") await d.getByRole("checkbox").check();
  await save(p);
}
test("UI: new client and one-use invitations → V1 → changes → V2 → approval → exact file → receipt → revoke", async ({
  page,
  browser,
}, info) => {
  test.setTimeout(300000);
  const suffix = randomUUID().slice(0, 8),
    clientName = "Quality клиент " + suffix,
    projectName = "Quality UI " + suffix,
    contexts: BrowserContext[] = [],
    errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  const people: Record<
    string,
    { p: Page; name: string; email: string; link: string; ctx: BrowserContext }
  > = {};
  const newPage = async (record = false) => {
    const ctx = await browser.newContext({
      baseURL: origin,
      viewport: page.viewportSize()!,
      isMobile: info.project.name === "mobile",
      hasTouch: info.project.name === "mobile",
      ...(record
        ? {
            recordVideo: {
              dir: test.info().outputPath("videos"),
              size: { width: 960, height: 720 },
            },
          }
        : {}),
    });
    contexts.push(ctx);
    const p = await ctx.newPage();
    p.on("pageerror", (e) => errors.push(e.message));
    return { p, ctx };
  };
  try {
    await login(page, "admin@packapprove.local");
    await page.goto("/?view=clients");
    await page
      .getByRole("button", { name: "Добавить клиента", exact: true })
      .click();
    await page
      .getByRole("dialog")
      .getByLabel("Название", { exact: true })
      .fill(clientName);
    await save(page);
    await expect(
      page.getByRole("heading", { name: clientName, exact: true }),
    ).toBeVisible();
    // These are real invitations with registration, never fabricated profile rows.
    for (const role of ["designer", "prepress", "approver"]) {
      await page.goto("/?view=settings");
      await page
        .getByRole("button", { name: "Пригласить представителя", exact: true })
        .click();
      const d = page.getByRole("dialog"),
        email = `quality-${role}-${suffix}@packapprove.local`,
        name = `Quality ${role} ${suffix}`;
      await d.getByLabel("Организация клиента", { exact: true }).selectOption({
        label: role === "approver" ? clientName : "ТОО «QAZALPACK»",
      });
      await d.getByLabel("Электронная почта", { exact: true }).fill(email);
      await d
        .getByLabel("Контроль доступа", { exact: true })
        .selectOption(role);
      await d.getByRole("button", { name: "Сохранить", exact: true }).click();
      const field = d.getByRole("textbox", {
        name: "Пригласить представителя",
        exact: true,
      });
      await expect(field).toHaveValue(/\/invite#token=/);
      const link = await field.inputValue();
      await d.getByRole("button", { name: "Закрыть", exact: true }).click();
      const { p, ctx } = await newPage(role !== "prepress");
      await p.goto(link);
      await expect(p).toHaveURL(origin + "/invite");
      await p.getByLabel("Имя и фамилия", { exact: true }).fill(name);
      await p.getByLabel("Пароль", { exact: true }).fill(fixturePassword);
      await p
        .getByLabel("Повторите пароль", { exact: true })
        .fill(fixturePassword);
      await p
        .getByRole("button", { name: "Принять приглашение", exact: true })
        .click();
      await expect(p.locator(".user-card")).toContainText(name);
      people[role] = { p, ctx, name, email, link };
      const used = await page.request.post("/api/invitations/info", {
        data: { token: link.split("token=")[1] },
      });
      expect(used.ok()).toBe(false);
    }
    const manager = (await newPage()).p;
    await login(manager, "manager@packapprove.local");
    await manager
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    let d = manager.getByRole("dialog");
    await d.getByLabel("Название проекта", { exact: true }).fill(projectName);
    await d
      .getByLabel("Заказчик", { exact: true })
      .selectOption({ label: clientName });
    await d.getByRole("button", { name: "Продолжить", exact: true }).click();
    await d
      .getByLabel("Дизайнер", { exact: true })
      .selectOption({ label: people.designer.name });
    await d
      .getByLabel("Допечатная подготовка", { exact: true })
      .selectOption({ label: people.prepress.name });
    await d.getByRole("button", { name: "Продолжить", exact: true }).click();
    await d
      .getByLabel("Названия макетов", { exact: true })
      .fill("Quality Standard / 450 мл");
    await d.getByLabel("Срок проекта", { exact: true }).fill("2026-12-20");
    await d
      .getByRole("button", { name: "Создать проект", exact: true })
      .click();
    await expect(d).toBeHidden();
    await expect(manager).toHaveURL(/project=/);
    await manager.reload();
    let s = await state(manager);
    const project = s.projects.find((x: any) => x.name === projectName),
      artwork = s.artworks.find((a: any) => a.project_id === project.id);
    expect(project).toBeTruthy();
    // AddArtwork is independent from a version and remains unapproved.
    await manager
      .getByRole("button", { name: "Добавить макет", exact: true })
      .click();
    await manager
      .getByRole("dialog")
      .getByLabel("Название", { exact: true })
      .fill("Независимый макет / 330 мл");
    await save(manager);
    const designer = people.designer.p,
      prepress = people.prepress.p,
      client = people.approver.p;
    await upload(
      designer,
      artwork.id,
      "public/can-demos/coverage-standard450.png",
      "V1: контрольная развёртка",
    );
    await designer.getByRole("tab", { name: "3D-банка", exact: true }).click();
    await expect(designer.locator(".can-stage")).toHaveAttribute(
      "data-webgl",
      "ready",
      { timeout: 30000 },
    );
    const canvas = designer.locator(".can-stage canvas"),
      box = await canvas.boundingBox();
    expect(box).toBeTruthy();
    await designer.mouse.move(
      box!.x + box!.width / 2,
      box!.y + box!.height / 2,
    );
    await designer.mouse.down();
    await designer.mouse.move(
      box!.x + box!.width / 2 + 100,
      box!.y + box!.height / 2 + 25,
      { steps: 20 },
    );
    await designer.mouse.up();
    await designer.mouse.wheel(0, -130);
    await designer
      .locator(".artwork-heading")
      .getByRole("button", { name: "На внутреннюю проверку", exact: true })
      .click();
    await expect(designer.locator(".artwork-heading .badge")).toContainText(
      "Внутренняя проверка",
    );
    await review(prepress, artwork.id);
    await send(manager, artwork.id, people.approver.name);
    await client.bringToFront();
    await client.goto("/?artwork=" + artwork.id);
    await expect(client.locator(".large-version")).toHaveText("V1");
    await client
      .getByRole("tab", { name: "2D-развёртка", exact: true })
      .click();
    await client
      .locator(".preview-document img")
      .click({ position: { x: 80, y: 80 } });
    d = client.getByRole("dialog");
    await d
      .getByLabel("Комментарии", { exact: true })
      .fill("Увеличить название напитка");
    await save(client);
    await decision(client, "Запросить изменения");
    s = await state(manager);
    const v1 = s.versions.find((v: any) => v.artwork_id === artwork.id),
      r1 = s.rounds.find((r: any) => r.version_id === v1.id),
      decision1 = s.decisions.find((v: any) => v.round_id === r1.id);
    expect(r1.status).toBe("changes_requested");
    expect(decision1.result).toBe("changes_requested");
    const forbidden = await designer.request.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        action: "decision.create",
        entityId: r1.id,
        payload: { result: "approved", sha256: decision1.sha256 },
      },
    });
    expect(forbidden.status()).toBe(403);
    await upload(
      designer,
      artwork.id,
      "public/can-demos/zhyra-450.png",
      "V2: увеличено название",
    );
    await designer
      .locator(".artwork-heading")
      .getByRole("button", { name: "На внутреннюю проверку", exact: true })
      .click();
    await review(prepress, artwork.id);
    await send(manager, artwork.id, people.approver.name);
    await client.bringToFront();
    await client.goto("/?artwork=" + artwork.id);
    await expect(client.locator(".large-version")).toHaveText("V2");
    await client.getByRole("tab", { name: "3D-банка", exact: true }).click();
    await expect(client.locator(".can-stage")).toHaveAttribute(
      "data-webgl",
      "ready",
      { timeout: 30000 },
    );
    const settings = client.locator(".can-settings");
    if (!(await settings.evaluate((el) => (el as HTMLDetailsElement).open)))
      await settings.locator(":scope > summary").click();
    await expect(
      settings.getByRole("button", { name: /Standard/ }),
    ).toBeDisabled();
    await decision(client, "Утвердить версию");
    s = await state(manager);
    const v2 = s.versions.find(
      (v: any) => v.artwork_id === artwork.id && v.number === 2,
    );
    expect(v2.status).toBe("approved");
    expect(s.decisions.find((v: any) => v.id === decision1.id)).toEqual(
      decision1,
    );
    expect(s.versions.find((v: any) => v.id === v1.id).changes).toBe(
      v1.changes,
    );
    const stale = await client.request.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        action: "decision.create",
        entityId: r1.id,
        payload: { result: "approved" },
      },
    });
    expect(stale.status()).toBe(409);
    await manager.goto("/?artwork=" + artwork.id);
    await manager
      .locator(".artwork-heading")
      .getByRole("button", { name: "Передать в производство", exact: true })
      .click();
    await save(manager);
    s = await state(manager);
    const pkg = s.packages.find((v: any) => v.version_id === v2.id);
    expect(pkg).toBeTruthy();
    expect(
      s.artworks.find(
        (a: any) => a.project_id === project.id && a.id !== artwork.id,
      ).active_version_id,
    ).toBeNull();
    const production = (await newPage()).p;
    await login(production, "production@packapprove.local");
    await production.goto("/?view=packages");
    const card = production
      .locator(".package-card")
      .filter({ hasText: pkg.number });
    await expect(card).toBeVisible();
    const event = production.waitForEvent("download");
    await card.getByRole("link", { name: "Скачать файл", exact: true }).click();
    const download = await event,
      bytes = await readFile((await download.path())!);
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(pkg.sha256);
    expect(bytes).toEqual(await readFile("public/can-demos/zhyra-450.png"));
    await card
      .getByRole("button", { name: "Подтвердить получение", exact: true })
      .click();
    await production
      .getByRole("dialog")
      .getByLabel("Контрольная сумма SHA-256", { exact: true })
      .fill(pkg.sha256);
    await save(production);
    await expect(card.locator(".badge")).toContainText("Получен");
    await manager.goto("/?view=packages");
    await manager
      .locator(".package-card")
      .filter({ hasText: pkg.number })
      .getByRole("button", { name: "Отозвать комплект", exact: true })
      .click();
    await manager
      .getByRole("dialog")
      .getByLabel("Причина", { exact: true })
      .fill("Проверка отзыва тестового комплекта");
    await save(manager);
    await production.reload();
    await expect(card).toContainText("Отозван");
    await expect(
      card.getByRole("link", { name: "Скачать файл", exact: true }),
    ).toHaveCount(0);
    expect(
      (await production.request.get("/api/packages/" + pkg.id)).status(),
    ).toBe(410);
    await mkdir(".data/quality-ui", { recursive: true });
    await client.screenshot({
      path: `.data/quality-ui/approved-${info.project.name}.png`,
      fullPage: true,
    });
    expect(errors).toEqual([]);
  } finally {
    for (const c of contexts) await c.close();
    const videos = await Promise.all(
      Object.entries(people)
        .filter(([role]) => role !== "prepress")
        .map(async ([role, { p }]) => ({
          role,
          path: await p.video()?.path(),
        })),
    );
    await mkdir(".data/quality-ui", { recursive: true });
    await import("node:fs/promises").then((fs) =>
      fs.writeFile(
        `.data/quality-ui/videos-${info.project.name}.json`,
        JSON.stringify(videos, null, 2),
      ),
    );
  }
});
