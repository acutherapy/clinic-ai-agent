/**
 * Test runner — Phase 3B (clinic-ai-agent development branch)
 *
 * No production service calls. No Google Calendar. No Supabase. No RingCentral.
 *
 * Run: npm test
 *   or: npx tsx --tsconfig tsconfig.json test/run-all.ts
 */

import { runTests as runAuth }           from "./test-auth.js";
import { runTests as runInternalFetch }  from "./test-internal-fetch.js";
import { runTests as runStructuredSlots } from "./test-structured-slots.js";
import { runTests as runIdempotency }    from "./test-idempotency.js";
import { runTests as runApptSelection }  from "./test-appointment-selection.js";
import { runTests as runBookingSafety }  from "./test-booking-safety.js";

async function main() {
  console.log("=".repeat(60));
  console.log("  clinic-ai-agent — Phase 3B Test Suite");
  console.log("  Branch: feature/voice-emma-integration");
  console.log("=".repeat(60));

  const suites = [
    { name: "auth",                fn: runAuth },
    { name: "internal-fetch",      fn: runInternalFetch },
    { name: "structured-slots",    fn: runStructuredSlots },
    { name: "idempotency",         fn: runIdempotency },
    { name: "appointment-selection", fn: runApptSelection },
    { name: "booking-safety",      fn: runBookingSafety },
  ];

  let totalPassed = 0;
  let totalFailed = 0;
  const allFailures: string[] = [];

  for (const suite of suites) {
    try {
      const result = await suite.fn();
      totalPassed += result.passed;
      totalFailed += result.failed;
      for (const f of result.failures) allFailures.push(`${suite.name}: ${f}`);
    } catch (err: any) {
      console.error(`[RUN ERROR] ${suite.name}: ${err.message}`);
      totalFailed++;
      allFailures.push(`${suite.name}: LOAD/RUN ERROR — ${err.message}`);
    }
  }

  console.log("=".repeat(60));
  console.log(`  PASSED: ${totalPassed}  |  FAILED: ${totalFailed}`);
  if (allFailures.length > 0) {
    console.log("\nFailed tests:");
    for (const f of allFailures) console.log(`  ✗ ${f}`);
  }
  console.log("=".repeat(60));

  process.exit(totalFailed > 0 ? 1 : 0);
}

main().catch(err => {
  console.error("Fatal runner error:", err);
  process.exit(1);
});
