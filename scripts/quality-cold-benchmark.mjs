// Read-only localhost benchmark: three distinct Next production processes per build.
import { spawn } from "node:child_process";
import { once } from "node:events";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";
const args = Object.fromEntries(
    process.argv.slice(2).map((s) => s.replace(/^--/, "").split("=")),
  ),
  cwd = resolve(args.cwd || "."),
  port = Number(args.port || 3040),
  out = args.out || ".data/quality-performance/cold.json";
if (
  !cwd.startsWith("/workspace/") ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw Error("Only a local checkout and unprivileged port");
const env = Object.fromEntries(
  (await readFile(cwd + "/.env.local", "utf8"))
    .split("\n")
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
for (const k of ["DATABASE_URL", "SUPABASE_URL"])
  if (!["127.0.0.1", "localhost"].includes(new URL(env[k]).hostname))
    throw Error("External backend refused");
const runs = [];
for (let i = 0; i < 3; i++) {
  const child = spawn(
      process.execPath,
      [
        "node_modules/next/dist/bin/next",
        "start",
        "--hostname",
        "127.0.0.1",
        "--port",
        String(port),
      ],
      {
        cwd,
        env: {
          ...process.env,
          APP_ORIGIN: "http://127.0.0.1:" + port,
          COOKIE_SECURE: "false",
        },
        stdio: "ignore",
      },
    ),
    origin = "http://127.0.0.1:" + port;
  try {
    for (let n = 0; n < 100; n++) {
      if (child.exitCode !== null) throw Error("Next process failed");
      try {
        if ((await fetch(origin + "/api/health")).ok) break;
      } catch {}
      await new Promise((r) => setTimeout(r, 100));
    }
    const login = await fetch(origin + "/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json", Origin: origin },
      body: JSON.stringify({
        email: "manager@packapprove.local",
        password: "PackApprove2026!",
      }),
    });
    if (!login.ok) throw Error("Fixture authentication failed");
    const cookie = login.headers
      .getSetCookie()
      .map((v) => v.split(";")[0])
      .join("; ");
    const measure = async () => {
      const t = performance.now(),
        r = await fetch(origin + "/api/state?view=home", {
          headers: { Cookie: cookie },
        }),
        body = await r.arrayBuffer();
      if (!r.ok) throw Error("Snapshot failed " + r.status);
      return { ms: performance.now() - t, bytes: body.byteLength };
    };
    runs.push({
      run: i,
      firstAfterHealthAndLogin: await measure(),
      warm: [await measure(), await measure(), await measure()],
    });
  } finally {
    if (child.exitCode === null) {
      child.kill("SIGTERM");
      await once(child, "exit");
    }
  }
}
await mkdir(resolve(out, ".."), { recursive: true });
await writeFile(
  out,
  JSON.stringify(
    {
      conditions:
        "3 fresh local production processes. Health and login precede the first state request. DB/OS caches remain warm; this is not Vercel cold-start latency.",
      runs,
    },
    null,
    2,
  ),
);
console.log(JSON.stringify(runs));
