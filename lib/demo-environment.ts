// Only the separately provisioned local Supabase fixture can expose demo entry.
// A UI flag alone can never turn the cloud production database into a demo.
export function isolatedDemoEnabled(
  env: Record<string, string | undefined> = process.env,
) {
  if (env.NEXT_PUBLIC_DEMO_MODE !== "true") return false;
  try {
    const db = new URL(env.DATABASE_URL || ""),
      supa = new URL(env.SUPABASE_URL || "");
    return (
      ["postgres:", "postgresql:"].includes(db.protocol) &&
      ["127.0.0.1", "localhost"].includes(db.hostname) &&
      db.port === "54322" &&
      db.pathname === "/postgres" &&
      supa.protocol === "http:" &&
      ["127.0.0.1", "localhost"].includes(supa.hostname) &&
      supa.port === "54321"
    );
  } catch {
    return false;
  }
}
export const DEMO_ROLES = [
  "admin",
  "manager",
  "designer",
  "prepress",
  "approver",
  "production",
] as const;
export type DemoRole = (typeof DEMO_ROLES)[number];
export const demoEmail = (role: DemoRole) =>
  (role === "approver" ? "can-approver" : role) + "@packapprove.local";
