import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { Modal } from "@/components/Modal";
import { Button, Card } from "@/components/ui";
import type { CategoryDto } from "../../../../shared/types";
import { CategoryForm, removeCategory } from "./categoryShared";
import { SettingsSubpage } from "./SettingsSubpage";

export function SettingsIncomeCategoriesPage() {
  const [cats, setCats] = useState<CategoryDto[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalOpen, setModalOpen] = useState(false);

  const refresh = useCallback(async () => {
    const list = await apiFetch<CategoryDto[]>("/api/categories?type=income");
    setCats(list);
  }, []);

  useEffect(() => {
    void refresh().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [refresh]);

  return (
    <SettingsSubpage
      title="Income categories"
      caption="Used when recording income."
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
            <li key={c.id} className="flex min-h-11 items-center justify-between gap-2 px-4 py-3">
              <span className="text-sm font-medium text-ink">{c.name}</span>
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
              No income categories yet.{" "}
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

      <Modal open={modalOpen} title="Add income category" onClose={() => setModalOpen(false)}>
        <CategoryForm
          fixedType="income"
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
