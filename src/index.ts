import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import todosRouter from "./routes/todos.js";

dotenv.config();

const app = express();

const origins = (process.env.CORS_ORIGIN ?? "http://localhost:5173")
  .split(",")
  .map(o => o.trim());
app.use(cors({ origin: origins, credentials: true }));
app.use(express.json());

app.get("/", (_req, res) => {
  res.json({ ok: true, message: "todo-app-backend is up" });
});

// DoD(1): Healthcheck
app.get("/api/health", (_req, res) => {
  res.status(200).json({ status: "ok" });
});

app.use("/api/todos", todosRouter);

const PORT = Number(process.env.PORT ?? 8080);
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});