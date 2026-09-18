import "dotenv/config";
import cors from "cors";
import express from "express";
import { auditRoutes } from "./routes/audit.js";
import { authRoutes } from "./routes/auth.js";
import { batchRoutes } from "./routes/batch.js";
import { parseAllowedOrigins } from "./http/cors.js";
import { refdataRoutes } from "./routes/refdata.js";
import { sandboxRoutes } from "./routes/sandbox.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: parseAllowedOrigins(process.env.ALLOWED_ORIGIN) }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/batches", batchRoutes);
app.use("/api/v1/reference-data", refdataRoutes);
app.use("/api/v1/sandbox", sandboxRoutes);
app.use("/api/v1/audit-log", auditRoutes);

// Express 4 does not forward async rejections, so every chaincode route
// translates its own errors (routes/helpers.ts). This catches anything
// thrown synchronously by the remaining routes, so a single bad request
// returns 500 instead of ending the process.
app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("[unhandled route error]", err);
  res.status(500).json({ reason: "internal_error", message: "request could not be completed" });
});

// Last-resort guard for the same reason: while the demo link is live, one
// failed request must never take the backend down. Logged loudly, never
// swallowed silently.
process.on("unhandledRejection", (reason) => {
  console.error("[unhandledRejection]", reason);
});

app.listen(port, () => {
  console.log(`HALCHECK backend listening on :${port}`);
});
