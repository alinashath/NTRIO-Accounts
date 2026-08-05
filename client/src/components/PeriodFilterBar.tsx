import { useEffect, useState } from "react";
import { format, parseISO } from "date-fns";
import { CalendarDays } from "lucide-react";
import clsx from "clsx";
import { Modal } from "@/components/Modal";
import { Button } from "@/components/ui";
import {
  REPORT_PERIOD_PRESETS,
  type PeriodPresetOption,
  type RangePreset,
  rangeForPreset,
} from "@/lib/reportPeriod";

/** Shared compact control height for buttons + inputs */
export const controlClass =
  "h-8 touch-manipulation rounded-[var(--radius-md)] border border-border bg-card px-2.5 text-xs text-foreground";

type PeriodFilterBarProps = {
  from: string;
  to: string;
  preset: RangePreset;
  onApply: (next: { from: string; to: string; preset: RangePreset }) => void;
  /** Balance sheet: emphasize as-of end date */
  asOfHint?: boolean;
  actions?: React.ReactNode;
  /** Which preset chips to show (defaults to report set). */
  presets?: PeriodPresetOption[];
};

export function PeriodFilterBar({
  from,
  to,
  preset,
  onApply,
  asOfHint,
  actions,
  presets = REPORT_PERIOD_PRESETS,
}: PeriodFilterBarProps) {
  const [open, setOpen] = useState(false);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [draftPreset, setDraftPreset] = useState<RangePreset>(preset);

  useEffect(() => {
    if (!open) return;
    setDraftFrom(from);
    setDraftTo(to);
    setDraftPreset(preset);
  }, [open, from, to, preset]);

  const label = `${format(parseISO(from), "MMM d, yyyy")} – ${format(parseISO(to), "MMM d, yyyy")}`;

  function applyNamedPreset(p: Exclude<RangePreset, "custom">) {
    const r = rangeForPreset(p);
    onApply({ from: r.from, to: r.to, preset: p });
    setOpen(false);
  }

  function applyCustom() {
    onApply({ from: draftFrom, to: draftTo, preset: "custom" });
    setOpen(false);
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <Button
          type="button"
          variant="ghost"
          className="gap-1.5"
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-expanded={open}
        >
          <CalendarDays className="h-3.5 w-3.5 shrink-0" aria-hidden />
          <span className="max-w-[13rem] truncate sm:max-w-none">{label}</span>
        </Button>
        {asOfHint ? (
          <span className="text-[11px] text-muted-foreground">as of end</span>
        ) : null}
        {actions}
      </div>

      <Modal open={open} title="Period" onClose={() => setOpen(false)} size="md">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-1.5">
            {presets.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  if (opt.id === "custom") {
                    setDraftPreset("custom");
                    return;
                  }
                  applyNamedPreset(opt.id);
                }}
                className={clsx(
                  "h-8 rounded-[var(--radius-md)] px-2.5 text-xs font-medium transition",
                  draftPreset === opt.id
                    ? "bg-primary text-on-primary"
                    : "bg-muted text-foreground hover:bg-muted/80",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {draftPreset === "custom" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">From</span>
                <input
                  type="date"
                  className={clsx(controlClass, "w-full")}
                  value={draftFrom}
                  onChange={(e) => setDraftFrom(e.target.value)}
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-xs font-medium text-foreground">To</span>
                <input
                  type="date"
                  className={clsx(controlClass, "w-full")}
                  value={draftTo}
                  onChange={(e) => setDraftTo(e.target.value)}
                />
              </label>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground">
              Or choose Custom to pick exact dates.
            </p>
          )}

          <div className="flex justify-end gap-1.5 border-t border-border pt-3">
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            {draftPreset === "custom" ? (
              <Button type="button" onClick={applyCustom}>
                Apply
              </Button>
            ) : null}
          </div>
        </div>
      </Modal>
    </>
  );
}
