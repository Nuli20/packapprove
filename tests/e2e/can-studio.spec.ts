import {
  test,
  expect,
  type Page,
  type APIRequestContext,
} from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import demos from "../../public/can-demos/manifest.json" with { type: "json" };
async function ready(page: Page) {
  await expect(page.locator(".can-stage")).toHaveAttribute(
    "data-webgl",
    "ready",
    { timeout: 30000 },
  );
  await expect(page.locator(".can-studio")).toHaveAttribute(
    "data-texture-hash",
    /[a-f0-9]{64}/,
    { timeout: 30000 },
  );
  await expect(page.locator(".can-loading-overlay")).toHaveCount(0);
}
async function login(page: Page, role: string) {
  await page.goto("/login");
  await page.getByLabel("Электронная почта").fill(role + "@packapprove.local");
  await page.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
  await page
    .getByRole("button", { name: "Войти в пространство", exact: true })
    .click();
  await expect(page.locator(".user-card")).toBeAttached();
}
async function screenshotHash(page: Page) {
  return createHash("sha256")
    .update(await page.locator(".can-stage canvas").screenshot())
    .digest("hex");
}
test("three actual WebGL profiles use PNG/PDF/JPEG textures and real camera controls", async ({
  page,
}, info) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/can-lab");
  for (let i = 0; i < demos.length; i++) {
    await page.locator(".can-demo-tabs button").nth(i).click();
    await ready(page);
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-can-format",
      demos[i].preset,
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      demos[i].sha256,
    );
    expect(
      await page
        .locator(".can-stage canvas")
        .evaluate((c) => !!(c as HTMLCanvasElement).getContext("webgl2")),
    ).toBe(true);
    await page.getByRole("button", { name: "Спереди", exact: true }).click();
    if (i === 1) {
      if (info.project.name === "mobile")
        await page.locator(".can-settings summary").click();
      await expect(page.getByLabel("Страница PDF")).toBeVisible();
      await page.getByRole("button", { name: "Спереди", exact: true }).click();
      const pageOne = await screenshotHash(page);
      await page.getByLabel("Страница PDF").selectOption("2");
      await ready(page);
      await expect(page.locator(".can-studio")).toHaveAttribute(
        "data-pdf-page",
        "2",
      );
      await expect.poll(() => screenshotHash(page)).not.toBe(pageOne);
    }
  }
  await page.getByRole("button", { name: "Спереди", exact: true }).click();
  const front = await screenshotHash(page);
  await page.getByRole("button", { name: "Сзади", exact: true }).click();
  await expect.poll(() => screenshotHash(page)).not.toBe(front);
  await page.getByRole("button", { name: "Сверху", exact: true }).click();
  const top = await screenshotHash(page);
  await page.getByRole("button", { name: "Приблизить", exact: true }).click();
  await expect.poll(() => screenshotHash(page)).not.toBe(top);
  await page.getByRole("button", { name: "Под углом", exact: true }).click();
  await page.locator(".can-stage").focus();
  const angle = await screenshotHash(page);
  await page.keyboard.press("ArrowRight");
  await expect.poll(() => screenshotHash(page)).not.toBe(angle);
  const canvas = page.locator(".can-stage canvas");
  const r = await canvas.boundingBox();
  if (r) {
    await page.mouse.move(r.x + r.width * 0.45, r.y + r.height * 0.5);
    await page.mouse.down();
    await page.mouse.move(r.x + r.width * 0.8, r.y + r.height * 0.5, {
      steps: 12,
    });
    await page.mouse.up();
  }
  expect(errors).toEqual([]);
});
test("WebGL unavailable offers actual 2D fallback without breaking page", async ({
  page,
}) => {
  await page.addInitScript(() => {
    const original = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (
      this: HTMLCanvasElement,
      type: string,
      ...args: any[]
    ) {
      if (
        type === "webgl2" ||
        type === "webgl" ||
        type === "experimental-webgl"
      )
        return null;
      return (original as any).call(this, type, ...args);
    } as any;
  });
  await page.goto("/can-lab");
  await expect(page.locator(".can-stage")).toHaveAttribute(
    "data-webgl",
    "unavailable",
  );
  await page.getByRole("button", { name: "Открыть 2D", exact: true }).click();
  await expect(page.locator("main img").first()).toBeVisible();
});
test("designer applies local artwork, saves a bound version through private direct upload and client cannot overwrite it", async ({
  page,
  playwright,
}, info) => {
  // Backend lifecycle is platform independent; desktop covers mutation once.
  test.skip(
    info.project.name === "mobile",
    "Desktop covers API mutation; mobile viewer is tested separately.",
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
  const act = async (
    c: APIRequestContext,
    action: string,
    entityId: string | undefined,
    payload: any = {},
    rowVersion?: number,
  ) => {
    const r = await c.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: { action, entityId, payload, rowVersion },
    });
    expect(r.status(), await r.text()).toBe(200);
    return r.json();
  };
  try {
    const manager = await api("manager");
    const state = await (await manager.get("/api/state")).json();
    const org = state.organizations.find(
      (o: any) => o.name === "ТОО «Tea House Kazakhstan»",
    );
    const d = state.profiles.find((p: any) => p.full_name === "Арман Касымов");
    const pre = state.profiles.find((p: any) => p.role === "prepress");
    const client = state.profiles.find(
      (p: any) => p.full_name === "Айгерим Нурлан",
    );
    const project = await act(manager, "project.create", undefined, {
      name: "E2E Can " + randomUUID().slice(0, 8),
      organizationId: org.id,
      designerId: d.id,
      prepressId: pre.id,
      deadline: "2026-12-20",
      artworks: ["E2E aluminium can"],
    });
    const a = (await (await manager.get("/api/state")).json()).artworks.find(
      (a: any) => a.project_id === project.id,
    );
    await login(page, "designer");
    await page.goto("/?artwork=" + a.id);
    await page
      .getByRole("button", { name: "Новая версия", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Список изменений").fill("V1 demo file");
    const files = dialog.locator("input[type=file]");
    await files.nth(0).setInputFiles("public/can-demos/zhyra-450.png");
    await files.nth(1).setInputFiles("public/can-demos/zhyra-450.png");
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(dialog).toBeHidden({ timeout: 30000 });
    const firstState = await (await manager.get("/api/state")).json();
    const firstId = firstState.artworks.find(
      (x: any) => x.id === a.id,
    ).active_version_id;
    const designer = await api("designer");
    await act(designer, "version.submit", firstId);
    await act(manager, "round.open", firstId, {
      approvers: [client.id],
      deadline: "2026-12-20T12:00:00Z",
    });
    await page.reload();
    await page.getByRole("tab", { name: "3D-банка" }).click();
    await ready(page);
    await page.getByLabel("Формат банки").selectOption("experimental");
    await page.getByLabel("Высота, мм", { exact: true }).fill("180");
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-can-format",
      "experimental",
    );
    await page
      .getByRole("button", { name: "Сбросить предпросмотр", exact: true })
      .click();
    await expect(page.getByLabel("Формат банки")).toHaveValue("standard450");
    await page.getByLabel("Формат банки").selectOption("slim250");
    await page
      .getByLabel("Загрузить дизайн")
      .setInputFiles("public/can-demos/tun-250.jpg");
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      demos[2].sha256,
    );
    await page.getByLabel("По горизонтали", { exact: true }).focus();
    for (let step = 0; step < 12; step++)
      await page.keyboard.press("ArrowRight");
    await page.getByLabel("Размер изображения", { exact: true }).focus();
    for (let step = 0; step < 20; step++)
      await page.keyboard.press("ArrowRight");
    await page
      .getByRole("button", { name: "Сохранить новой версией", exact: true })
      .click();
    const next = page.getByRole("dialog");
    await next
      .getByLabel("Список изменений")
      .fill("V2 JPEG can + visual parameters");
    await next.getByRole("button", { name: "Сохранить", exact: true }).click();
    await expect(next).toBeHidden({ timeout: 30000 });
    const saved = await (await manager.get("/api/state")).json();
    const artwork = saved.artworks.find((x: any) => x.id === a.id);
    const version = saved.versions.find(
      (v: any) => v.id === artwork.active_version_id,
    );
    expect(version.number).toBe(2);
    const spec = saved.visualizations.find(
      (v: any) => v.version_id === version.id,
    ).spec;
    expect(spec.preset).toBe("slim250");
    expect(spec.placement.x).toBe(0.12);
    await act(designer, "version.submit", version.id);
    await act(manager, "round.open", version.id, {
      approvers: [client.id],
      deadline: "2026-12-20T12:00:00Z",
    });
    await login(page, "approver");
    await page.goto("/?artwork=" + a.id);
    await page.getByRole("tab", { name: "3D-банка" }).click();
    await ready(page);
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-version-id",
      version.id,
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-can-format",
      "slim250",
    );
    await expect(page.getByLabel("Загрузить дизайн")).toHaveCount(0);
    await expect(
      page.getByLabel("По горизонтали", { exact: true }),
    ).toHaveCount(0);
    await page
      .getByLabel("Версия", { exact: true })
      .selectOption(
        saved.versions.find((v: any) => v.artwork_id === a.id && v.number === 1)
          .id,
      );
    await ready(page);
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      demos[0].sha256,
    );
    const clientApi = await api("approver");
    const denied = await clientApi.post("/api/uploads/prepare", {
      data: {
        artworkId: a.id,
        kind: "preview",
        filename: "evil.pdf",
        size: 100,
        sha256: "0".repeat(64),
      },
    });
    expect(denied.status()).toBe(403);
  } finally {
    for (const c of contexts) await c.dispose();
  }
});
