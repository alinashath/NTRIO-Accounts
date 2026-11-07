import type { NextFunction, Request, Response } from "express";
import { dataOwnerForOrganization, ORG_HEADER } from "../lib/organization.js";
import { prisma } from "../lib/prisma.js";
import { createServiceRoleSupabase } from "../lib/supabaseService.js";
import { verifyAccessToken } from "../mcp/crypto.js";

export type AuthKind = "supabase" | "mcp";

export type AuthedRequest = Request & {
  userId: string;
  userEmail: string | null;
  authKind?: AuthKind;
  mcpUserId?: string;
};

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

  // MCP access tokens (HS256 JWT with typ=mcp_access) — used by MCP tools via in-process API dispatch.
  try {
    const claims = await verifyAccessToken(token);
    if (claims.typ === "mcp_access") {
      const mcpUser = await prisma.mcpUser.findUnique({
        where: { id: claims.sub },
        select: { id: true, organizationId: true, disabled: true },
      });
      if (!mcpUser || mcpUser.disabled) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      if (mcpUser.organizationId !== claims.org_id) {
        res.status(401).json({ error: "Invalid or expired token" });
        return;
      }
      if (!String(claims.scope ?? "").split(/\s+/).includes("org")) {
        res.status(403).json({ error: "Insufficient scope" });
        return;
      }

      const dataOwnerId = await dataOwnerForOrganization(mcpUser.organizationId);
      const authed = req as AuthedRequest;
      authed.userId = dataOwnerId;
      authed.userEmail = null;
      authed.authKind = "mcp";
      authed.mcpUserId = mcpUser.id;
      // Bind org scope for scopeOrganizationData / readPreferredOrgId
      req.headers[ORG_HEADER] = mcpUser.organizationId;
      next();
      return;
    }
  } catch {
    // Not an MCP token — fall through to Supabase
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

  // Avoid a write on every request — only create / update when needed.
  const existing = await prisma.user.findUnique({
    where: { id: user.id },
    select: { id: true, email: true },
  });
  const nextEmail = user.email ?? null;
  if (!existing) {
    await prisma.user.create({
      data: { id: user.id, email: nextEmail },
    });
  } else if (existing.email !== nextEmail) {
    await prisma.user.update({
      where: { id: user.id },
      data: { email: nextEmail },
    });
  }

  // Do not touch `user_settings` here: that table is created in a later migration.
  // If it is missing, upserting here would 500 every authed route. `/api/settings`
  // upserts the row when the user opens settings; reports use a default FX rate when absent.

  const authed = req as AuthedRequest;
  authed.userId = user.id;
  authed.userEmail = user.email ?? null;
  authed.authKind = "supabase";
  next();
}

/** Block MCP tokens from managing MCP credentials / org admin surfaces. */
export function requireSupabaseAuth(req: Request, res: Response, next: NextFunction) {
  void requireAuth(req, res, (err?: unknown) => {
    if (err) {
      next(err);
      return;
    }
    if ((req as AuthedRequest).authKind === "mcp") {
      res.status(403).json({ error: "MCP tokens cannot manage credentials" });
      return;
    }
    next();
  });
}
