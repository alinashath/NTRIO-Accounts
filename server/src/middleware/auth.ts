import type { NextFunction, Request, Response } from "express";
import { prisma } from "../lib/prisma.js";
import { createServiceRoleSupabase } from "../lib/supabaseService.js";

export type AuthedRequest = Request & { userId: string; userEmail: string | null };

export async function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization;
  const token =
    typeof header === "string" && header.startsWith("Bearer ")
      ? header.slice(7)
      : null;

  if (!token) {
    res.status(401).json({ error: "Missing bearer token" });
    return;
  }

  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    res.status(500).json({ error: "Server missing Supabase configuration" });
    return;
  }

  const supabase = createServiceRoleSupabase(url, serviceKey);

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser(token);

  if (error || !user) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  await prisma.user.upsert({
    where: { id: user.id },
    create: { id: user.id, email: user.email ?? null },
    update: { email: user.email ?? null },
  });

  // Do not touch `user_settings` here: that table is created in a later migration.
  // If it is missing, upserting here would 500 every authed route. `/api/settings`
  // upserts the row when the user opens settings; reports use a default FX rate when absent.

  (req as AuthedRequest).userId = user.id;
  (req as AuthedRequest).userEmail = user.email ?? null;
  next();
}
