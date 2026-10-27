// Deliberately allowlist output. Never serialize Error, request/response, test attachment paths,
// headers, raw messages or URLs: those may contain recovery/invitation credentials.
const phases = new Set([
  "auth.login",
  "auth.refresh",
  "auth.recovery.callback",
  "auth.recovery.password",
  "invitation.create",
  "invitation.accept",
  "organization.create",
  "project.create",
  "version.create",
  "version.submit",
  "review.complete",
  "round.open",
  "decision.create",
  "comment.create",
  "package.issue",
  "package.revoke",
  "package.download",
  "package.ack",
  "state.home",
  "state.setup",
  "state.project",
  "state.artwork",
]);
export function failureKind(message: string) {
  if (/Test timeout.*exceeded/i.test(message)) return "TEST_TIMEOUT";
  if (/toBeHidden/.test(message)) return "ELEMENT_NOT_HIDDEN";
  if (/toBeVisible/.test(message)) return "ELEMENT_NOT_VISIBLE";
  if (/Timeout.*exceeded|timed out/i.test(message)) return "OPERATION_TIMEOUT";
  if (/expect\(/.test(message)) return "ASSERTION_FAILED";
  return "TEST_ERROR";
}
const duration = (v: unknown) =>
  typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0;
export function safeTimings(input: unknown) {
  const data = input as { durationMs?: unknown; requests?: unknown } | null;
  return {
    durationMs: duration(data?.durationMs),
    requests: (Array.isArray(data?.requests) ? data.requests : []).flatMap(
      (entry) => {
        if (!entry || typeof entry !== "object" || !phases.has(entry.phase))
          return [];
        return [
          {
            phase: entry.phase as string,
            status:
              Number.isInteger(entry.status) &&
              entry.status >= 0 &&
              entry.status <= 599
                ? (entry.status as number)
                : 0,
            ms: duration(entry.ms),
          },
        ];
      },
    ),
  };
}
