// Captures only the isolated fixture. Creates one invitation, rotates it afterward.
import { chromium, devices } from "@playwright/test";
import { mkdir, writeFile, readFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
const origin = process.env.PACKAPPROVE_REVIEW_ORIGIN || "http://127.0.0.1:3007";
if (!["127.0.0.1", "localhost"].includes(new URL(origin).hostname))
  throw Error("Local fixture only");
const folder = "docs/review/invitations-demo-ux";
await mkdir(folder, { recursive: true });
await mkdir(".data/review-frames", { recursive: true });
const manifest = {
  capturedAt: new Date().toISOString(),
  timezone: "Asia/Qyzylorda",
  deployment: "local production build with restricted PostgreSQL login",
  renderer: "Chromium / WebGL2 / ANGLE SwiftShader",
  mobile: "iPhone 13 emulation, not physical Safari",
  captures: [],
  pageErrors: [],
  consoleErrors: [],
  invitationLinkRotated: false,
};
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: [
    "--no-sandbox",
    "--use-angle=swiftshader",
    "--enable-unsafe-swiftshader",
  ],
});
const contexts = [];
async function page(mobile = false) {
  const c = await browser.newContext(
    mobile
      ? {
          ...devices["iPhone 13"],
          baseURL: origin,
          timezoneId: "Asia/Qyzylorda",
        }
      : {
          viewport: { width: 1600, height: 1120 },
          deviceScaleFactor: 1,
          baseURL: origin,
          timezoneId: "Asia/Qyzylorda",
        },
  );
  contexts.push(c);
  const p = await c.newPage();
  p.on("pageerror", (e) => manifest.pageErrors.push(e.message));
  p.on("console", (e) => {
    if (e.type() === "error")
      manifest.consoleErrors.push(
        e.text().replace(/[a-f0-9]{64}/g, "[redacted]"),
      );
  });
  return p;
}
async function enter(p, name) {
  await p.goto("/demo");
  await p
    .getByRole("button", { name: "Открыть кабинет: " + name, exact: true })
    .click();
  await p.locator(".user-card").waitFor();
  await p
    .getByRole("complementary", { name: "Демонстрационная среда" })
    .waitFor();
}
async function shot(p, name, fullPage = true) {
  await p.evaluate(() => document.fonts.ready);
  await p.waitForFunction(
    () =>
      [...document.querySelectorAll("canvas.pdf-canvas")].every(
        (c) => c.dataset.rendered === "true",
      ),
    undefined,
    { timeout: 30000 },
  );
  await p.waitForTimeout(250);
  await p.screenshot({ path: `${folder}/${name}.png`, fullPage });
  const url = new URL(p.url());
  url.hash = "";
  url.searchParams.delete("token");
  manifest.captures.push({
    file: name + ".png",
    url: url.href,
    viewport: await p.evaluate(() => ({
      width: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
    })),
    studio: await p
      .locator(".can-studio")
      .evaluateAll((els) => els.map((e) => ({ ...e.dataset }))),
  });
}
async function ready(p) {
  await p.locator(".can-stage[data-webgl=ready]").waitFor({ timeout: 45000 });
  await p.waitForFunction(() =>
    /^[a-f0-9]{64}$/.test(
      document.querySelector(".can-studio")?.dataset.textureHash || "",
    ),
  );
  await p.locator(".can-loading-overlay").waitFor({ state: "hidden" });
  await p.waitForTimeout(500);
}
async function act(p, action, entityId, payload = {}) {
  const r = await p.request.post("/api/command", {
    headers: { "Idempotency-Key": randomUUID() },
    data: { action, entityId, payload },
  });
  if (!r.ok()) throw Error(`Capture command ${action}: ${r.status()}`);
  return r.json();
}
let admin, invite;
try {
  const publicPage = await page();
  await publicPage.goto("/login");
  await shot(publicPage, "01-login");
  await publicPage.goto("/demo");
  await shot(publicPage, "02-demo-entry");
  for (const [name, file] of [
    ["Администратор", "03-admin"],
    ["Менеджер", "04-manager"],
    ["Дизайнер", "05-designer"],
    ["Допечатная подготовка", "06-prepress"],
    ["Клиент-согласующий", "07-client"],
    ["Производство", "08-production"],
  ]) {
    const p = await page();
    await enter(p, name);
    await shot(p, file);
    await p.context().close();
  }
  admin = await page();
  await enter(admin, "Администратор");
  await admin
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  const dialog = admin.getByRole("dialog");
  await dialog
    .getByLabel("Название проекта", { exact: true })
    .fill("ZHYRA — летняя серия");
  await dialog
    .getByLabel("Номер заказа клиента", { exact: true })
    .fill("CAN-450-26");
  await dialog
    .getByLabel("Контактное лицо", { exact: true })
    .fill("Команда Beverage Design Lab");
  await shot(admin, "09-project-order", false);
  await dialog
    .getByRole("button", { name: "Добавить клиента", exact: true })
    .click();
  await dialog
    .getByLabel("Название организации", { exact: true })
    .fill("Новый заказчик");
  await shot(admin, "10-inline-client", false);
  await dialog
    .getByRole("button", { name: "Закрыть форму", exact: true })
    .click();
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await shot(admin, "11-project-team", false);
  await dialog.getByRole("button", { name: "Продолжить", exact: true }).click();
  await dialog
    .getByLabel("Названия макетов", { exact: true })
    .fill("ZHYRA / банка 450 мл\nSAIA / банка 330 мл");
  await shot(admin, "12-project-artworks", false);
  await admin.keyboard.press("Escape");
  await dialog.waitFor({ state: "hidden" });
  const state = await (await admin.request.get("/api/state")).json();
  const manufacturer = state.organizations.find(
    (o) => o.kind === "manufacturer",
  );
  const email = "review-" + randomUUID().slice(0, 8) + "@packapprove.local";
  invite = await act(admin, "invitation.create", undefined, {
    email,
    organizationId: manufacturer.id,
    role: "designer",
  });
  const invitationPage = await page();
  await invitationPage.goto(origin + invite.invitationUrl);
  await invitationPage.getByText(email, { exact: true }).waitFor();
  await shot(invitationPage, "13-invitation");
  const mobileInvitation = await page(true);
  await mobileInvitation.goto(origin + invite.invitationUrl);
  await mobileInvitation.getByText(email, { exact: true }).waitFor();
  await shot(mobileInvitation, "14-mobile-invitation");
  await act(admin, "invitation.resend", invite.id);
  manifest.invitationLinkRotated = true;
  invite = undefined;
  const client = await page();
  await enter(client, "Клиент-согласующий");
  const clientState = await (await client.request.get("/api/state")).json();
  const artwork = clientState.artworks.find(
    (a) => a.name === "ZHYRA / цитрусовый напиток / 450 мл",
  );
  if (!artwork) throw Error("Workflow fixture is missing");
  await client.goto("/?artwork=" + artwork.id);
  await client.getByRole("tab", { name: "3D-банка", exact: true }).click();
  await ready(client);
  await client.evaluate(() => scrollTo(0, 0));
  await shot(client, "15-version-3d-comments");
  await client
    .getByRole("button", { name: "Согласование клиента", exact: true })
    .click();
  await shot(client, "16-client-approval");
  await client.getByRole("button", { name: "Под углом", exact: true }).click();
  await client.locator(".can-stage").focus();
  const hashes = [];
  for (let i = 0; i < 22; i++) {
    if (i) await client.keyboard.press("ArrowRight");
    await client.waitForTimeout(120);
    const bytes = await client.locator(".can-stage").screenshot({
      path: ".data/review-frames/frame-" + String(i).padStart(3, "0") + ".jpg",
      type: "jpeg",
      quality: 85,
    });
    hashes.push(createHash("sha256").update(bytes).digest("hex"));
  }
  execFileSync("ffmpeg", [
    "-y",
    "-loglevel",
    "error",
    "-framerate",
    "6",
    "-i",
    ".data/review-frames/frame-%03d.jpg",
    "-vf",
    "pad=ceil(iw/2)*2:ceil(ih/2)*2",
    "-c:v",
    "libvpx-vp9",
    "-crf",
    "32",
    "-b:v",
    "0",
    "-pix_fmt",
    "yuv420p",
    folder + "/version-rotation.webm",
  ]);
  manifest.rotation = { frames: 22, uniqueFrames: new Set(hashes).size };
  const mobile = await page(true);
  await enter(mobile, "Клиент-согласующий");
  await mobile.goto("/?artwork=" + artwork.id);
  await mobile.getByRole("tab", { name: "3D-банка", exact: true }).click();
  await ready(mobile);
  await mobile
    .locator(".can-studio")
    .evaluate((e) => e.scrollIntoView({ block: "start" }));
  await shot(mobile, "17-mobile-version", false);
  const mobileAdmin = await page(true);
  await enter(mobileAdmin, "Администратор");
  await mobileAdmin
    .getByRole("button", { name: "Создать проект", exact: true })
    .click();
  await mobileAdmin
    .getByRole("dialog")
    .getByLabel("Название проекта", { exact: true })
    .fill("SAIA — новая серия 330 мл");
  await shot(mobileAdmin, "18-mobile-project", false);
  await mobileAdmin.keyboard.press("Escape");
  await mobileAdmin.locator(".topbar .language").click();
  await mobileAdmin
    .getByRole("button", { name: "Жоба құру", exact: true })
    .click();
  await shot(mobileAdmin, "19-kazakh-project", false);
  if (manifest.pageErrors.length || manifest.consoleErrors.length)
    throw Error("Browser errors during captures; inspect manifest");
} finally {
  if (invite && admin)
    try {
      await act(admin, "invitation.resend", invite.id);
      manifest.invitationLinkRotated = true;
    } catch {}
  await writeFile(
    folder + "/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  for (const c of contexts) await c.close().catch(() => {});
  await browser.close();
}
console.log(
  `Saved ${manifest.captures.length} authentic screenshots and a real WebGL frame sequence.`,
);
