import { useMemo, useState } from "react";
import { apiFetch } from "@/api/http";
import { Dropdown, type DropdownOption } from "@/components/Dropdown";
import { Button, TextField } from "@/components/ui";

export async function removeCategory(
  id: string,
  refresh: () => Promise<void>,
  onError: (s: string | null) => void,
) {
  onError(null);
  try {
    await apiFetch(`/api/categories/${id}`, { method: "DELETE" });
    await refresh();
  } catch (e) {
    onError(e instanceof Error ? e.message : "Failed");
  }
}

export function CategoryForm({
  onDone,
  onError,
  fixedType,
}: {
  onDone: () => void;
  onError: (s: string | null) => void;
  /** When set, type is locked (income or expense page). */
  fixedType?: "income" | "expense";
}) {
  const kindOpts: DropdownOption[] = useMemo(
    () => [
      { value: "income", label: "Income" },
      { value: "expense", label: "Expense" },
    ],
    [],
  );
  const [name, setName] = useState("");
  const [kind, setKind] = useState(fixedType ?? "");
  const [budget, setBudget] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const type = fixedType ?? kind;
    if (!type) {
      onError("Select type.");
      return;
    }
    setBusy(true);
    onError(null);
    try {
      await apiFetch("/api/categories", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim(),
          type,
          ...(type === "expense" && budget.trim() ? { budget_limit: Number(budget) } : {}),
        }),
      });
      setName("");
      if (!fixedType) setKind("");
      setBudget("");
      onDone();
    } catch (err) {
      onError(err instanceof Error ? err.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="space-y-4" onSubmit={(e) => void submit(e)}>
      <TextField label="Name" value={name} onChange={(e) => setName(e.target.value)} required />
      {!fixedType ? <Dropdown label="Type" value={kind} onChange={setKind} options={kindOpts} /> : null}
      {(fixedType ?? kind) === "expense" ? (
        <TextField
          label="Budget limit (optional)"
          type="number"
          step="0.01"
          value={budget}
          onChange={(e) => setBudget(e.target.value)}
        />
      ) : null}
      <Button type="submit" className="w-full" disabled={busy}>
        {busy ? "Saving…" : "Add category"}
      </Button>
    </form>
  );
}
