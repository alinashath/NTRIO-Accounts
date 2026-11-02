import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { attachUserToOrganization, setOrganizationModules } from "../lib/organization.js";
import { getSystemAdminEmail, isSystemAdminEmail } from "../lib/systemAdmin.js";
import { ALL_WORKSPACE_MODULES, normalizeEnabledModules, parseModulesInput } from "../lib/workspaces.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { asyncHandler } from "../utils/http.js";

export const adminRouter = Router();
adminRouter.use(requireAuth);

function requireSystemAdmin(req: AuthedRequest, res: { status: (n: number) => { json: (b: unknown) => void } }) {
  if (!isSystemAdminEmail(req.userEmail)) {
    res.status(403).json({
      error: "System admin only",
      hint: `Dedicated admin area for ${getSystemAdminEmail()}`,
    });
    return false;
  }
  return true;
}

adminRouter.get(
  "/me",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    res.json({
      is_system_admin: isSystemAdminEmail(authed.userEmail),
      system_admin_email: getSystemAdminEmail(),
    });
  }),
);

adminRouter.get(
  "/org-requests",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!requireSystemAdmin(authed, res)) return;

    const status = typeof req.query.status === "string" ? req.query.status : "pending";
    const where =
      status === "all"
        ? {}
        : status === "approved" || status === "rejected" || status === "pending"
          ? { status: status as "pending" | "approved" | "rejected" }
          : { status: "pending" as const };

    const rows = await prisma.organizationSetupRequest.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: 100,
    });

    res.json(
      rows.map((r) => ({
        id: r.id,
        requester_user_id: r.requesterUserId,
        requester_email: r.requesterEmail,
        organization_title: r.organizationTitle,
        contact_name: r.contactName,
        status: r.status,
        rejection_reason: r.rejectionReason,
        reviewed_by_email: r.reviewedByEmail,
        reviewed_at: r.reviewedAt?.toISOString() ?? null,
        created_organization_id: r.createdOrganizationId,
        created_at: r.createdAt.toISOString(),
      })),
    );
  }),
);

adminRouter.post(
  "/org-requests/:id/approve",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!requireSystemAdmin(authed, res)) return;

    const id = String(req.params.id ?? "");
    const row = await prisma.organizationSetupRequest.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: `Request is already ${row.status}` });
      return;
    }

    const org = await prisma.organization.create({
      data: { title: row.organizationTitle },
    });

    await attachUserToOrganization(row.requesterUserId, row.requesterEmail, org);

    const updated = await prisma.organizationSetupRequest.update({
      where: { id },
      data: {
        status: "approved",
        reviewedAt: new Date(),
        reviewedByEmail: authed.userEmail,
        createdOrganizationId: org.id,
        rejectionReason: null,
      },
    });

    res.json({
      id: updated.id,
      status: updated.status,
      organization_id: org.id,
      organization_title: org.title,
      requester_email: row.requesterEmail,
    });
  }),
);

const rejectSchema = z.object({
  reason: z.string().trim().max(500).optional(),
});

adminRouter.post(
  "/org-requests/:id/reject",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!requireSystemAdmin(authed, res)) return;

    const id = String(req.params.id ?? "");
    const body = rejectSchema.parse(req.body ?? {});
    const row = await prisma.organizationSetupRequest.findUnique({ where: { id } });
    if (!row) {
      res.status(404).json({ error: "Request not found" });
      return;
    }
    if (row.status !== "pending") {
      res.status(409).json({ error: `Request is already ${row.status}` });
      return;
    }

    const updated = await prisma.organizationSetupRequest.update({
      where: { id },
      data: {
        status: "rejected",
        reviewedAt: new Date(),
        reviewedByEmail: authed.userEmail,
        rejectionReason: body.reason?.trim() || "Rejected by system admin",
      },
    });

    res.json({
      id: updated.id,
      status: updated.status,
      rejection_reason: updated.rejectionReason,
    });
  }),
);

adminRouter.get(
  "/organizations",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!requireSystemAdmin(authed, res)) return;

    const rows = await prisma.organization.findMany({
      orderBy: { title: "asc" },
      select: {
        id: true,
        title: true,
        enabledModules: true,
        createdAt: true,
        members: {
          select: { user: { select: { email: true } } },
          orderBy: { createdAt: "asc" },
          take: 8,
        },
        _count: { select: { members: true } },
      },
    });

    res.json({
      modules: [...ALL_WORKSPACE_MODULES],
      organizations: rows.map((o) => ({
        id: o.id,
        title: o.title,
        enabled_modules: normalizeEnabledModules(o.enabledModules),
        member_count: o._count.members,
        member_emails: o.members.map((m) => m.user.email).filter(Boolean),
        created_at: o.createdAt.toISOString(),
      })),
    });
  }),
);

const modulesSchema = z.object({
  enabled_modules: z.array(z.string()),
});

adminRouter.patch(
  "/organizations/:id/modules",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!requireSystemAdmin(authed, res)) return;

    const id = String(req.params.id ?? "");
    const body = modulesSchema.parse(req.body ?? {});
    let modules;
    try {
      modules = parseModulesInput(body.enabled_modules);
    } catch (e) {
      const status = (e as { status?: number }).status ?? 400;
      res.status(status).json({ error: e instanceof Error ? e.message : "Invalid modules" });
      return;
    }

    const existing = await prisma.organization.findUnique({ where: { id }, select: { id: true } });
    if (!existing) {
      res.status(404).json({ error: "Organization not found" });
      return;
    }

    const org = await setOrganizationModules(id, modules);
    res.json({
      id: org.id,
      title: org.title,
      enabled_modules: org.enabledModules,
    });
  }),
);
