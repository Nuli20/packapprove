import { randomBytes, createHmac } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
mkdirSync(".data", { recursive: true });
if (!existsSync(".data/compose.env")) {
  if (existsSync(".env.local"))
    throw Error(
      "Existing .env.local: preserve it; configure compose credentials manually or use your existing Supabase.",
    );
  const secret = randomBytes(48).toString("hex");
  const jwt = (role) => {
    const header = Buffer.from(
      JSON.stringify({ alg: "HS256", typ: "JWT" }),
    ).toString("base64url");
    const payload = Buffer.from(
      JSON.stringify({
        role,
        iss: "supabase",
        iat: Math.floor(Date.now() / 1000),
        exp: Math.floor(Date.now() / 1000) + 315360000,
      }),
    ).toString("base64url");
    const data = header + "." + payload;
    return (
      data + "." + createHmac("sha256", secret).update(data).digest("base64url")
    );
  };
  const anon = jwt("anon"),
    service = jwt("service_role");
  writeFileSync(
    ".data/compose.env",
    `LOCAL_JWT_SECRET=${secret}\nLOCAL_ANON_KEY=${anon}\nLOCAL_SERVICE_KEY=${service}\n`,
    { mode: 0o600, flag: "wx" },
  );
  writeFileSync(
    ".env.local",
    `SUPABASE_URL=http://127.0.0.1:54321\nSUPABASE_ANON_KEY=${anon}\nSUPABASE_SERVICE_ROLE_KEY=${service}\nDATABASE_URL=postgresql://postgres:postgres@127.0.0.1:54322/postgres\nNEXT_PUBLIC_DEMO_MODE=true\nCOOKIE_SECURE=false\n`,
    { mode: 0o600, flag: "wx" },
  );
  console.log("Generated private local Supabase keys; values redacted.");
}
