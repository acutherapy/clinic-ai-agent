/**
 * Shared test helpers — Phase 3B.
 * No production service calls. No Google Calendar. No Supabase. No RingCentral.
 */

import assert from "assert";

export type TestResult = { pass: boolean; name: string; error?: string };

export function ok(name: string, fn: () => void | Promise<void>): Promise<TestResult> {
  const result = (() => {
    try {
      const r = fn();
      if (r && typeof (r as any).then === "function") {
        return (r as Promise<void>)
          .then(() => ({ pass: true, name } as TestResult))
          .catch((err: any) => ({ pass: false, name, error: err.message } as TestResult));
      }
      return Promise.resolve({ pass: true, name } as TestResult);
    } catch (err: any) {
      return Promise.resolve({ pass: false, name, error: err.message } as TestResult);
    }
  })();
  return result;
}

export function report(file: string, results: TestResult[]): { passed: number; failed: number; failures: string[] } {
  const passed   = results.filter(r => r.pass).length;
  const failed   = results.filter(r => !r.pass).length;
  const failures = results.filter(r => !r.pass).map(r => `${r.name}: ${r.error}`);
  console.log(`[${file}] ${passed} passed, ${failed} failed`);
  for (const f of failures) console.log(`  ✗ ${f}`);
  return { passed, failed, failures };
}

export { assert };
