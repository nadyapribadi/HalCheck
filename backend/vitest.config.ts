import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./test/setup.ts"],
    // Tests hit the real local Postgres and Fabric network (this
    // project's established "prove it live" philosophy, docs/07 §2) --
    // sequential, not parallel, since several exercise the same
    // contested ledger/DB state.
    fileParallelism: false,
    // idempotency/index.ts's polling fallback can legitimately run for up
    // to SDK_TIMEOUT_MS (default 10s) when a placeholder is genuinely
    // orphaned -- the default 5s test timeout collides with that almost
    // exactly, failing a correctly-behaving test on timing alone.
    testTimeout: 15000,
  },
});
