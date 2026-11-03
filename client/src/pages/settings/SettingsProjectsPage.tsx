import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Modal } from "@/components/Modal";
import { Button, Card, TextField } from "@/components/ui";
import { useProjects } from "@/context/ProjectsContext";
import type { ProjectDto } from "../../../../shared/types";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsProjectsPage() {
  const { projectsEnabled, projects, refresh, setProjectsEnabledLocal, createProject } =
    useProjects();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const [name, setName] = useState("");

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  const toggleEnabled = useCallback(
    async (next: boolean) => {
      setBusy(true);
      setError(null);
      try {
        await apiFetch("/api/settings", {
          method: "PATCH",
          body: JSON.stringify({ projects_enabled: next }),
        });
        setProjectsEnabledLocal(next);
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not update setting");
      } finally {
        setBusy(false);
      }
    },
    [refresh, setProjectsEnabledLocal],
  );

  const removeProject = useCallback(
    async (id: string) => {
      setError(null);
      try {
        await apiFetch(`/api/projects/${id}`, { method: "DELETE" });
        await refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not remove project");
      }
    },
    [refresh],
  );

  const addProject = useCallback(async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError("Enter a project name");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createProject(trimmed);
      setName("");
      setModalOpen(false);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not add project");
    } finally {
      setBusy(false);
    }
  }, [createProject, name, refresh]);

  return (
    <SettingsSubpage
      title="Projects"
      caption="Optional tags for income and expenses. Filters appear on Home and reports when enabled."
      action={
        projectsEnabled ? (
          <Button type="button" onClick={() => setModalOpen(true)}>
            Add
          </Button>
        ) : null
      }
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Card className="p-4">
        <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3">
          <span className="text-sm font-medium text-ink">Enable projects</span>
          <input
            type="checkbox"
            className="h-5 w-5 accent-action"
            checked={projectsEnabled}
            disabled={busy}
            onChange={(e) => void toggleEnabled(e.target.checked)}
            aria-label="Enable projects"
          />
        </label>
        <p className="mt-2 text-caption">
          When on, you can tag income and expenses and filter Home, Income, Spend, and reports by
          project (including “Not in a project”).
        </p>
      </Card>

      {projectsEnabled ? (
        <Card className="overflow-hidden p-0">
          <ul className="divide-y divide-border">
            {projects.map((p: ProjectDto) => (
              <li key={p.id} className="flex min-h-11 items-center justify-between gap-2 px-4 py-3">
                <span className="text-sm font-medium text-ink">{p.name}</span>
                <Button
                  type="button"
                  variant="ghost"
                  className="shrink-0"
                  onClick={() => void removeProject(p.id)}
                >
                  Remove
                </Button>
              </li>
            ))}
            {!projects.length ? (
              <li className="px-4 py-6 text-center text-caption">
                No projects yet.{" "}
                <button
                  type="button"
                  className="font-semibold text-action"
                  onClick={() => setModalOpen(true)}
                >
                  Add first project
                </button>
              </li>
            ) : null}
          </ul>
        </Card>
      ) : null}

      <Modal open={modalOpen} title="Add project" onClose={() => setModalOpen(false)}>
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            void addProject();
          }}
        >
          <TextField
            label="Name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            autoFocus
          />
          <Button type="submit" className="w-full" disabled={busy}>
            {busy ? "Saving…" : "Add project"}
          </Button>
        </form>
      </Modal>
    </SettingsSubpage>
  );
}
