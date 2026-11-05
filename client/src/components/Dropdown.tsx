import clsx from "clsx";
import { ChevronDown, X } from "lucide-react";
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

/** Phones, tablets, and touch devices use a bottom picker instead of a floating menu. */
const PICKER_QUERY = "(max-width: 1023px), (pointer: coarse)";

type ViewportBox = { top: number; left: number; width: number; height: number };

function readViewportBox(): ViewportBox {
  const vv = window.visualViewport;
  if (!vv) {
    return { top: 0, left: 0, width: window.innerWidth, height: window.innerHeight };
  }
  return { top: vv.offsetTop, left: vv.offsetLeft, width: vv.width, height: vv.height };
}

function usePickerSheet() {
  const [sheet, setSheet] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(PICKER_QUERY).matches : true,
  );
  useEffect(() => {
    const mq = window.matchMedia(PICKER_QUERY);
    const onChange = () => setSheet(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return sheet;
}

function useVisualViewportBox(active: boolean) {
  const [box, setBox] = useState<ViewportBox>(() =>
    typeof window !== "undefined" ? readViewportBox() : { top: 0, left: 0, width: 0, height: 0 },
  );
  useLayoutEffect(() => {
    if (!active) return;
    const update = () => setBox(readViewportBox());
    update();
    window.visualViewport?.addEventListener("resize", update);
    window.visualViewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      window.visualViewport?.removeEventListener("resize", update);
      window.visualViewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
    };
  }, [active]);
  return box;
}

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
  const pickerSheet = usePickerSheet();
  const viewportBox = useVisualViewportBox(open && pickerSheet);

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
    if (pickerSheet) return;
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const gap = 4;
    const below = window.innerHeight - r.bottom - gap;
    const above = r.top - gap;
    const preferBelow = below >= 200 || below >= above;
    const space = preferBelow ? below : above;
    const maxH = Math.max(160, Math.min(360, space - 8));
    const top = preferBelow ? r.bottom + gap : Math.max(gap, r.top - maxH - gap);
    setPanelPos({
      top,
      left: Math.max(8, Math.min(r.left, window.innerWidth - r.width - 8)),
      width: Math.max(r.width, 240),
      maxH,
    });
  }, [pickerSheet]);

  useLayoutEffect(() => {
    if (!open || pickerSheet) {
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
  }, [open, updatePanelPos, options.length, value, pickerSheet]);

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  useEffect(() => {
    if (!open) setAddErr(null);
  }, [open]);

  useEffect(() => {
    if (open && showSearch && !pickerSheet) {
      queueMicrotask(() => searchRef.current?.focus({ preventScroll: true }));
    }
  }, [open, showSearch, pickerSheet]);

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

  function selectValue(next: string) {
    onChange(next);
    setOpen(false);
  }

  const listBody = (
    <>
      {showSearch ? (
        <div className="shrink-0 border-b border-border p-3" data-dropdown-search="1">
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
            className="h-input w-full rounded-sm border border-border bg-surface px-3 text-base text-ink placeholder:text-muted-label focus-visible:border-action sm:text-sm"
          />
        </div>
      ) : null}
      {options.length === 0 && !qTrim && onAddNotFound ? (
        <p className="border-b border-border px-4 py-3 text-sm text-muted-label">
          Type in the search box above. If nothing matches, use the add button with your search text.
        </p>
      ) : null}
      {options.length === 0 && !onAddNotFound ? (
        <p className="border-b border-border px-4 py-3 text-sm text-muted-label">No options</p>
      ) : null}
      {options.length > 0 && filteredOptions.length === 0 && !canShowAddNotFound ? (
        <p className="border-b border-border px-4 py-3 text-sm text-muted-label">No matches</p>
      ) : null}
      <div
        id={listId}
        role="listbox"
        className="max-h-[min(50dvh,420px)] min-h-0 flex-1 overflow-y-auto overscroll-contain py-1"
      >
        {!required ? (
          <button
            type="button"
            role="option"
            aria-selected={value === ""}
            className="flex min-h-11 w-full touch-manipulation items-center px-4 text-left text-sm text-muted-label hover:bg-neutral-bg"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectValue("");
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
              "flex min-h-11 w-full touch-manipulation items-center px-4 text-left text-sm hover:bg-neutral-bg",
              value === o.value ? "bg-neutral-bg font-semibold text-ink" : "text-ink",
            )}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              selectValue(o.value);
            }}
          >
            {o.label}
          </button>
        ))}
      </div>
      {canShowAddNotFound ? (
        <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <button
            type="button"
            className="flex min-h-11 w-full touch-manipulation items-center rounded-sm bg-neutral-bg px-3 text-left text-sm font-semibold text-ink hover:bg-neutral-bg/80 disabled:opacity-50"
            disabled={adding}
            onClick={() => void handleAddNotFound()}
          >
            {adding ? "Adding…" : `${addNotFoundLabel} “${qTrim}”`}
          </button>
          {addErr ? <p className="mt-1 text-caption text-debit">{addErr}</p> : null}
        </div>
      ) : null}
    </>
  );

  const panel =
    open && pickerSheet
      ? createPortal(
          <div
            className="z-[500] flex items-end justify-center touch-manipulation"
            style={{
              position: "fixed",
              top: viewportBox.top,
              left: viewportBox.left,
              width: viewportBox.width,
              height: viewportBox.height,
              backgroundColor: "var(--overlay)",
            }}
            role="presentation"
            onPointerDown={(e) => {
              if (e.target !== e.currentTarget) return;
              e.preventDefault();
              e.stopPropagation();
              setOpen(false);
            }}
          >
            <div
              ref={panelRef}
              className="theme-light flex w-full min-h-0 flex-col overflow-hidden rounded-t-[var(--sheet-radius)] border border-border bg-surface pb-[env(safe-area-inset-bottom,0px)]"
              style={{ maxHeight: "min(85%, 640px)" }}
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest?.('[data-dropdown-search="1"]') && target.tagName !== "INPUT") {
                  e.preventDefault();
                }
              }}
            >
              <div className="flex shrink-0 justify-center pt-2" aria-hidden>
                <span className="h-1 w-10 rounded-full bg-[var(--control-border)]" />
              </div>
              <div className="flex shrink-0 items-center justify-between gap-3 border-b border-border px-4 py-1">
                <p className="text-section text-ink">{label}</p>
                <button
                  type="button"
                  className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm text-muted-label hover:bg-neutral-bg"
                  aria-label="Close"
                  onClick={() => setOpen(false)}
                >
                  <X className="h-5 w-5" strokeWidth={1.8} aria-hidden />
                </button>
              </div>
              {listBody}
            </div>
          </div>,
          document.body,
        )
      : open && panelPos
        ? createPortal(
            <div
              ref={panelRef}
              className="theme-light fixed z-[500] flex flex-col overflow-hidden rounded-[var(--radius-xl)] border border-border bg-surface"
              style={{
                top: panelPos.top,
                left: panelPos.left,
                width: panelPos.width,
                maxHeight: panelPos.maxH,
              }}
              onMouseDown={(e) => {
                const target = e.target as HTMLElement;
                if (target.closest?.('[data-dropdown-search="1"]') && target.tagName !== "INPUT") {
                  e.preventDefault();
                }
              }}
            >
              {listBody}
            </div>,
            document.body,
          )
        : null;

  return (
    <div className="relative w-full">
      <span className="mb-1.5 block text-sm font-medium text-ink">{label}</span>
      <button
        ref={triggerRef}
        type="button"
        disabled={disabled}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        className={clsx(
          "flex h-input w-full touch-manipulation items-center justify-between gap-2 rounded-sm border border-border bg-surface px-3 text-left text-base text-ink sm:text-sm",
          disabled ? "cursor-not-allowed opacity-50" : "hover:bg-neutral-bg/60",
        )}
        onClick={() => !disabled && setOpen((o) => !o)}
      >
        <span className={clsx("min-w-0 flex-1 truncate", !selected && "text-muted-label")}>
          {selected?.label ?? placeholder}
        </span>
        <ChevronDown
          className={clsx("h-4 w-4 shrink-0 text-muted-label transition", open && "rotate-180")}
          strokeWidth={1.8}
          aria-hidden
        />
      </button>
      {hint ? <p className="mt-1 text-caption">{hint}</p> : null}
      {panel}
    </div>
  );
}
