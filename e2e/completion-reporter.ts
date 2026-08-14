import type { FullResult, Reporter } from "@playwright/test/reporter";

export default class CompletionReporter implements Reporter {
  onEnd(result: FullResult) {
    // postgres.js can leave an idle handle in Playwright's Windows worker after all
    // contexts and tests are complete. Exit only after Playwright has produced its
    // authoritative final result; the parent runner then tears down its Next process.
    setTimeout(() => process.exit(result.status === "passed" ? 0 : 1), 100);
  }
}
