import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import {
  ensureFxBaseline,
  listFxDailyRates,
  upsertFxDailyRate,
} from "../lib/fxRates.js";
import {
  attachUserToOrganization,
  dataOwnerForOrganization,
  ensureUserOrganization,
  ensureUserOrganizations,
  getOrganizationTaxInfo,
  listOrganizationMembers,
  parseTaxableActivities,
  readPreferredOrgId,
  resolveOrganizationDataUserId,
  setActiveOrganization,
  setOrganizationTaxInfo,
  setOrganizationTitle,
} from "../lib/organization.js";
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
    const actorId = (req as AuthedRequest).userId;
    const preferred = readPreferredOrgId(req);
    const org = await ensureUserOrganization(
      actorId,
      preferred,
      (req as AuthedRequest).userEmail,
    );
    const userId = await dataOwnerForOrganization(org.id);
    const row = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    await ensureFxBaseline(userId);
    const fx_rates = await listFxDailyRates(userId);
    const tax = await getOrganizationTaxInfo(
      actorId,
      preferred,
      (req as AuthedRequest).userEmail,
    );
    res.json({
      global_usd_mvr_rate: Number(row.globalUsdMvrRate),
      organization_id: org.id,
      organization_title: org.title?.trim() || "NTRIO",
      projects_enabled: row.projectsEnabled,
      gst_tin: tax.gst_tin,
      gst_registered_name: tax.gst_registered_name,
      gst_return_currency: tax.gst_return_currency,
      taxable_activities: tax.taxable_activities,
      green_tax_enabled: tax.green_tax_enabled,
      green_tax_collect_guests: tax.green_tax_collect_guests,
      fx_rates,
    });
  }),
);

settingsRouter.get(
  "/organizations",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    const preferred = readPreferredOrgId(req);
    const { organizations, active, pendingRequest, isSystemAdmin } =
      await ensureUserOrganizations(authed.userId, preferred, authed.userEmail);
    res.json({
      organizations: organizations.map((o) => ({
        id: o.id,
        title: o.title,
        enabled_modules: o.enabledModules,
      })),
      active_organization_id: active?.id ?? null,
      enabled_modules: active?.enabledModules ?? [],
      pending_request: pendingRequest,
      is_system_admin: isSystemAdmin,
    });
  }),
);

const activeOrgSchema = z.object({
  organization_id: z.string().uuid(),
});

settingsRouter.post(
  "/active-organization",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = activeOrgSchema.parse(req.body);
    try {
      const org = await setActiveOrganization(userId, body.organization_id);
      res.json({
        organization_id: org.id,
        organization_title: org.title,
        enabled_modules: org.enabledModules,
      });
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 403) {
        res.status(403).json({ error: (e as Error).message });
        return;
      }
      throw e;
    }
  }),
);

const taxableActivitySchema = z.object({
  number: z.string().trim().min(1).max(32),
  name: z.string().trim().max(120).optional().nullable(),
});

const patchSchema = z
  .object({
    global_usd_mvr_rate: z.number().positive().max(1_000_000).optional(),
    /** Optional ISO date (YYYY-MM-DD); defaults to today UTC. */
    rate_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    organization_title: z.string().trim().min(1).max(64).optional(),
    projects_enabled: z.boolean().optional(),
    gst_tin: z.string().trim().max(64).optional().nullable(),
    gst_registered_name: z.string().trim().max(160).optional().nullable(),
    gst_return_currency: z.string().trim().min(1).max(8).optional(),
    taxable_activities: z.array(taxableActivitySchema).max(50).optional(),
    green_tax_enabled: z.boolean().optional(),
    green_tax_collect_guests: z.boolean().optional(),
  })
  .refine(
    (b) =>
      b.global_usd_mvr_rate !== undefined ||
      b.organization_title !== undefined ||
      b.projects_enabled !== undefined ||
      b.gst_tin !== undefined ||
      b.gst_registered_name !== undefined ||
      b.gst_return_currency !== undefined ||
      b.taxable_activities !== undefined ||
      b.green_tax_enabled !== undefined ||
      b.green_tax_collect_guests !== undefined,
    {
      message:
        "Provide global_usd_mvr_rate, organization_title, projects_enabled, and/or GST tax fields",
    },
  );

settingsRouter.patch(
  "/",
  asyncHandler(async (req, res) => {
    const actorId = (req as AuthedRequest).userId;
    const preferred = readPreferredOrgId(req);
    const body = patchSchema.parse(req.body);

    if (body.organization_title !== undefined) {
      await setOrganizationTitle(
        actorId,
        body.organization_title,
        preferred,
        (req as AuthedRequest).userEmail,
      );
    }

    if (
      body.gst_tin !== undefined ||
      body.gst_registered_name !== undefined ||
      body.gst_return_currency !== undefined ||
      body.taxable_activities !== undefined ||
      body.green_tax_enabled !== undefined ||
      body.green_tax_collect_guests !== undefined
    ) {
      await setOrganizationTaxInfo(
        actorId,
        {
          gst_tin: body.gst_tin,
          gst_registered_name: body.gst_registered_name,
          gst_return_currency: body.gst_return_currency,
          taxable_activities:
            body.taxable_activities !== undefined
              ? parseTaxableActivities(body.taxable_activities)
              : undefined,
          green_tax_enabled: body.green_tax_enabled,
          green_tax_collect_guests: body.green_tax_collect_guests,
        },
        preferred,
        (req as AuthedRequest).userEmail,
      );
    }

    const userId = await resolveOrganizationDataUserId(actorId, preferred);

    if (body.projects_enabled !== undefined) {
      await prisma.userSettings.upsert({
        where: { userId },
        create: { userId, projectsEnabled: body.projects_enabled },
        update: { projectsEnabled: body.projects_enabled },
      });
    }

    if (body.global_usd_mvr_rate !== undefined) {
      const todayYmd = new Date().toISOString().slice(0, 10);
      const rateDate = body.rate_date ?? todayYmd;

      await upsertFxDailyRate(userId, body.global_usd_mvr_rate, rateDate);

      const shouldUpdateCurrent = rateDate >= todayYmd;
      await prisma.userSettings.upsert({
        where: { userId },
        create: { userId, globalUsdMvrRate: body.global_usd_mvr_rate },
        update: shouldUpdateCurrent
          ? { globalUsdMvrRate: body.global_usd_mvr_rate }
          : {},
      });

      if (!shouldUpdateCurrent) {
        const latest = await prisma.fxDailyRate.findFirst({
          where: { userId },
          orderBy: { rateDate: "desc" },
        });
        if (latest && latest.rateDate.toISOString().slice(0, 10) === rateDate) {
          await prisma.userSettings.update({
            where: { userId },
            data: { globalUsdMvrRate: body.global_usd_mvr_rate },
          });
        }
      }
    }

    const refreshed = await prisma.userSettings.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
    const org = await ensureUserOrganization(
      actorId,
      preferred,
      (req as AuthedRequest).userEmail,
    );
    const fx_rates = await listFxDailyRates(userId);
    const tax = await getOrganizationTaxInfo(
      actorId,
      preferred,
      (req as AuthedRequest).userEmail,
    );
    res.json({
      global_usd_mvr_rate: Number(refreshed.globalUsdMvrRate),
      organization_id: org.id,
      organization_title: org.title?.trim() || "NTRIO",
      projects_enabled: refreshed.projectsEnabled,
      gst_tin: tax.gst_tin,
      gst_registered_name: tax.gst_registered_name,
      gst_return_currency: tax.gst_return_currency,
      taxable_activities: tax.taxable_activities,
      green_tax_enabled: tax.green_tax_enabled,
      green_tax_collect_guests: tax.green_tax_collect_guests,
      fx_rates,
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

    const preferred = readPreferredOrgId(req);
    const org = await ensureUserOrganization(authed.userId, preferred, authed.userEmail);
    const rows = await listOrganizationMembers(org.id);
    res.json(rows);
  }),
);

const upsertOrgUserSchema = z
  .object({
    email: z.string().trim().email(),
    mode: z.enum(["create", "add_existing"]).default("create"),
    password: z.string().min(8).max(128).optional(),
  })
  .superRefine((b, ctx) => {
    if (b.mode === "create" && !b.password) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Password is required when creating a new user",
        path: ["password"],
      });
    }
  });

async function findAuthUserIdByEmail(
  supabase: ReturnType<typeof serviceSupabase>,
  email: string,
): Promise<{ id: string; email: string | null } | null> {
  const target = email.trim().toLowerCase();
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
    if (error) throw new Error(error.message);
    const hit = data.users.find((u) => (u.email ?? "").trim().toLowerCase() === target);
    if (hit) return { id: hit.id, email: hit.email ?? null };
    if (data.users.length < 200) break;
  }
  return null;
}

settingsRouter.post(
  "/users",
  asyncHandler(async (req, res) => {
    const authed = req as AuthedRequest;
    if (!canManageUsers(authed.userEmail)) {
      res.status(403).json({ error: "Not allowed to manage users" });
      return;
    }
    const body = upsertOrgUserSchema.parse(req.body);
    const preferred = readPreferredOrgId(req);
    const org = await ensureUserOrganization(authed.userId, preferred, authed.userEmail);
    const email = body.email.trim().toLowerCase();
    const supabase = serviceSupabase();

    if (body.mode === "add_existing") {
      const local = await prisma.user.findFirst({
        where: { email: { equals: email, mode: "insensitive" } },
        select: { id: true, email: true },
      });

      let userId = local?.id ?? null;
      let userEmail = local?.email ?? email;

      if (!userId) {
        const authUser = await findAuthUserIdByEmail(supabase, email);
        if (!authUser) {
          res.status(404).json({
            error: "No account with that email. Use Create new instead.",
          });
          return;
        }
        userId = authUser.id;
        userEmail = authUser.email ?? email;
      }

      await attachUserToOrganization(userId, userEmail, org);

      res.status(200).json({
        id: userId,
        email: userEmail,
        attached: true,
      });
      return;
    }

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: body.password!,
      email_confirm: true,
    });

    if (error) {
      const msg = error.message ?? "Could not create user";
      const lower = msg.toLowerCase();
      if (lower.includes("already been registered") || lower.includes("already exists")) {
        res.status(409).json({
          error: "That email already has an account. Switch to Add existing.",
        });
        return;
      }
      res.status(400).json({ error: msg });
      return;
    }

    if (!data.user) {
      res.status(500).json({ error: "Auth did not return a user" });
      return;
    }

    await attachUserToOrganization(data.user.id, data.user.email ?? email, org);

    res.status(201).json({
      id: data.user.id,
      email: data.user.email ?? email,
      created: true,
    });
  }),
);
