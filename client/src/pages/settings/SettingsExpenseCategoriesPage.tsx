import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Modal } from "@/components/Modal";
import { Button, Card } from "@/components/ui";
import type { CategoryDto } from "../../../../shared/types";
import { CategoryForm, removeCategory } from "./categoryShared";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsExpenseCategoriesPage() {
  const [cats, setCats] = useState<CategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const list = await apiFetch<CategoryDto[]>("/api/categories?type=expense");
    setCats(list);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  return (
    <SettingsSubpage
      title="Expense categories"
      caption="Used when recording spend. Optional budgets show on this list."
      action={
        <Button type="button" onClick={() => setModalOpen(true)}>
          Add
        </Button>
      }
    >
      {error ? <p className="text-sm text-debit">{error}</p> : null}

      <Card className="overflow-hidden p-0">
        <ul className="divide-y divide-border">
          {cats.map((c) => (
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{c.name}</p>
                {c.budget_limit != null ? (
                  <p className="mt-0.5 text-caption">
                    Budget{" "}
                    {c.budget_limit.toLocaleString(undefined, { style: "currency", currency: "USD" })}
                  </p>
                ) : null}
              </div>
              <Button
                type="button"
                variant="ghost"
                className="shrink-0"
                onClick={() => void removeCategory(c.id, refresh, setError)}
              >
                Remove
              </Button>
            </li>
          ))}
          {!cats.length ? (
            <li className="px-4 py-6 text-center text-caption">
              No expense categories yet.{" "}
              <button
                type="button"
                className="font-semibold text-action"
                onClick={() => setModalOpen(true)}
              >
                Add first category
              </button>
            </li>
          ) : null}
        </ul>
      </Card>

      <Modal open={modalOpen} title="Add expense category" onClose={() => setModalOpen(false)}>
        <CategoryForm
          fixedType="expense"
          onDone={() => {
            setModalOpen(false);
            void refresh().catch(() => {});
          }}
          onError={setError}
        />
      </Modal>
    </SettingsSubpage>
  );
}
