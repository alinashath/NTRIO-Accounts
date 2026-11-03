import { useMemo } from "react";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { useProjects, type ProjectFilterValue } from "@/context/ProjectsContext";

type ProjectFilterProps = {
  value: ProjectFilterValue;
  onChange: (value: ProjectFilterValue) => void;
  /** Compact label for filter bars */
  label?: string;
  className?: string;
};

/** All | project | Not in a project — only renders when projects are enabled. */
export function ProjectFilter({
  value,
  onChange,
  label = "Project",
}: ProjectFilterProps) {
  const { projectsEnabled, projects } = useProjects();

  const options: DropdownOption[] = useMemo(
    () => [
      { value: "", label: "All projects" },
      ...projects.map((p) => ({ value: p.id, label: p.name })),
      { value: "unassigned", label: "Not in a project" },
    ],
    [projects],
  );

  if (!projectsEnabled) return null;

  return (
    <Dropdown
      label={label}
      value={value}
      onChange={onChange}
      options={options}
      required={false}
      placeholder="All projects"
      searchable={projects.length > 6}
    />
  );
}
