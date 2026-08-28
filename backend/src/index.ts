import "dotenv/config";
import cors from "cors";
import express from "express";
import { authRoutes } from "./routes/auth.js";
import { batchRoutes } from "./routes/batch.js";
import { refdataRoutes } from "./routes/refdata.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

app.use("/api/v1/auth", authRoutes);
app.use("/api/v1/batches", batchRoutes);
app.use("/api/v1/reference-data", refdataRoutes);

// TODO (docs/13_implementation_plan.md P4): verdict route (needs Core
// Screening App engine integration), ai routes, bulk ingredient upload,
// GET /batches + GET /batches/:batchId/trail (need a read/query mechanism
// -- batch chaincode has no read functions by design), Integrity Sandbox
// endpoints, audit-log viewer endpoint.

app.listen(port, () => {
  console.log(`HALCHECK backend listening on :${port}`);
});
