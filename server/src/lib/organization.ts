import type { Request } from "express";
import { prisma } from "./prisma.js";
import { isSystemAdminEmail } from "./systemAdmin.js";
import { normalizeEnabledModules, type WorkspaceModuleId } from "./workspaces.js";

const DEFAULT_TITLE = "NTRIO";
export const ORG_HEADER = "x-organization-id";

export type OrgSummary = { id: string; title: string; enabledModules: WorkspaceModuleId[] };

function toOrgSummary(org: { id: string; title: string; enabledModules?: string[] }): OrgSummary {
  return {
    id: org.id,
    title: org.title,
    enabledModules: normalizeEnabledModules(org.enabledModules),
  };
}

export class OrgAccessError extends Error {
  status = 403;
  code = "ORG_ACCESS_REQUIRED";
  constructor(message = "Organization access required. Wait for admin approval or select an organization.") {
    super(message);
    this.name = "OrgAccessError";
  }
}

/**
 * Ensure memberships exist for legacy users / system admin.
 * Does NOT auto-create orgs for new signups — those go through setup requests.
 */
export async function ensureUserOrganizations(
  userId: string,
  preferredOrgId?: string | null,
  userEmail?: string | null,
): Promise<{
  organizations: OrgSummary[];
  active: OrgSummary | null;
  pendingRequest: {
    id: string;
    organization_title: string;
    status: string;
    created_at: string;
    rejection_reason: string | null;
  } | null;
  isSystemAdmin: boolean;
}> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      organizationId: true,
      settings: { select: { organizationTitle: true } },
      memberships: {
        select: {
          organizationId: true,
          organization: { select: { id: true, title: true, enabledModules: true } },
        },
        orderBy: { createdAt: "asc" },
      },
    },
  });
  if (!user) {
    throw new Error("User not found");
  }

  const email = userEmail ?? user.email;
  const admin = isSystemAdminEmail(email);

  // Legacy: had active org id but no membership row yet
  if (user.organizationId && user.memberships.length === 0) {
    await prisma.organizationMember.create({
      data: { userId, organizationId: user.organizationId },
    });
    const org = toOrgSummary(
      await prisma.organization.findUniqueOrThrow({
        where: { id: user.organizationId },
        select: { id: true, title: true, enabledModules: true },
      }),
    );
    return {
      organizations: [org],
      active: org,
      pendingRequest: null,
      isSystemAdmin: admin,
    };
  }

  // System admin bootstrap: always has a workspace to manage approvals from
  if (user.memberships.length === 0 && admin) {
    const title = user.settings?.organizationTitle?.trim() || "NTRIO Admin";
    const created = await prisma.organization.create({ data: { title } });
    const org = toOrgSummary(created);
    await prisma.organizationMember.create({
      data: { userId, organizationId: org.id },
    });
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });
    await prisma.userSettings.upsert({
      where: { userId },
      create: { userId, organizationTitle: org.title },
      update: { organizationTitle: org.title },
    });
    return {
      organizations: [org],
      active: org,
      pendingRequest: null,
      isSystemAdmin: true,
    };
  }

  const pending = await prisma.organizationSetupRequest.findFirst({
    where: {
      requesterUserId: userId,
      status: { in: ["pending", "rejected"] },
    },
    orderBy: { createdAt: "desc" },
  });

  const pendingRequest = pending
    ? {
        id: pending.id,
        organization_title: pending.organizationTitle,
        status: pending.status,
        created_at: pending.createdAt.toISOString(),
        rejection_reason: pending.rejectionReason,
      }
    : null;

  if (user.memberships.length === 0) {
    return {
      organizations: [],
      active: null,
      pendingRequest,
      isSystemAdmin: admin,
    };
  }

  const organizations = user.memberships.map((m) => toOrgSummary(m.organization));

  const preferred: OrgSummary =
    organizations.find((o) => o.id === preferredOrgId) ??
    organizations.find((o) => o.id === user.organizationId) ??
    organizations[0]!;

  if (user.organizationId !== preferred.id) {
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: preferred.id },
    });
  }

  return {
    organizations,
    active: preferred,
    pendingRequest: null,
    isSystemAdmin: admin,
  };
}

export async function ensureUserOrganization(
  userId: string,
  preferredOrgId?: string | null,
  userEmail?: string | null,
) {
  const { active } = await ensureUserOrganizations(userId, preferredOrgId, userEmail);
  if (!active) {
    throw new OrgAccessError();
  }
  return active;
}

export function readPreferredOrgId(req: Request): string | null {
  const raw = req.headers[ORG_HEADER];
  const v = Array.isArray(raw) ? raw[0] : raw;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

/**
 * Books (accounts, entries, rooms, stock, FX) are stored on one user id.
 * That id is a founding member of the organization (earliest membership).
 * People added later read and write those same records while the organization is active.
 */
export async function dataOwnerForOrganization(organizationId: string): Promise<string> {
  const members = await prisma.organizationMember.findMany({
    where: { organizationId },
    orderBy: [{ createdAt: "asc" }, { user: { createdAt: "asc" } }],
    select: {
      createdAt: true,
      userId: true,
      user: { select: { createdAt: true, _count: { select: { accounts: true } } } },
    },
  });
  if (members.length === 0) {
    throw new OrgAccessError();
  }
  const foundedAt = members[0]!.createdAt.getTime();
  const founders = members.filter((m) => m.createdAt.getTime() === foundedAt);
  founders.sort((a, b) => {
    const byAccounts = b.user._count.accounts - a.user._count.accounts;
    if (byAccounts !== 0) return byAccounts;
    return a.user.createdAt.getTime() - b.user.createdAt.getTime();
  });
  return founders[0]!.userId;
}

/** Active organization for this login, then the user id that owns its books. */
export async function resolveOrganizationDataUserId(
  actorUserId: string,
  preferredOrgId: string | null,
): Promise<string> {
  if (preferredOrgId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: actorUserId, organizationId: preferredOrgId },
      },
      select: { organizationId: true },
    });
    if (!membership) {
      throw new OrgAccessError("You are not a member of that organization");
    }
    return dataOwnerForOrganization(preferredOrgId);
  }

  const user = await prisma.user.findUnique({
    where: { id: actorUserId },
    select: { organizationId: true },
  });
  if (user?.organizationId) {
    const membership = await prisma.organizationMember.findUnique({
      where: {
        userId_organizationId: { userId: actorUserId, organizationId: user.organizationId },
      },
      select: { organizationId: true },
    });
    if (membership) {
      return dataOwnerForOrganization(user.organizationId);
    }
  }

  const first = await prisma.organizationMember.findFirst({
    where: { userId: actorUserId },
    orderBy: { createdAt: "asc" },
    select: { organizationId: true },
  });
  if (!first) {
    throw new OrgAccessError();
  }
  return dataOwnerForOrganization(first.organizationId);
}

export async function setActiveOrganization(userId: string, organizationId: string) {
  const membership = await prisma.organizationMember.findUnique({
    where: {
      userId_organizationId: { userId, organizationId },
    },
    include: { organization: { select: { id: true, title: true, enabledModules: true } } },
  });
  if (!membership) {
    const err = new Error("You are not a member of that organization");
    (err as Error & { status: number }).status = 403;
    throw err;
  }
  await prisma.user.update({
    where: { id: userId },
    data: { organizationId },
  });
  await prisma.userSettings.upsert({
    where: { userId },
    create: { userId, organizationTitle: membership.organization.title },
    update: { organizationTitle: membership.organization.title },
  });
  return toOrgSummary(membership.organization);
}

export async function setOrganizationModules(organizationId: string, modules: WorkspaceModuleId[]) {
  const updated = await prisma.organization.update({
    where: { id: organizationId },
    data: { enabledModules: modules },
    select: { id: true, title: true, enabledModules: true },
  });
  return toOrgSummary(updated);
}

export async function setOrganizationTitle(
  userId: string,
  title: string,
  preferredOrgId?: string | null,
  userEmail?: string | null,
) {
  const org = await ensureUserOrganization(userId, preferredOrgId, userEmail);
  const next = title.trim() || DEFAULT_TITLE;

  const updated = await prisma.organization.update({
    where: { id: org.id },
    data: { title: next },
  });

  await prisma.userSettings.updateMany({
    where: { user: { organizationId: org.id } },
    data: { organizationTitle: next },
  });

  return updated;
}

/** Add membership without removing other orgs. Idempotent. */
export async function attachUserToOrganization(
  userId: string,
  email: string | null,
  org: { id: string; title: string },
) {
  await prisma.user.upsert({
    where: { id: userId },
    create: {
      id: userId,
      email,
      organizationId: org.id,
    },
    update: {
      email: email ?? undefined,
    },
  });

  const user = await prisma.user.findUniqueOrThrow({
    where: { id: userId },
    select: { organizationId: true },
  });
  if (!user.organizationId) {
    await prisma.user.update({
      where: { id: userId },
      data: { organizationId: org.id },
    });
  }

  await prisma.organizationMember.upsert({
    where: {
      userId_organizationId: { userId, organizationId: org.id },
    },
    create: { userId, organizationId: org.id },
    update: {},
  });

  await prisma.userSettings.upsert({
    where: { userId },
    create: {
      userId,
      organizationTitle: org.title,
    },
    update: {},
  });
}

export async function listOrganizationMembers(organizationId: string) {
  const rows = await prisma.organizationMember.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    select: {
      createdAt: true,
      user: { select: { id: true, email: true, createdAt: true } },
    },
  });
  return rows.map((r) => ({
    id: r.user.id,
    email: r.user.email,
    created_at: r.user.createdAt.toISOString(),
    joined_at: r.createdAt.toISOString(),
  }));
}
