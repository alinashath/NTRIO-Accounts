import { useMemo, useState } from "react";
import { SegmentedControl } from "@/components/design";
import { TextField } from "@/components/ui";

export const GST_RATE_PRESETS = [8, 16, 17] as const;

export type GstInvoiceState = {
  invoiceNumber: string;
  /** Percent; null until the section is engaged with a rate. */
  gstRate: number | null;
  gstSubtotal: string;
  gstAmount: string;
  zeroRatedAmount: string;
};

export type GstInvoicePayload = {
  invoice_number: string | null;
  gst_rate: number | null;
  gst_subtotal: number | null;
  gst_amount: number | null;
  zero_rated_amount: number | null;
};

export function emptyGstInvoiceState(): GstInvoiceState {
  return {
    invoiceNumber: "",
    gstRate: null,
    gstSubtotal: "",
    gstAmount: "",
    zeroRatedAmount: "",
  };
}

export function gstStateFromEntry(row: {
  invoice_number?: string | null;
  gst_rate?: number | null;
  gst_subtotal?: number | null;
  gst_amount?: number | null;
  zero_rated_amount?: number | null;
}): GstInvoiceState {
  return {
    invoiceNumber: row.invoice_number ?? "",
    gstRate: row.gst_rate != null ? Number(row.gst_rate) : null,
    gstSubtotal: row.gst_subtotal != null ? String(row.gst_subtotal) : "",
    gstAmount: row.gst_amount != null ? String(row.gst_amount) : "",
    zeroRatedAmount: row.zero_rated_amount != null ? String(row.zero_rated_amount) : "",
  };
}

export function hasGstData(state: GstInvoiceState): boolean {
  return (
    Boolean(state.invoiceNumber.trim()) ||
    state.gstRate != null ||
    state.gstSubtotal.trim() !== "" ||
    state.gstAmount.trim() !== "" ||
    state.zeroRatedAmount.trim() !== ""
  );
}

function parseOptionalMoney(raw: string): number | null {
  const t = raw.trim();
  if (!t) return null;
  const n = Number(t);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

export function calcGstAmount(subtotal: number, ratePercent: number): number {
  return Math.round(subtotal * (ratePercent / 100) * 100) / 100;
}

/** Subtotal + GST + zero-rated (excludes Green Tax); null when breakdown is empty. */
export function gstBreakdownTotal(state: GstInvoiceState): number | null {
  const hasAny =
    state.gstSubtotal.trim() !== "" ||
    state.gstAmount.trim() !== "" ||
    state.zeroRatedAmount.trim() !== "";
  if (!hasAny) return null;
  const sub = parseOptionalMoney(state.gstSubtotal) ?? 0;
  const gst = parseOptionalMoney(state.gstAmount) ?? 0;
  const zero = parseOptionalMoney(state.zeroRatedAmount) ?? 0;
  return Math.round((sub + gst + zero) * 100) / 100;
}

/** Parse optional money string; exported for Green Tax helpers. */
export function parseMoneyInput(raw: string): number | null {
  return parseOptionalMoney(raw);
}

/**
 * Invoice Total = GST breakdown + optional Green Tax.
 * GST taxable subtotal must exclude green tax (MIRA: no GST on Green Tax).
 */
export function invoiceBreakdownTotal(
  gst: GstInvoiceState,
  greenTaxAmount: string | number | null | undefined,
): number | null {
  const base = gstBreakdownTotal(gst);
  const green =
    typeof greenTaxAmount === "number"
      ? Number.isFinite(greenTaxAmount) && greenTaxAmount >= 0
        ? greenTaxAmount
        : null
      : typeof greenTaxAmount === "string"
        ? parseOptionalMoney(greenTaxAmount)
        : null;
  if (base == null && (green == null || green === 0)) return base;
  return Math.round(((base ?? 0) + (green ?? 0)) * 100) / 100;
}

export function validateGstBreakdown(state: GstInvoiceState): string | null {
  if (state.gstRate == null) return "Pick a GST rate.";
  if (parseOptionalMoney(state.gstSubtotal) == null) {
    return "Enter subtotal (value subject to GST).";
  }
  return null;
}

/** Always returns explicit nulls so updates can clear fields. */
export function gstStateToPayload(state: GstInvoiceState): GstInvoicePayload {
  return {
    invoice_number: state.invoiceNumber.trim() || null,
    gst_rate: state.gstRate,
    gst_subtotal: parseOptionalMoney(state.gstSubtotal),
    gst_amount: parseOptionalMoney(state.gstAmount),
    zero_rated_amount: parseOptionalMoney(state.zeroRatedAmount),
  };
}

export function emptyGstWithDefaultRate(): GstInvoiceState {
  return { ...emptyGstInvoiceState(), gstRate: 8 };
}

type RateChoice = "8" | "16" | "17" | "custom";

function rateChoiceFromValue(rate: number | null): RateChoice {
  if (rate === 8) return "8";
  if (rate === 16) return "16";
  if (rate === 17) return "17";
  if (rate != null) return "custom";
  return "8";
}

const RATE_OPTIONS = [
  { value: "8" as const, label: "8%" },
  { value: "16" as const, label: "16%" },
  { value: "17" as const, label: "17%" },
  { value: "custom" as const, label: "Custom" },
];

export function GstInvoiceFields({
  value,
  onChange,
  totalAmount,
  currencyLabel,
  disabled = false,
  defaultOpen = false,
}: {
  value: GstInvoiceState;
  onChange: (next: GstInvoiceState) => void;
  /** Current ledger Total for informational compare. */
  totalAmount?: string;
  currencyLabel?: string;
  disabled?: boolean;
  /** Open when editing a row that already has GST data. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen || hasGstData(value));
  const [gstManual, setGstManual] = useState(() => {
    if (value.gstAmount.trim() === "" || value.gstRate == null) return false;
    const sub = parseOptionalMoney(value.gstSubtotal);
    if (sub == null) return Boolean(value.gstAmount.trim());
    return parseOptionalMoney(value.gstAmount) !== calcGstAmount(sub, value.gstRate);
  });
  const [customRate, setCustomRate] = useState(() =>
    value.gstRate != null && !GST_RATE_PRESETS.includes(value.gstRate as 8 | 16 | 17)
      ? String(value.gstRate)
      : "",
  );
  const rateChoice = rateChoiceFromValue(value.gstRate);

  function patch(partial: Partial<GstInvoiceState>, opts?: { keepGstManual?: boolean }) {
    const next = { ...value, ...partial };
    const manual = opts?.keepGstManual ?? gstManual;
    if (!manual && next.gstRate != null) {
      const sub = parseOptionalMoney(next.gstSubtotal);
      if (sub != null) {
        next.gstAmount = String(calcGstAmount(sub, next.gstRate));
      }
    }
    onChange(next);
  }

  function openSection() {
    setOpen(true);
    if (value.gstRate == null && !hasGstData(value)) {
      onChange({ ...value, gstRate: 8 });
    }
  }

  const suggestedTotal = useMemo(() => {
    const sub = parseOptionalMoney(value.gstSubtotal) ?? 0;
    const gst = parseOptionalMoney(value.gstAmount) ?? 0;
    const zero = parseOptionalMoney(value.zeroRatedAmount) ?? 0;
    if (sub === 0 && gst === 0 && zero === 0 && !value.gstSubtotal && !value.gstAmount && !value.zeroRatedAmount) {
      return null;
    }
    return Math.round((sub + gst + zero) * 100) / 100;
  }, [value.gstSubtotal, value.gstAmount, value.zeroRatedAmount]);

  const ledgerTotal = parseOptionalMoney(totalAmount ?? "");
  const ccy = currencyLabel ? ` ${currencyLabel}` : "";

  if (!open) {
    return (
      <button
        type="button"
        disabled={disabled}
        onClick={openSection}
        className="flex min-h-11 w-full touch-manipulation cursor-pointer items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface px-3 text-left text-sm font-medium text-ink hover:bg-neutral-bg disabled:cursor-not-allowed disabled:opacity-60"
      >
        <span>GST / tax invoice (optional)</span>
        <span className="text-caption font-normal text-muted-label">Add</span>
      </button>
    );
  }

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-form rounded-[var(--radius-md)] border border-border bg-surface p-3 disabled:opacity-60"
    >
      <legend className="px-1 text-sm font-semibold text-ink">GST / tax invoice (optional)</legend>

      <TextField
        label="Invoice number"
        value={value.invoiceNumber}
        onChange={(e) => patch({ invoiceNumber: e.target.value }, { keepGstManual: true })}
        autoComplete="off"
      />

      <div className="space-y-1.5">
        <span className="block text-sm font-medium text-ink">GST rate</span>
        <SegmentedControl
          aria-label="GST rate"
          className="flex w-full flex-wrap"
          options={RATE_OPTIONS}
          value={rateChoice}
          onChange={(next) => {
            if (next === "custom") {
              const n = Number(customRate);
              patch({ gstRate: Number.isFinite(n) && n >= 0 ? n : 0 });
              return;
            }
            patch({ gstRate: Number(next) });
          }}
        />
        {value.gstRate == null ? (
          <p className="text-caption text-muted-label">Optional — leave blank and continue, or pick a rate.</p>
        ) : null}
        {rateChoice === "custom" ? (
          <TextField
            label="Custom rate (%)"
            type="number"
            inputMode="decimal"
            step="0.01"
            min="0"
            max="100"
            value={customRate}
            onChange={(e) => {
              setCustomRate(e.target.value);
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 100) {
                patch({ gstRate: n });
              }
            }}
            className="font-num"
          />
        ) : null}
      </div>

      <TextField
        label="Subtotal (value subject to GST)"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value.gstSubtotal}
        onChange={(e) => {
          setGstManual(false);
          patch({ gstSubtotal: e.target.value }, { keepGstManual: false });
        }}
        className="font-num"
        hint="Excluding GST and Green Tax — MIRA taxable supplies only"
      />

      <TextField
        label="Value of zero-rated supplies"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value.zeroRatedAmount}
        onChange={(e) => patch({ zeroRatedAmount: e.target.value }, { keepGstManual: true })}
        className="font-num"
      />

      <TextField
        label="GST amount"
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value.gstAmount}
        onChange={(e) => {
          setGstManual(true);
          patch({ gstAmount: e.target.value }, { keepGstManual: true });
        }}
        className="font-num"
        hint={
          value.gstRate != null && value.gstSubtotal.trim()
            ? `Auto from subtotal × ${value.gstRate}% — editable`
            : "Enter subtotal and rate to auto-calculate"
        }
      />

      {suggestedTotal != null ? (
        <p className="text-caption text-muted-label">
          Breakdown sum:{" "}
          <span className="font-num text-ink">
            {suggestedTotal.toFixed(2)}
            {ccy}
          </span>
          {ledgerTotal != null ? (
            <>
              {" "}
              · Ledger total:{" "}
              <span className="font-num text-ink">
                {ledgerTotal.toFixed(2)}
                {ccy}
              </span>
              {suggestedTotal !== ledgerTotal ? " (informational — totals need not match)" : null}
            </>
          ) : null}
        </p>
      ) : null}

      <button
        type="button"
        className="min-h-11 text-sm font-medium text-muted-label hover:text-ink"
        onClick={() => {
          if (!defaultOpen) setOpen(false);
          setGstManual(false);
          onChange(emptyGstInvoiceState());
        }}
      >
        Clear GST fields
      </button>
    </fieldset>
  );
}
