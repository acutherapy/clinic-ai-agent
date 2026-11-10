/**
 * Auth-aware fetch wrapper for internal API-to-API calls.
 *
 * Injects X-Emma-Api-Key when INTERNAL_API_KEY is configured in the environment.
 * When INTERNAL_API_KEY is not set, behaves identically to global fetch — zero
 * behavior change during the pre-enforcement deployment window.
 *
 * Key is read from env at call time (not module load time) so that tests can
 * set/unset process.env.INTERNAL_API_KEY between test cases.
 *
 * Never expose this key in logs, responses, or client-visible headers.
 */

export async function internalFetch(
  url: string | URL,
  options: RequestInit = {}
): Promise<Response> {
  const apiKey = process.env.INTERNAL_API_KEY;
  if (!apiKey) {
    return fetch(url, options);
  }

  const existing = new Headers(options.headers as HeadersInit | undefined);
  existing.set("X-Emma-Api-Key", apiKey);

  return fetch(url, { ...options, headers: existing });
}
