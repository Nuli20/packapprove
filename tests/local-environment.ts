import { readFileSync } from "node:fs";
export function localTestEnvironment() {
  const values: Record<string, string> = {};
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) values[m[1]] = m[2];
  }
  for (const [key, port] of [
    ["DATABASE_URL", "54322"],
    ["SUPABASE_URL", "54321"],
  ]) {
    for (const value of [process.env[key], values[key]].filter(Boolean)) {
      const u = new URL(value!);
      if (!["localhost", "127.0.0.1"].includes(u.hostname) || u.port !== port)
        throw Error(
          "Tests refuse non-local services; use isolated local demo environment.",
        );
    }
    if (!values[key]) throw Error("Local test configuration is missing.");
  }
  if (values.NEXT_PUBLIC_DEMO_MODE !== "true")
    throw Error("Tests require isolated demo mode.");
  return values;
}
