import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { createServiceRoleSupabase } from "../lib/supabaseService.js";
import { asyncHandler } from "../utils/http.js";

export const signupRouter = Router();

function serviceSupabase() {
  const url = process.env.SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error("Server missing Supabase configuration");
  }
  return createServiceRoleSupabase(url, serviceKey);
}

const signupSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8).max(128),
  organization_title: z.string().trim().min(2).max(64),
  contact_name: z.string().trim().min(1).max(120).optional(),
});

/**
 * Public signup: creates Auth user + pending organization setup request.
 * Tenant is not usable until a system admin approves the request.
 */
signupRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = signupSchema.parse(req.body);
    const email = body.email.trim().toLowerCase();
    const supabase = serviceSupabase();

    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password: body.password,
      email_confirm: true,
    });

    if (error) {
      const msg = error.message ?? "Could not create account";
      const lower = msg.toLowerCase();
      if (lower.includes("already been registered") || lower.includes("already exists")) {
        res.status(409).json({ error: "An account with this email already exists. Sign in instead." });
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
      create: { id: data.user.id, email },
      update: { email },
    });

    const existingPending = await prisma.organizationSetupRequest.findFirst({
      where: { requesterUserId: data.user.id, status: "pending" },
    });
    if (existingPending) {
      res.status(201).json({
        id: data.user.id,
        email,
        setup_request_id: existingPending.id,
        message: "Account ready. Organization setup is awaiting admin approval.",
      });
      return;
    }

    const request = await prisma.organizationSetupRequest.create({
      data: {
        requesterUserId: data.user.id,
        requesterEmail: email,
        organizationTitle: body.organization_title.trim(),
        contactName: body.contact_name?.trim() || null,
        status: "pending",
      },
    });

    res.status(201).json({
      id: data.user.id,
      email,
      setup_request_id: request.id,
      message:
        "Account created. Sign in — your organization will be available after the system admin approves the setup request.",
    });
  }),
);
