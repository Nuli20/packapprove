import type {
  FullResult,
  Reporter,
  TestCase,
  TestResult,
  TestError,
} from "@playwright/test/reporter";
import { mkdirSync, writeFileSync } from "node:fs";
import { relative } from "node:path";
import { failureKind, safeTimings } from "./safe-diagnostics";

/** CI-only reporter. Rich local traces remain available locally, never in public artifacts. */
export default class SafeReporter implements Reporter {
  private tests: object[] = [];
  private fatal: string[] = [];
  onTestEnd(test: TestCase, result: TestResult) {
    const file = relative(process.cwd(), test.location.file).replaceAll(
      "\\",
      "/",
    );
    const location = /^tests\/e2e\/[a-z0-9/-]+\.spec\.ts$/.test(file)
      ? `${file}:${test.location.line}`
      : "test";
    const projectName = test.parent.project()?.name;
    const project =
      projectName === "desktop" || projectName === "mobile"
        ? projectName
        : "other";
    const attachment = result.attachments.find(
      (a) =>
        a.name === "safe-api-timings" && a.contentType === "application/json",
    );
    let timings;
    try {
      if (attachment?.body)
        timings = safeTimings(JSON.parse(attachment.body.toString()));
    } catch {
      /* untrusted attachment omitted */
    }
    const errors = result.errors.map((e) => failureKind(e.message || ""));
    this.tests.push({
      location,
      project,
      status: result.status,
      durationMs: result.duration,
      repeat: test.repeatEachIndex,
      retry: result.retry,
      errors,
      ...(timings ? { timings } : {}),
    });
    console.log(
      `[e2e] ${project} ${location} ${result.status} ${result.duration}ms${errors.length ? " " + errors.join(",") : ""}`,
    );
  }
  onError(error: TestError) {
    this.fatal.push(failureKind(error.message || ""));
  }
  onEnd(result: FullResult) {
    mkdirSync(".data/ci-diagnostics", { recursive: true });
    const run = /^\d{1,2}$/.test(process.env.PACKAPPROVE_E2E_RUN || "")
      ? process.env.PACKAPPROVE_E2E_RUN
      : "1";
    writeFileSync(
      `.data/ci-diagnostics/e2e-${run}.json`,
      JSON.stringify(
        {
          status: result.status,
          durationMs: result.duration,
          tests: this.tests,
          fatal: this.fatal,
        },
        null,
        2,
      ),
    );
    console.log(
      `[e2e] run ${run}: ${result.status}; ${this.tests.length} results; diagnostics contain no request data`,
    );
  }
}
