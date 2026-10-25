import { chromium } from "@playwright/test";
import { writeFile, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const designs = [
  {
    key: "standard450",
    brand: "ZHYRA",
    name: "Газированный напиток",
    ml: 450,
    width: 2048,
    height: 1343,
    bg: "#1e535a",
    ink: "#edf1d9",
    accent: "#f8b04c",
    kind: "SPARKLING / CITRUS",
    filename: "zhyra-450.png",
    mime: "image/png",
  },
  {
    key: "sleek330",
    brand: "SAIA",
    name: "Холодный чай",
    ml: 330,
    width: 2048,
    height: 1270,
    bg: "#d4e1c2",
    ink: "#355e61",
    accent: "#779986",
    kind: "SLOW BREW / PEACH",
    filename: "saia-330.pdf",
    mime: "application/pdf",
  },
  {
    key: "slim250",
    brand: "TUN",
    name: "Энергетический напиток",
    ml: 250,
    width: 2048,
    height: 1255,
    bg: "#232e39",
    ink: "#eee8dc",
    accent: "#eb7551",
    kind: "ENERGY / ZERO SUGAR",
    filename: "tun-250.jpg",
    mime: "image/jpeg",
  },
];
const browser = await chromium.launch({
  executablePath: "/usr/bin/chromium",
  args: ["--no-sandbox"],
});
const manifest = [];
try {
  for (const d of designs) {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${d.width}" height="${d.height}" viewBox="0 0 ${d.width} ${d.height}"><rect width="100%" height="100%" fill="${d.bg}"/><g fill="none" stroke="${d.accent}" stroke-width="36"><path d="M-80 1100 Q300 350 650 850 T1430 700 T2180 350"/><path d="M-60 1180 Q300 430 650 930 T1430 780 T2180 430" opacity=".4"/></g><g fill="${d.ink}" font-family="Arial,sans-serif"><text x="100" y="105" font-size="27" letter-spacing="8">PACKAPPROVE / DEMO</text><text x="1948" y="105" font-size="27" letter-spacing="5" text-anchor="end">ALUMINIUM STUDIES</text><text x="1024" y="370" text-anchor="middle" font-size="31" letter-spacing="10">${d.kind}</text><text x="1024" y="615" text-anchor="middle" font-size="202" font-weight="700" letter-spacing="8">${d.brand}</text><text x="1024" y="695" text-anchor="middle" font-size="30" letter-spacing="13">A DIFFERENT KIND OF FLOW.</text><circle cx="1024" cy="870" r="81" fill="${d.accent}"/><text x="1024" y="886" text-anchor="middle" font-size="38" font-weight="600" fill="${d.bg}">${d.ml}</text><text x="1024" y="${d.height - 106}" text-anchor="middle" font-size="27" letter-spacing="7">${d.ml} ML / DESIGN EXPLORATION</text><text x="105" y="${d.height - 65}" font-size="20" opacity=".65">FICTIONAL BRAND · VISUAL SAMPLE ONLY · NOT A PRODUCTION FILE</text></g><g stroke="${d.ink}" opacity=".35"><path d="M60 50v65M30 80h65M${d.width - 60} 50v65M${d.width - 90} 80h65"/></g></svg>`;
    await writeFile(`demo-files/cans/${d.key}.svg`, svg);
    const page = await browser.newPage({
      viewport: { width: d.width, height: d.height },
      deviceScaleFactor: 1,
    });
    await page.setContent(
      `<html><style>body{margin:0}svg{display:block}</style>${svg}</html>`,
    );
    const png = await page.screenshot({ type: "png" });
    await writeFile(`public/can-demos/${d.key}.png`, png);
    if (d.mime === "image/jpeg")
      await page.screenshot({
        path: `public/can-demos/${d.filename}`,
        type: "jpeg",
        quality: 94,
      });
    else if (d.mime === "application/pdf") {
      const variant = svg
        .replaceAll(d.bg, "#ece0bf")
        .replace("SLOW BREW / PEACH", "COLD BREW / LEMON");
      await page.setContent(
        `<html><style>body{margin:0}svg{display:block}</style>${variant}</html>`,
      );
      const second = await page.screenshot({ type: "png" });
      await writeFile("public/can-demos/sleek330-page2.png", second);
      const image = `data:image/png;base64,${png.toString("base64")}`,
        image2 = `data:image/png;base64,${second.toString("base64")}`;
      await page.setContent(
        `<html><style>@page{size:${d.width}px ${d.height}px;margin:0}body{margin:0}.sheet{height:${d.height}px;break-after:page}.sheet:last-child{break-after:auto}img{display:block;width:${d.width}px;height:${d.height}px}</style><div class="sheet"><img src="${image}"></div><div class="sheet"><img src="${image2}"></div></html>`,
      );
      await page.pdf({
        path: `public/can-demos/${d.filename}`,
        preferCSSPageSize: true,
        printBackground: true,
      });
    } else await writeFile(`public/can-demos/${d.filename}`, png);
    const bytes = await readFile(`public/can-demos/${d.filename}`);
    manifest.push({
      preset: d.key,
      name: d.name,
      brand: d.brand,
      volumeMl: d.ml,
      id: `demo-${d.ml}`,
      filename: d.filename,
      url: `/can-demos/${d.filename}`,
      mime_type: d.mime,
      size: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    });
    await page.close();
  }
  await writeFile(
    "public/can-demos/manifest.json",
    JSON.stringify(manifest, null, 2) + "\n",
  );
  console.log("Created three original can wraps: PNG, two-page PDF and JPEG.");
} finally {
  await browser.close();
}
