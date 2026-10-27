import { describe, it, expect } from "vitest";
import { authorizeCommand } from "../lib/commands/permissions";
import type { Command } from "../lib/service";
describe("Command authorization precedes idempotency replay", () => {
  it("does not replay privileged staff invitation after role downgrade", () => {
    const command: Command = {
      action: "invitation.create",
      payload: { role: "designer" },
    };
    expect(() =>
      authorizeCommand({ id: "same-user", role: "admin" }, command),
    ).not.toThrow();
    for (const role of ["manager", "designer", "approver", "observer"])
      expect(() =>
        authorizeCommand({ id: "same-user", role }, command),
      ).toThrow();
  });
  it("never grants admin the client decision or designer action", () => {
    for (const action of [
      "decision.create",
      "version.create",
      "version.submit",
    ] as const)
      expect(() =>
        authorizeCommand(
          { id: "admin", role: "admin" },
          { action, payload: {} },
        ),
      ).toThrow();
  });
});
