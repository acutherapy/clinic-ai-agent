/**
 * Test runner — Phase 3B (clinic-ai-agent development branch)
 *
 * No production service calls. No Google Calendar. No Supabase. No RingCentral.
 *
 * Run: npm test
 *   or: npx tsx --tsconfig tsconfig.json test/run-all.ts
 */

import { runTests as runAuth }             from "./test-auth.js";
import { runTests as runInternalFetch }    from "./test-internal-fetch.js";
import { runTests as runStructuredSlots }  from "./test-structured-slots.js";
import { runTests as runIdempotency }      from "./test-idempotency.js";
import { runTests as runApptSelection }    from "./test-appointment-selection.js";
import { runTests as runBookingSafety }    from "./test-booking-safety.js";
import { runTests as runPolicyRegression } from "./test-policy-regression.js";
// Stage B — comprehensive regression
import { runTests as runPackages }         from "./test-packages.js";
import { runTests as runSmsFlow }          from "./test-sms-webhook-flow.js";
import { runTests as runVoiceApiCompat }   from "./test-voice-api-compatibility.js";

async function main() {
  console.log("=".repeat(60));
  console.log("  clinic-ai-agent — Comprehensive Regression Suite (Stage B)");
  console.log("  Branch: test/emma-comprehensive-regression");
  console.log("=".repeat(60));

  const suites = [
    { name: "auth",                  fn: runAuth },
    { name: "internal-fetch",        fn: runInternalFetch },
    { name: "structured-slots",      fn: runStructuredSlots },
    { name: "idempotency",           fn: runIdempotency },
    { name: "appointment-selection", fn: runApptSelection },
    { name: "booking-safety",        fn: runBookingSafety },
    { name: "policy-regression",     fn: runPolicyRegression },
    // Stage B — comprehensive regression
    { name: "packages",              fn: runPackages },
    { name: "sms-webhook-flow",      fn: runSmsFlow },
    { name: "voice-api-compat",      fn: runVoiceApiCompat },
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
