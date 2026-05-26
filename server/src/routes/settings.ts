import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createServiceRoleSupabase } from "../lib/supabaseService.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

export const settingsRouter = Router();
settingsRouter.use(requireAuth);

/** Comma-separated emails; if set, only these sign-ins may list/create app users from Settings. */
function canManageUsers(actorEmail: string | null): boolean {
  const raw = process.env.SETTINGS_USER_ADMIN_EMAILS?.trim();
  if (!raw) return true;
  const allowed = raw
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  if (!allowed.length) return true;
  if (!actorEmail) return false;
  return allowed.includes(actorEmail.trim().toLowerCase());
}

function serviceSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server missing Supabase configuration");
  }
  return createServiceRoleSupabase(url, serviceKey);
}

settingsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const row = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    res.json({
      global_usd_mvr_rate: Number(row.globalUsdMvrRate),
    });
  }),
);

const patchSchema = z.object({
  global_usd_mvr_rate: z.number().positive().max(1_000_000),
});

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = patchSchema.parse(req.body);
    const row = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, globalUsdMvrRate: body.global_usd_mvr_rate },
      update: { globalUsdMvrRate: body.global_usd_mvr_rate },
    });
    res.json({
      global_usd_mvr_rate: Number(row.globalUsdMvrRate),
    });
  }),
);

settingsRouter.get(
  "/users",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!canManageUsers(authed.userEmail)) {
      res.status(403).json({ error: "Not allowed to manage users" });
      return;
    }
    const rows = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, createdAt: true },
    });
    res.json(
      rows.map((u) => ({
        id: u.id,
        email: u.email,
        created_at: u.createdAt.toISOString(),
      })),
    );
  }),
);

const createUserSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
});

settingsRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!canManageUsers(authed.userEmail)) {
      res.status(403).json({ error: "Not allowed to manage users" });
      return;
    }
    const body = createUserSchema.parse(req.body);
    const supabase = serviceSupabase();

    const { data, error } = await supabase.auth.admin.createUser({
      email: body.email,
      password: body.password,
      email_confirm: true,
    });

    if (error) {
      const msg = error.message ?? "Could not create user";
      const lower = msg.toLowerCase();
      if (lower.includes("already been registered") || lower.includes("already exists")) {
        res.status(409).json({ error: msg });
        return;
      }
      res.status(400).json({ error: msg });
      return;
    }

    if (!data.user) {
      res.status(500).json({ error: "Auth did not return a user" });
      return;
    }

    await prisma.user.upsert({
      where: { id: data.user.id },
      create: {
        id: data.user.id,
        email: data.user.email ?? body.email,
      },
      update: { email: data.user.email ?? body.email },
    });

    res.status(201).json({
      id: data.user.id,
      email: data.user.email ?? body.email,
    });
  }),
);
