import { z } from "zod";

/** Shared project scope for list/report queries. */
export type ProjectScope = {
  projectId?: string;
  unassigned?: boolean;
};

export const projectScopeQuery = z
  .object({
    project_id: z.string().uuid().optional(),
    unassigned: z.preprocess(
      (v) => v === true || v === "true" || v === "1" || v === 1,
      z.boolean().optional(),
    ),
  })
  .superRefine((q, ctx) => {
    if (q.unassigned && q.project_id) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Use either project_id or unassigned, not both.",
        path: ["project_id"],
      });
    }
  });

export function parseProjectScope(query: unknown): ProjectScope {
  const q = projectScopeQuery.parse(query);
  if (q.unassigned) return { unassigned: true };
  if (q.project_id) return { projectId: q.project_id };
  return {};
}

/** Prisma where fragment for optional project tagging. */
export function projectWhereClause(scope: ProjectScope): { projectId: string | null } | Record<string, never> {
  if (scope.unassigned) return { projectId: null };
  if (scope.projectId) return { projectId: scope.projectId };
  return {};
}

export function isProjectScoped(scope: ProjectScope): boolean {
  return Boolean(scope.unassigned || scope.projectId);
}

/** Append project_id / unassigned to a URLSearchParams builder. */
export function applyProjectScopeParams(
  q: URLSearchParams,
  scope: ProjectScope,
): void {
  if (scope.unassigned) q.set("unassigned", "true");
  else if (scope.projectId) q.set("project_id", scope.projectId);
}
