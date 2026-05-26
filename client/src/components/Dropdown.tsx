import clsx from "clsx";
import { ChevronDown } from "lucide-react";
import { createPortal } from "react-dom";
import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from "react";

export type DropdownOption = { value: string; label: string };

type DropdownProps = {
  label: string;
  value: string;
  onChange: (value: string) => void;
  options: DropdownOption[];
  /** Shown when value is empty */
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  hint?: string;
  /** Show a search field to filter options by label (default: true) */
  searchable?: boolean;
  /**
   * When the user types a search that matches no option, show a row to create one (e.g. category).
   * Should return the new option’s `value` (id). Enables search UI even when `options` is empty.
   */
  onAddNotFound?: (name: string) => Promise<string>;
  /** Label for the create row (default: Add category) */
  addNotFoundLabel?: string;
};

export function Dropdown({
  label,
  value,
  onChange,
  options,
  placeholder = "Select…",
  required = true,
  disabled = false,
  hint,
  searchable = true,
  onAddNotFound,
  addNotFoundLabel = "Add category",
}: DropdownProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [panelPos, setPanelPos] = useState<{ top: number; left: number; width: number; maxH: number } | null>(null);
  const [adding, setAdding] = useState(false);
  const [addErr, setAddErr] = useState<string | null>(null);

  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const listId = useId();
  const searchId = useId();

  const selected = options.find((o) => o.value === value);

  const filteredOptions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!searchable || !q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query, searchable]);

  const showSearch = searchable && (options.length > 0 || !!onAddNotFound);

  const updatePanelPos = useCallback(() => {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    const preferBelow = below >= 160 || below >= above;
    const space = preferBelow ? below : above;
    const maxH = Math.max(120, Math.min(280, space - 8));
    const top = preferBelow ? r.bottom + gap : Math.max(gap, r.top - maxH - gap);
    setPanelPos({
      top,
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      width: Math.max(r.width, 200),
      maxH,
    });
  }, []);

  useLayoutEffect(() => {
    if (!open) {
      setPanelPos(null);
      return;
    }
    updatePanelPos();
    window.addEventListener("scroll", updatePanelPos, true);
    window.addEventListener("resize", updatePanelPos);
    return () => {
      window.removeEventListener("scroll", updatePanelPos, true);
      window.removeEventListener("resize", updatePanelPos);
    };
  }, [open, updatePanelPos, options.length, value]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) setAddErr(null);
  }, [open]);

  useEffect(() => {
    if (open && showSearch) {
      queueMicrotask(() => searchRef.current?.focus());
    }
  }, [open, showSearch]);

  useEffect(() => {
    if (!open) return;
    const onDocPointerDown = (e: PointerEvent) => {
      const t = triggerRef.current;
      const p = panelRef.current;
      const node = e.target as Node;
      if (!t || !p) return;
      if (t.contains(node) || p.contains(node)) return;
      setOpen(false);
    };
    document.addEventListener("pointerdown", onDocPointerDown);
    return () => document.removeEventListener("pointerdown", onDocPointerDown);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        e.preventDefault();
        setOpen(false);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open]);

  const qTrim = query.trim();
  const canShowAddNotFound =
    !!onAddNotFound &&
    qTrim.length > 0 &&
    (options.length === 0 || filteredOptions.length === 0);

  async function handleAddNotFound() {
    if (!onAddNotFound || !qTrim) return;
    setAddErr(null);
    setAdding(true);
    try {
      const id = await onAddNotFound(qTrim);
      onChange(id);
      setOpen(false);
      setQuery("");
    } catch (e) {
      setAddErr(e instanceof Error ? e.message : "Could not add");
    } finally {
      setAdding(false);
    }
  }

  const panel =
    open && panelPos
      ? createPortal(
          <div
            ref={panelRef}
            className="fixed z-[500] flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl"
            style={{
              top: panelPos.top,
              left: panelPos.left,
              width: panelPos.width,
              maxHeight: panelPos.maxH,
            }}
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest?.('[data-dropdown-search="1"]')) {
                e.preventDefault();
              }
            }}
          >
            {showSearch ? (
              <div className="shrink-0 border-b border-slate-100 p-2" data-dropdown-search="1">
                <label htmlFor={searchId} className="sr-only">
                  Search {label}
                </label>
                <input
                  id={searchId}
                  ref={searchRef}
                  type="search"
                  autoComplete="off"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-sky-500 focus:outline-none focus:ring-1 focus:ring-sky-500"
                />
              </div>
            ) : null}
            {options.length === 0 && !qTrim && onAddNotFound ? (
              <p className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">
                Type in the search box above. If nothing matches, use the add button with your search text.
              </p>
            ) : null}
            {options.length === 0 && !onAddNotFound ? (
              <p className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">No options</p>
            ) : null}
            {options.length > 0 && filteredOptions.length === 0 && !canShowAddNotFound ? (
              <p className="border-b border-slate-100 px-3 py-2 text-sm text-slate-500">No matches</p>
            ) : null}
            <div id={listId} role="listbox" className="min-h-0 flex-1 overflow-y-auto overscroll-contain py-1">
              {!required ? (
                <button
                  type="button"
                  role="option"
                  aria-selected={value === ""}
                  className="min-h-12 w-full touch-manipulation px-3 py-3 text-left text-base text-slate-600 hover:bg-slate-50 active:bg-slate-100"
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  —
                </button>
              ) : null}
              {filteredOptions.map((o) => (
                <button
                  key={o.value}
                  type="button"
                  role="option"
                  aria-selected={value === o.value}
                  className={clsx(
                    "flex min-h-12 w-full touch-manipulation px-3 py-3 text-left text-base active:bg-slate-100 hover:bg-slate-50",
                    value === o.value ? "bg-slate-100 font-semibold text-slate-900" : "text-slate-800",
                  )}
                  onClick={() => {
                    onChange(o.value);
                    setOpen(false);
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
            {canShowAddNotFound ? (
              <div className="border-t border-slate-100 p-2">
                <button
                  type="button"
                  className="w-full touch-manipulation rounded-lg bg-sky-50 px-3 py-3 text-left text-sm font-medium text-sky-900 hover:bg-sky-100 active:bg-sky-100 disabled:opacity-50"
                  disabled={adding}
                  onClick={() => void handleAddNotFound()}
                >
                  {adding ? "Adding…" : `${addNotFoundLabel} “${qTrim}”`}
                </button>
                {addErr ? <p className="mt-1 text-xs text-red-600">{addErr}</p> : null}
              </div>
            ) : null}
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="relative w-full">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          "flex min-h-12 w-full touch-manipulation items-center justify-between gap-2 rounded-xl border border-slate-300 bg-white px-3 py-3 text-left text-base text-slate-900 shadow-sm",
          disabled ? "cursor-not-allowed opacity-50" : "active:bg-slate-50",
        )}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={clsx("min-w-0 flex-1 truncate", !selected && "text-slate-500")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={clsx("h-5 w-5 shrink-0 text-slate-500 transition", open && "rotate-180")}
        />
      </button>
      {hint ? <p className="mt-1 text-xs text-slate-500">{hint}</p> : null}
      {panel}
    </div>
  );
}
