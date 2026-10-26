import { describe, it, expect } from "vitest";
import {
  isolatedDemoEnabled,
  DEMO_ROLES,
  demoEmail,
} from "../lib/demo-environment";
import { demoSession } from "../lib/demo-session";
const env = {
  NEXT_PUBLIC_DEMO_MODE: "true",
  DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:54322/postgres",
  SUPABASE_URL: "http://127.0.0.1:54321",
};
describe("Demo entry cannot enable a cloud production session", () => {
  it("requires the separate local Supabase endpoints as well as an explicit flag", () => {
    expect(isolatedDemoEnabled(env)).toBe(true);
    expect(DEMO_ROLES).toHaveLength(6);
    expect(demoEmail("approver")).toBe("can-approver@packapprove.local");
  });
  it.each([
    { NEXT_PUBLIC_DEMO_MODE: "false" },
    {
      DATABASE_URL:
        "postgresql://fixture:fixture@production.example:5432/postgres",
    },
    { SUPABASE_URL: "https://production.supabase.co" },
    { DATABASE_URL: "postgresql://fixture:fixture@localhost:54322/production" },
    { DATABASE_URL: "" },
    { SUPABASE_URL: "http://localhost:9999" },
  ])("refuses mismatched deployment %o", (change) =>
    expect(isolatedDemoEnabled({ ...env, ...change })).toBe(false),
  );
  it("rejects a demo session before contacting Auth when disabled", async () => {
    const before = process.env.NEXT_PUBLIC_DEMO_MODE;
    process.env.NEXT_PUBLIC_DEMO_MODE = "false";
    try {
      await expect(demoSession({ role: "admin" })).rejects.toMatchObject({
        status: 404,
      });
    } finally {
      process.env.NEXT_PUBLIC_DEMO_MODE = before;
    }
  });
});
