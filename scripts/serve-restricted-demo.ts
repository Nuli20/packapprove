import nextEnv from "@next/env";
nextEnv.loadEnvConfig(process.cwd());
import postgres from "postgres";
import { randomBytes } from "node:crypto";
import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { runtimeDiagnosis } from "../lib/runtime-database";
import { isolatedDemoEnabled } from "../lib/demo-environment";
if (!isolatedDemoEnabled())
  throw Error(
    "Restricted runtime can start only against the isolated local fixture.",
  );
const index = process.argv.indexOf("--port");
const port = index >= 0 ? Number(process.argv[index + 1]) : 3005;
if (!Number.isInteger(port) || port < 1024 || port > 65535)
  throw Error("Invalid test port");
const owner = postgres(process.env.DATABASE_URL!, { max: 1 });
const role = "pa_test_runtime_" + randomBytes(8).toString("hex"),
  password = randomBytes(32).toString("hex");
let created = false,
  child: ChildProcess | undefined;
const stop = () => child?.kill("SIGTERM");
try {
  await owner.unsafe(
    `create role ${role} login noinherit password '${password}'`,
  );
  created = true;
  await owner.unsafe(`grant packapprove_app to ${role}`);
  const url = new URL(process.env.DATABASE_URL!);
  url.username = role;
  url.password = password;
  const probe = postgres(url.href, { max: 1 });
  let denied = false;
  const runtimeCheck = await runtimeDiagnosis(probe);
  if (!runtimeCheck.safe) {
    await probe.end();
    throw Error("Unsafe restricted fixture role");
  }
  try {
    await probe`select email from public.invitations limit 1`;
  } catch (e) {
    denied = (e as { code?: string }).code === "42501";
  } finally {
    await probe.end();
  }
  if (!denied)
    throw Error("Restricted runtime unexpectedly has direct invitation access");
  console.log(
    JSON.stringify({
      port,
      restrictedServer: true,
      runtimeCheck,
      directInvitationSelect: false,
      credentials: "not logged",
    }),
  );
  child = spawn(
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
      env: {
        ...process.env,
        DATABASE_URL: url.href,
        APP_ORIGIN: "http://127.0.0.1:" + port,
        COOKIE_SECURE: "false",
      },
      stdio: "inherit",
    },
  );
  process.on("SIGTERM", stop);
  process.on("SIGINT", stop);
  const [code] = await once(child, "exit");
  if (code) process.exitCode = Number(code);
} finally {
  process.removeListener("SIGTERM", stop);
  process.removeListener("SIGINT", stop);
  if (created) {
    await owner`select pg_terminate_backend(pid) from pg_stat_activity where usename=${role} and pid<>pg_backend_pid()`;
    await owner.unsafe(`drop role ${role}`);
  }
  await owner.end();
}
