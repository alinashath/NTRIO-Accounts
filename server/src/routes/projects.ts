import { Router } from "express";
import { z } from "zod";
import { prisma } from "../lib/prisma.js";
import { requireAuth, type AuthedRequest } from "../middleware/auth.js";
import { scopeOrganizationData } from "../middleware/orgScope.js";
import { asyncHandler } from "../utils/http.js";

export const projectsRouter = Router();
projectsRouter.use(requireAuth);
projectsRouter.use(scopeOrganizationData);

function mapProject(row: { id: string; name: string; createdAt: Date }) {
  return {
    id: row.id,
    name: row.name,
    created_at: row.createdAt.toISOString(),
  };
}

projectsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const rows = await prisma.project.findMany({
      where: { userId },
      orderBy: { createdAt: "asc" },
    });
    res.json(rows.map(mapProject));
  }),
);

const createSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

projectsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const body = createSchema.parse(req.body);
    const row = await prisma.project.create({
      data: { userId, name: body.name },
    });
    res.status(201).json(mapProject(row));
  }),
);

const updateSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

projectsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);
    const body = updateSchema.parse(req.body);

    const existing = await prisma.project.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const row = await prisma.project.update({
      where: { id },
      data: { name: body.name },
    });
    res.json(mapProject(row));
  }),
);

projectsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const userId = (req as AuthedRequest).userId;
    const id = z.string().uuid().parse(req.params.id);

    const existing = await prisma.project.findFirst({ where: { id, userId } });
    if (!existing) {
      res.status(404).json({ error: "Project not found" });
      return;
    }

    const [ic, ec] = await Promise.all([
      prisma.incomeEntry.count({ where: { projectId: id, deletedAt: null } }),
      prisma.expenseEntry.count({ where: { projectId: id, deletedAt: null } }),
    ]);

    if (ic + ec > 0) {
      res.status(400).json({ error: "Project is linked to entries" });
      return;
    }

    await prisma.project.delete({ where: { id } });
    res.status(204).send();
  }),
);
