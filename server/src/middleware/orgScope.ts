import type { NextFunction, Request, Response } from "express";
import { OrgAccessError, readPreferredOrgId, resolveOrganizationDataUserId } from "../lib/organization.js";
import type { AuthedRequest } from "./auth.js";

/** Point ledger queries at the active organization's books. */
export async function scopeOrganizationData(req: Request, res: Response, next: NextFunction) {
  try {
    const authed = req as AuthedRequest;
    authed.userId = await resolveOrganizationDataUserId(authed.userId, readPreferredOrgId(req));
    next();
  } catch (e) {
    if (e instanceof OrgAccessError) {
      res.status(e.status).json({ error: e.message });
      return;
    }
    next(e);
  }
}
