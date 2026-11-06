import { TextField } from "@/components/ui";
import { ReceiptAttachmentField } from "@/components/ReceiptAttachmentField";
import { parseMoneyInput } from "@/components/GstInvoiceFields";

export type GreenTaxState = {
  /** User opted into green tax on this invoice (vs skip). */
  include: boolean;
  amount: string;
  /** datetime-local value YYYY-MM-DDTHH:mm */
  checkIn: string;
  checkOut: string;
  formUrl: string;
};

export type GreenTaxPayload = {
  green_tax_amount: number | null;
  green_tax_check_in: string | null;
  green_tax_check_out: string | null;
  green_tax_form_url: string | null;
};

export function emptyGreenTaxState(): GreenTaxState {
  return {
    include: false,
    amount: "",
    checkIn: "",
    checkOut: "",
    formUrl: "",
  };
}

export function greenTaxStateFromEntry(row: {
  green_tax_amount?: number | null;
  green_tax_check_in?: string | null;
  green_tax_check_out?: string | null;
  green_tax_form_url?: string | null;
}): GreenTaxState {
  const amount = row.green_tax_amount != null ? String(row.green_tax_amount) : "";
  const checkIn = toDatetimeLocal(row.green_tax_check_in);
  const checkOut = toDatetimeLocal(row.green_tax_check_out);
  const formUrl = row.green_tax_form_url ?? "";
  const include = Boolean(amount || checkIn || checkOut || formUrl);
  return { include, amount, checkIn, checkOut, formUrl };
}

export function hasGreenTaxData(state: GreenTaxState): boolean {
  return (
    state.include &&
    (state.amount.trim() !== "" ||
      state.checkIn.trim() !== "" ||
      state.checkOut.trim() !== "" ||
      state.formUrl.trim() !== "")
  );
}

/** Convert API ISO / Date string to datetime-local input value. */
export function toDatetimeLocal(raw: string | null | undefined): string {
  if (!raw?.trim()) return "";
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) {
    // Already local-ish "YYYY-MM-DDTHH:mm"
    if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(raw)) return raw.slice(0, 16);
    return "";
  }
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** datetime-local → ISO string for API, or null. */
export function fromDatetimeLocal(raw: string): string | null {
  const t = raw.trim();
  if (!t) return null;
  const d = new Date(t);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

export function greenTaxStateToPayload(state: GreenTaxState): GreenTaxPayload {
  if (!state.include) {
    return {
      green_tax_amount: null,
      green_tax_check_in: null,
      green_tax_check_out: null,
      green_tax_form_url: null,
    };
  }
  return {
    green_tax_amount: parseMoneyInput(state.amount),
    green_tax_check_in: fromDatetimeLocal(state.checkIn),
    green_tax_check_out: fromDatetimeLocal(state.checkOut),
    green_tax_form_url: state.formUrl.trim() || null,
  };
}

export function validateGreenTax(state: GreenTaxState): string | null {
  if (!state.include) return null;
  if (parseMoneyInput(state.amount) == null) {
    return "Enter a Green Tax amount, or choose Skip.";
  }
  if (state.checkIn && state.checkOut) {
    const a = new Date(state.checkIn).getTime();
    const b = new Date(state.checkOut).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b < a) {
      return "Check-out must be on or after check-in.";
    }
  }
  return null;
}

export function GreenTaxFields({
  value,
  onChange,
  userId,
  currencyLabel,
  disabled = false,
}: {
  value: GreenTaxState;
  onChange: (next: GreenTaxState) => void;
  userId: string;
  currencyLabel?: string;
  disabled?: boolean;
}) {
  const ccy = currencyLabel ? ` (${currencyLabel})` : "";

  if (!value.include) {
    return (
      <div className="space-y-3">
        <p className="text-caption">
          Green Tax is optional on this invoice. GST is never charged on Green Tax — the amount is added
          outside the GST subtotal.
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={() => onChange({ ...value, include: true })}
          className="flex min-h-11 w-full touch-manipulation cursor-pointer items-center justify-between rounded-[var(--radius-md)] border border-border bg-surface px-3 text-left text-sm font-medium text-ink hover:bg-neutral-bg disabled:cursor-not-allowed disabled:opacity-60"
        >
          <span>Add Green Tax</span>
          <span className="text-caption font-normal text-muted-label">Optional</span>
        </button>
      </div>
    );
  }

  return (
    <fieldset
      disabled={disabled}
      className="flex flex-col gap-form rounded-[var(--radius-md)] border border-border bg-surface p-3 disabled:opacity-60"
    >
      <legend className="px-1 text-sm font-semibold text-ink">Green Tax (optional)</legend>
      <p className="text-caption">
        Check-in / check-out for this stay. Amount is excluded from GST taxable subtotal and included in
        invoice Total. Upload a filled MIRA 501 / Information Sheet if you have one.
      </p>

      <TextField
        label="Check-in"
        type="datetime-local"
        value={value.checkIn}
        onChange={(e) => onChange({ ...value, checkIn: e.target.value })}
      />
      <TextField
        label="Check-out"
        type="datetime-local"
        value={value.checkOut}
        onChange={(e) => onChange({ ...value, checkOut: e.target.value })}
      />
      <TextField
        label={`Green Tax amount${ccy}`}
        type="number"
        inputMode="decimal"
        step="0.01"
        min="0"
        value={value.amount}
        onChange={(e) => onChange({ ...value, amount: e.target.value })}
        className="font-num"
        hint="Not subject to GST — added to Total only"
      />

      <div className="space-y-2">
        <p className="text-sm font-medium text-ink">MIRA Green Tax form (optional)</p>
        <ReceiptAttachmentField
          attachmentUrl={value.formUrl}
          onAttachmentUrlChange={(url) => onChange({ ...value, formUrl: url })}
          userId={userId}
          disabled={disabled}
          label="MIRA form file (optional)"
          urlLabel="Form URL (optional — paste if not uploading)"
        />
      </div>

      <button
        type="button"
        className="min-h-11 text-sm font-medium text-muted-label hover:text-ink"
        onClick={() => onChange(emptyGreenTaxState())}
      >
        Clear / skip Green Tax
      </button>
    </fieldset>
  );
}
