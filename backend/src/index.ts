import "dotenv/config";
import express from "express";
import cors from "cors";
import { buildFabricGateway } from "./fabric/gateway.js";
import { batchRoutes } from "./routes/batch.js";
import { refdataRoutes } from "./routes/refdata.js";
import { aiRoutes } from "./routes/ai.js";
import { auditMiddleware } from "./audit/middleware.js";
import { errorHandler } from "./errors/handler.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(cors({ origin: process.env.ALLOWED_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json());
app.use(auditMiddleware);

app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

const gateway = await buildFabricGateway();

app.use("/api/batch", batchRoutes(gateway));
app.use("/api/refdata", refdataRoutes(gateway));
app.use("/api/ai", aiRoutes(gateway));

app.use(errorHandler);

app.listen(port, () => {
  console.log(`HALCHECK backend listening on :${port}`);
});
