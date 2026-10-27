import { describe, it, expect } from "vitest";
import { safeTimings, failureKind } from "./e2e/support/safe-diagnostics";

describe("public CI diagnostic boundary", () => {
  it("only emits allowlisted phase/status/time, even for credential-bearing input", () => {
    const secret = "test-secret-that-must-not-appear";
    const report = safeTimings({
      durationMs: 100,
      token: secret,
      requests: [
        {
          phase: "decision.create",
          status: 409,
          ms: 25,
          cookie: secret,
          url: "/invite#token=" + secret,
        },
        {
          phase: "/api/auth/callback?token_hash=" + secret,
          status: 200,
          ms: 4,
        },
        { phase: secret, status: 500, ms: 9 },
        null,
      ],
    });
    expect(report).toEqual({
      durationMs: 100,
      requests: [{ phase: "decision.create", status: 409, ms: 25 }],
    });
    expect(JSON.stringify(report)).not.toContain(secret);
  });
  it("classifies failures without reproducing messages or one-use URLs", () => {
    expect(
      failureKind("Test timeout of 60000ms exceeded. /?token=secret"),
    ).toBe("TEST_TIMEOUT");
    expect(failureKind("expect(locator).toBeHidden() failed secret")).toBe(
      "ELEMENT_NOT_HIDDEN",
    );
    expect(failureKind("request.post: Timeout 15000ms exceeded secret")).toBe(
      "OPERATION_TIMEOUT",
    );
    expect(failureKind("secret")).toBe("TEST_ERROR");
  });
  it("rejects non-finite timing values and invalid status codes", () => {
    expect(
      safeTimings({
        durationMs: Infinity,
        requests: [{ phase: "decision.create", status: 1000, ms: NaN }],
      }),
    ).toEqual({
      durationMs: 0,
      requests: [{ phase: "decision.create", status: 0, ms: 0 }],
    });
    expect(safeTimings(null)).toEqual({ durationMs: 0, requests: [] });
  });
});
