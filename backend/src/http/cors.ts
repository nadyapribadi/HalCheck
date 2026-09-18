// ADR-CT-035. A single ALLOWED_ORIGIN string means whichever origin is set
// wins and every other way of reaching the app is silently broken *in the
// browser only*: with the P9 tunnel URL configured, the documented local
// setup (frontend on :5173, backend on :3001) could not log in at all -- the
// SPA reported "the backend is not reachable" while curl, which does not
// enforce CORS, worked fine.
//
// Blank means unset, deliberately: an `.env` line reading `ALLOWED_ORIGIN=`
// would otherwise produce an empty allow-list, which denies every browser
// origin and reproduces exactly the failure this function exists to prevent.
const DEFAULT_ORIGIN = "http://localhost:5173";

export function parseAllowedOrigins(value: string | undefined): string[] {
  const origins = (value ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter((origin) => origin.length > 0);
  return origins.length > 0 ? origins : [DEFAULT_ORIGIN];
}
