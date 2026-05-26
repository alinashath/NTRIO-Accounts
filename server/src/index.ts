import "dotenv/config";
import cors from "cors";
import express, { type NextFunction, type Request, type Response } from "express";
import { Prisma } from "@prisma/client";
import { ZodError } from "zod";
import { accountsRouter } from "./routes/accounts.js";
import { categoriesRouter } from "./routes/categories.js";
import { contactsRouter } from "./routes/contacts.js";
import { debtsRouter } from "./routes/debts.js";
import { expensesRouter } from "./routes/expenses.js";
import { incomeRouter } from "./routes/income.js";
import { reportsRouter } from "./routes/reports.js";
import { settingsRouter } from "./routes/settings.js";
import { notFound } from "./utils/http.js";

const app = express();
const port = Number(process.env.PORT ?? 3001);

app.use(
  cors({
    origin: process.env.CLIENT_ORIGIN?.split(",") ?? true,
    credentials: true,
  }),
);
app.use(express.json({ limit: "2mb" }));

app.get("/api/health", (_req, res) => {
  res.json({ ok: true });
});

app.use("/api/accounts", accountsRouter);
app.use("/api/income", incomeRouter);
app.use("/api/expenses", expensesRouter);
app.use("/api/categories", categoriesRouter);
app.use("/api/contacts", contactsRouter);
app.use("/api/debts", debtsRouter);
app.use("/api/reports", reportsRouter);
app.use("/api/settings", settingsRouter);

app.use(notFound);

const SCHEMA_DRIFT_HINT =
  "Apply the latest SQL migrations (repo root): npm run db:deploy -w server — use DIRECT_URL to the Supabase direct host (db.*.supabase.co), not only the pooler, if deploy fails.";

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof ZodError) {
    res.status(400).json({ error: "Validation failed", details: err.flatten() });
    return;
  }

  if (err instanceof Prisma.PrismaClientKnownRequestError) {
    const code = err.code;
    // P2022 column missing, P2021 table missing, P2010 raw query failed (often missing column in SQL)
    if (code === "P2022" || code === "P2021" || code === "P2010") {
      console.error("[schema drift?]", code, err.message);
      res.status(503).json({
        error: "Database schema does not match this API version.",
        hint: SCHEMA_DRIFT_HINT,
        prisma_code: code,
      });
      return;
    }
  }

  if (err instanceof Prisma.PrismaClientInitializationError) {
    console.error(err);
    res.status(503).json({
      error: "Could not connect to the database.",
      hint: "Check DATABASE_URL / DIRECT_URL in server/.env and that the Supabase project is running.",
    });
    return;
  }

  console.error(err);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(port, () => {
  console.log(`API listening on http://localhost:${port}`);
});
