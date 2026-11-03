import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { apiFetch } from "@/api/http";
import type { ProjectDto, SettingsDto } from "../../../shared/types";

type Ctx = {
  ready: boolean;
  projectsEnabled: boolean;
  projects: ProjectDto[];
  refresh: () => Promise<void>;
  setProjectsEnabledLocal: (enabled: boolean) => void;
  /** Create a project and refresh list; returns new id. */
  createProject: (name: string) => Promise<string>;
};

const ProjectsContext = createContext<Ctx | null>(null);

export function ProjectsProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [projectsEnabled, setProjectsEnabled] = useState(false);
  const [projects, setProjects] = useState<ProjectDto[]>([]);

  const refresh = useCallback(async () => {
    const settings = await apiFetch<SettingsDto>("/api/settings");
    setProjectsEnabled(Boolean(settings.projects_enabled));
    if (settings.projects_enabled) {
      const list = await apiFetch<ProjectDto[]>("/api/projects");
      setProjects(list);
    } else {
      setProjects([]);
    }
    setReady(true);
  }, []);

  useEffect(() => {
    void refresh().catch(() => setReady(true));
  }, [refresh]);

  const setProjectsEnabledLocal = useCallback((enabled: boolean) => {
    setProjectsEnabled(enabled);
  }, []);

  const createProject = useCallback(async (name: string) => {
    const row = await apiFetch<ProjectDto>("/api/projects", {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    setProjects((prev) => [...prev, row]);
    return row.id;
  }, []);

  const value = useMemo(
    () => ({
      ready,
      projectsEnabled,
      projects,
      refresh,
      setProjectsEnabledLocal,
      createProject,
    }),
    [ready, projectsEnabled, projects, refresh, setProjectsEnabledLocal, createProject],
  );

  return <ProjectsContext.Provider value={value}>{children}</ProjectsContext.Provider>;
}

export function useProjects() {
  const ctx = useContext(ProjectsContext);
  if (!ctx) throw new Error("useProjects must be used within ProjectsProvider");
  return ctx;
}

/** Filter value: empty = all, `unassigned` = not in a project, else project UUID. */
export type ProjectFilterValue = string;

export function appendProjectFilter(q: URLSearchParams, value: ProjectFilterValue) {
  if (value === "unassigned") q.set("unassigned", "true");
  else if (value) q.set("project_id", value);
}

export function projectFilterFromSearchParams(sp: URLSearchParams): ProjectFilterValue {
  if (sp.get("unassigned") === "true" || sp.get("unassigned") === "1") return "unassigned";
  return sp.get("project_id") ?? "";
}
