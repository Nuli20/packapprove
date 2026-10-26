import { test, expect, type Page, type Locator } from "@playwright/test";
import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
const fixture = {
  png: "public/can-demos/zhyra-450.png",
  pdf: "public/can-demos/saia-330.pdf",
  jpg: "public/can-demos/tun-250.jpg",
};
const digest = (b: Buffer) => createHash("sha256").update(b).digest("hex");
async function choose(
  page: Page,
  button: Locator,
  file: string | { name: string; mimeType: string; buffer: Buffer },
  activation: "click" | "tap" | "Enter" | "Space" = "click",
) {
  const event = page.waitForEvent("filechooser");
  if (activation === "Enter" || activation === "Space") {
    await button.focus();
    await button.press(activation);
  } else if (activation === "tap") await button.tap();
  else await button.click();
  const chooser = await event;
  expect(await chooser.element().getAttribute("type")).toBe("file");
  expect(chooser.isMultiple()).toBe(false);
  await chooser.setFiles(file);
  return chooser;
}
test("native chooser works with mouse, touch and keyboard; PNG/PDF replacement and 3D selection persist exact private files", async ({
  page,
  playwright,
}, info) => {
  test.setTimeout(150000);
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  let chooserEvents = 0;
  page.on("filechooser", () => chooserEvents++);
  const manager = await playwright.request.newContext({
    baseURL: "http://127.0.0.1:3000",
  });
  try {
    expect(
      (
        await manager.post("/api/auth/login", {
          data: {
            email: "manager@packapprove.local",
            password: "PackApprove2026!",
          },
        })
      ).status(),
    ).toBe(200);
    const initial = await (await manager.get("/api/state")).json();
    const projectResponse = await manager.post("/api/command", {
      headers: { "Idempotency-Key": randomUUID() },
      data: {
        action: "project.create",
        payload: {
          name: "E2E native file chooser " + randomUUID().slice(0, 8),
          organizationId: initial.organizations.find(
            (o: any) => o.kind === "client",
          ).id,
          designerId: initial.profiles.find(
            (p: any) => p.full_name === "Арман Касымов",
          ).id,
          prepressId: initial.profiles.find(
            (p: any) => p.full_name === "Тимур Ахметов",
          ).id,
          deadline: "2026-12-20",
          artworks: ["Can file chooser / 450 мл"],
        },
      },
    });
    expect(projectResponse.status()).toBe(200);
    const project = await projectResponse.json();
    const state = await (await manager.get("/api/state")).json(),
      artwork = state.artworks.find((a: any) => a.project_id === project.id);
    await page.goto("/login");
    await page
      .getByLabel("Электронная почта")
      .fill("designer@packapprove.local");
    await page.getByLabel("Пароль", { exact: true }).fill("PackApprove2026!");
    await page
      .getByRole("button", { name: "Войти в пространство", exact: true })
      .click();
    await expect(page.locator(".user-card")).toBeAttached();
    await page.goto("/?artwork=" + artwork.id);
    await page
      .getByRole("button", { name: "Новая версия", exact: true })
      .click();
    const dialog = page.getByRole("dialog");
    await dialog
      .getByLabel("Список изменений")
      .fill("V1 from native PDF chooser");
    let prepares = 0;
    page.on("request", (r) => {
      if (new URL(r.url()).pathname === "/api/uploads/prepare") prepares++;
    });
    const preview = dialog.getByRole("group", {
        name: "Предпросмотр",
        exact: true,
      }),
      production = dialog.getByRole("group", {
        name: "Производственный файл",
        exact: true,
      }),
      source = dialog.getByRole("group", {
        name: "Исходный файл",
        exact: true,
      });
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(
      dialog.getByText(
        "Добавьте файл для предпросмотра и производственный файл.",
      ),
    ).toBeVisible();
    await expect(preview.getByRole("alert")).toContainText(
      "Выберите обязательный файл",
    );
    await expect(production.getByRole("alert")).toContainText(
      "Выберите обязательный файл",
    );
    expect(prepares).toBe(0);
    await expect(
      preview.getByRole("button", { name: "Выбрать файл", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Tab");
    await expect(
      production.getByRole("button", { name: "Выбрать файл", exact: true }),
    ).toBeFocused();
    await page.keyboard.press("Shift+Tab");
    // Invalid content is rejected even if the file claims to be JPEG.
    await choose(
      page,
      preview.getByRole("button", { name: "Выбрать файл", exact: true }),
      {
        name: "not-an-image.jpg",
        mimeType: "image/jpeg",
        buffer: Buffer.from("<html>not a JPEG</html>"),
      },
      info.project.name === "mobile" ? "tap" : "click",
    );
    await expect(preview.getByRole("alert")).toContainText(
      "Формат проверяется по содержимому",
    );
    expect(prepares).toBe(0);
    await choose(
      page,
      preview.getByRole("button", { name: "Заменить файл", exact: true }),
      fixture.png,
    );
    await expect(preview.locator(".design-file-name")).toHaveText(
      "zhyra-450.png",
    );
    await expect(preview.getByRole("status")).toContainText("Готов к загрузке");
    await choose(
      page,
      preview.getByRole("button", { name: "Заменить файл", exact: true }),
      fixture.pdf,
      "Enter",
    );
    await expect(preview.locator(".design-file-name")).toHaveText(
      "saia-330.pdf",
    );
    await expect(preview.locator(".design-file-size")).toContainText("КБ");
    await expect(preview.getByRole("status")).toContainText("ещё не сохранён");
    await choose(
      page,
      production.getByRole("button", { name: "Выбрать файл", exact: true }),
      fixture.pdf,
      "Space",
    );
    await expect(production.locator(".design-file-name")).toHaveText(
      "saia-330.pdf",
    );
    await choose(
      page,
      source.getByRole("button", { name: "Выбрать файл", exact: true }),
      fixture.jpg,
    );
    await expect(source.locator(".design-file-name")).toHaveText("tun-250.jpg");
    await expect(source.getByRole("status")).toContainText("Готов к загрузке");
    expect(prepares).toBe(0);
    await dialog.evaluate((e) => (e.scrollTop = 0));
    await page.screenshot({
      path: info.outputPath(`form-${info.project.name}.png`),
    });
    const savedRequest = page.waitForRequest(
      (r) =>
        new URL(r.url()).pathname === "/api/command" &&
        r.postDataJSON()?.action === "version.create",
    );
    await dialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    const body = (await savedRequest).postDataJSON();
    expect(body.payload.files).toHaveLength(3);
    expect(body.payload.files.every((f: any) => f.uploadId && !f.base64)).toBe(
      true,
    );
    await expect(dialog).toBeHidden({ timeout: 30000 });
    const after = await (await manager.get("/api/state")).json();
    const first = after.versions.find((v: any) => v.artwork_id === artwork.id);
    expect(first.number).toBe(1);
    const firstFiles = after.files.filter(
      (f: any) => f.version_id === first.id,
    );
    expect(firstFiles).toHaveLength(3);
    for (const f of firstFiles) {
      const expected = await readFile(
        f.kind === "source" ? fixture.jpg : fixture.pdf,
      );
      expect(f.sha256).toBe(digest(expected));
      const download = await manager.get("/api/files/" + f.id);
      expect(download.status()).toBe(200);
      expect(digest(await download.body())).toBe(f.sha256);
    }
    await page.reload();
    await expect(page.locator(".large-version")).toContainText("V1");
    await page.getByRole("tab", { name: "3D-банка", exact: true }).click();
    await expect(page.locator(".can-stage")).toHaveAttribute(
      "data-webgl",
      "ready",
      { timeout: 30000 },
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      digest(await readFile(fixture.pdf)),
      { timeout: 30000 },
    );
    if (
      !(await page
        .locator(".can-settings")
        .evaluate((e) => (e as HTMLDetailsElement).open))
    )
      await page.locator(".can-settings summary").click();
    const studio = page.getByRole("group", {
      name: "Дизайн для 3D",
      exact: true,
    });
    await choose(
      page,
      studio.getByRole("button", { name: "Выбрать файл", exact: true }),
      fixture.png,
      info.project.name === "mobile" ? "tap" : "click",
    );
    await expect(studio.locator(".design-file-name")).toHaveText(
      "zhyra-450.png",
    );
    await expect(page.locator(".can-studio")).toHaveAttribute(
      "data-texture-hash",
      digest(await readFile(fixture.png)),
      { timeout: 30000 },
    );
    await expect(studio.getByRole("status")).toContainText("Готов к загрузке");
    await studio.scrollIntoViewIfNeeded();
    await page.screenshot({
      path: info.outputPath(`studio-${info.project.name}.png`),
    });
    await page
      .getByRole("button", { name: "Сохранить новой версией", exact: true })
      .click();
    const secondDialog = page.getByRole("dialog");
    await expect(
      secondDialog
        .getByRole("group", { name: "Предпросмотр", exact: true })
        .locator(".design-file-name"),
    ).toHaveText("zhyra-450.png");
    await expect(
      secondDialog
        .getByRole("group", { name: "Производственный файл", exact: true })
        .locator(".design-file-name"),
    ).toHaveText("zhyra-450.png");
    await secondDialog
      .getByLabel("Список изменений")
      .fill("V2 PNG selected in 3D Studio");
    await secondDialog
      .getByRole("button", { name: "Сохранить", exact: true })
      .click();
    await expect(secondDialog).toBeHidden({ timeout: 30000 });
    await page.reload();
    await expect(page.locator(".large-version")).toContainText("V2");
    const final = await (await manager.get("/api/state")).json();
    const second = final.versions.find(
      (v: any) => v.artwork_id === artwork.id && v.number === 2,
    );
    const secondFiles = final.files.filter(
      (f: any) => f.version_id === second.id,
    );
    expect(secondFiles).toHaveLength(2);
    for (const f of secondFiles) {
      expect(f.sha256).toBe(digest(await readFile(fixture.png)));
      const downloaded = await manager.get("/api/files/" + f.id);
      expect(downloaded.status()).toBe(200);
      expect(digest(await downloaded.body())).toBe(f.sha256);
    }
    expect(final.files.filter((f: any) => f.version_id === first.id)).toEqual(
      firstFiles,
    );
    expect(chooserEvents).toBe(6);
    expect(errors).toEqual([]);
    await writeFile(
      info.outputPath("evidence.json"),
      JSON.stringify(
        {
          project: info.project.name,
          capturedAt: new Date().toISOString(),
          nativeChooserEvents: chooserEvents,
          keyboard: ["Tab", "Shift+Tab", "Enter", "Space"],
          touch: info.project.name === "mobile",
          versions: [
            { id: first.id, number: 1, files: firstFiles },
            { id: second.id, number: 2, files: secondFiles },
          ],
          privateDownloadsVerified: true,
          oldVersionUnchanged: true,
          pageErrors: errors,
        },
        null,
        2,
      ),
    );
  } finally {
    await manager.dispose();
  }
});
