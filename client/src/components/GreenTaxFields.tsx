import { TextField } from "@/components/ui";
import { ReceiptAttachmentField } from "@/components/ReceiptAttachmentField";
import { parseMoneyInput } from "@/components/GstInvoiceFields";
import type { GreenTaxGuestCategory, GreenTaxGuestDto } from "../../../shared/types";

export type GreenTaxGuestDraft = {
  guest_reg_no: string;
  name: string;
  category: GreenTaxGuestCategory;
  identification_no: string;
  nationality: string;
  booking_method: string;
};

export type GreenTaxState = {
  /** User opted into green tax on this invoice (vs skip). */
  include: boolean;
  amount: string;
  /** datetime-local value YYYY-MM-DDTHH:mm */
  checkIn: string;
  checkOut: string;
  formUrl: string;
  guests: GreenTaxGuestDraft[];
};

export type GreenTaxPayload = {
  green_tax_amount: number | null;
  green_tax_check_in: string | null;
  green_tax_check_out: string | null;
  green_tax_form_url: string | null;
  green_tax_guests: GreenTaxGuestDto[];
};

const CATEGORY_OPTIONS: { value: GreenTaxGuestCategory; label: string }[] = [
  { value: "1", label: "1 — Taxable" },
  { value: "2", label: "2 — Maldivian" },
  { value: "3", label: "3 — Other exempt" },
];

export function emptyGreenTaxGuest(): GreenTaxGuestDraft {
  return {
    guest_reg_no: "",
    name: "",
    category: "1",
    identification_no: "",
    nationality: "",
    booking_method: "",
  };
}

export function emptyGreenTaxState(): GreenTaxState {
  return {
    include: false,
    amount: "",
    checkIn: "",
    checkOut: "",
    formUrl: "",
    guests: [],
  };
}

function guestDraftFromDto(row: GreenTaxGuestDto): GreenTaxGuestDraft {
  return {
    guest_reg_no: row.guest_reg_no ?? "",
    name: row.name ?? "",
    category: row.category === "2" || row.category === "3" ? row.category : "1",
    identification_no: row.identification_no ?? "",
    nationality: row.nationality ?? "",
    booking_method: row.booking_method ?? "",
  };
}

export function greenTaxStateFromEntry(row: {
  green_tax_amount?: number | null;
  green_tax_check_in?: string | null;
  green_tax_check_out?: string | null;
  green_tax_form_url?: string | null;
  green_tax_guests?: GreenTaxGuestDto[] | null;
}): GreenTaxState {
  const amount = row.green_tax_amount != null ? String(row.green_tax_amount) : "";
  const checkIn = toDatetimeLocal(row.green_tax_check_in);
  const checkOut = toDatetimeLocal(row.green_tax_check_out);
  const formUrl = row.green_tax_form_url ?? "";
  const guests = (row.green_tax_guests ?? []).map(guestDraftFromDto);
  const include = Boolean(amount || checkIn || checkOut || formUrl || guests.length);
  return { include, amount, checkIn, checkOut, formUrl, guests };
}

export function hasGreenTaxData(state: GreenTaxState): boolean {
  return (
    state.include &&
    (state.amount.trim() !== "" ||
      state.checkIn.trim() !== "" ||
      state.checkOut.trim() !== "" ||
      state.formUrl.trim() !== "" ||
      state.guests.some((g) => g.name.trim() || g.nationality.trim()))
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

function guestsToPayload(guests: GreenTaxGuestDraft[]): GreenTaxGuestDto[] {
  return guests
    .map((g) => ({
      guest_reg_no: g.guest_reg_no.trim() || null,
      name: g.name.trim(),
      category: g.category,
      identification_no: g.identification_no.trim() || null,
      nationality: g.nationality.trim(),
      booking_method: g.booking_method.trim() || null,
    }))
    .filter((g) => g.name && g.nationality);
}

export function greenTaxStateToPayload(state: GreenTaxState): GreenTaxPayload {
  if (!state.include) {
    return {
      green_tax_amount: null,
      green_tax_check_in: null,
      green_tax_check_out: null,
      green_tax_form_url: null,
      green_tax_guests: [],
    };
  }
  return {
    green_tax_amount: parseMoneyInput(state.amount),
    green_tax_check_in: fromDatetimeLocal(state.checkIn),
    green_tax_check_out: fromDatetimeLocal(state.checkOut),
    green_tax_form_url: state.formUrl.trim() || null,
    green_tax_guests: guestsToPayload(state.guests),
  };
}

export function validateGreenTax(
  state: GreenTaxState,
  opts?: { collectGuests?: boolean },
): string | null {
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
  if (opts?.collectGuests) {
    const filled = guestsToPayload(state.guests);
    if (filled.length === 0) {
      return "Add at least one guest with name and country (nationality).";
    }
    for (let i = 0; i < state.guests.length; i++) {
      const g = state.guests[i]!;
      const hasAny =
        g.name.trim() ||
        g.nationality.trim() ||
        g.guest_reg_no.trim() ||
        g.identification_no.trim() ||
        g.booking_method.trim();
      if (!hasAny) continue;
      if (!g.name.trim()) return `Guest ${i + 1}: enter the guest name.`;
      if (!g.nationality.trim()) return `Guest ${i + 1}: enter nationality / country.`;
    }
  }
  return null;
}

export function GreenTaxFields({
  value,
  onChange,
  userId,
  currencyLabel,
  collectGuests = false,
  disabled = false,
}: {
  value: GreenTaxState;
  onChange: (next: GreenTaxState) => void;
  userId: string;
  currencyLabel?: string;
  /** When org setting is on — show MIRA Information Sheet guest rows. */
  collectGuests?: boolean;
  disabled?: boolean;
}) {
  const ccy = currencyLabel ? ` (${currencyLabel})` : "";

  function enableGreenTax() {
    onChange({
      ...value,
      include: true,
      guests: collectGuests && value.guests.length === 0 ? [emptyGreenTaxGuest()] : value.guests,
    });
  }

  function patchGuest(index: number, patch: Partial<GreenTaxGuestDraft>) {
    const guests = value.guests.map((g, i) => (i === index ? { ...g, ...patch } : g));
    onChange({ ...value, guests });
  }

  function addGuest() {
    onChange({ ...value, guests: [...value.guests, emptyGreenTaxGuest()] });
  }

  function removeGuest(index: number) {
    const guests = value.guests.filter((_, i) => i !== index);
    onChange({
      ...value,
      guests: guests.length ? guests : collectGuests ? [emptyGreenTaxGuest()] : [],
    });
  }

  if (!value.include) {
    return (
      <div className="space-y-3">
        <p className="text-caption">
          Green Tax is optional on this invoice. GST is never charged on Green Tax — the amount is added
          outside the GST subtotal.
          {collectGuests
            ? " Guest name and country are collected for the MIRA Information Sheet."
            : null}
        </p>
        <button
          type="button"
          disabled={disabled}
          onClick={enableGreenTax}
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

      {collectGuests ? (
        <div className="space-y-3 border-t border-border pt-3">
          <div>
            <p className="text-sm font-medium text-ink">Guests (MIRA Information Sheet)</p>
            <p className="mt-0.5 text-caption">
              Name, nationality / country, and category for each guest — matching the MIRA Green Tax
              Information Sheet.
            </p>
          </div>
          {value.guests.map((guest, index) => (
            <div
              key={index}
              className="space-y-3 rounded-[var(--radius-md)] border border-border bg-ground p-3"
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-ink">Guest {index + 1}</p>
                {value.guests.length > 1 ? (
                  <button
                    type="button"
                    className="min-h-11 px-2 text-sm font-medium text-muted-label hover:text-debit"
                    onClick={() => removeGuest(index)}
                  >
                    Remove
                  </button>
                ) : null}
              </div>
              <TextField
                label="Guest name"
                value={guest.name}
                onChange={(e) => patchGuest(index, { name: e.target.value })}
                autoComplete="name"
              />
              <TextField
                label="Nationality / country"
                value={guest.nationality}
                onChange={(e) => patchGuest(index, { nationality: e.target.value })}
                placeholder="e.g. Germany, Maldives, USA"
                hint="Country of nationality as on the Information Sheet"
                autoComplete="country-name"
              />
              <label className="block w-full">
                <span className="mb-1.5 block text-sm font-medium text-ink">Category</span>
                <select
                  className="h-input w-full touch-manipulation rounded-[var(--radius-md)] border border-border bg-surface px-3 text-base text-ink focus-visible:border-info sm:text-sm"
                  value={guest.category}
                  onChange={(e) =>
                    patchGuest(index, {
                      category: (e.target.value === "2" || e.target.value === "3"
                        ? e.target.value
                        : "1") as GreenTaxGuestCategory,
                    })
                  }
                >
                  {CATEGORY_OPTIONS.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </label>
              <TextField
                label="Identification no. (optional)"
                value={guest.identification_no}
                onChange={(e) => patchGuest(index, { identification_no: e.target.value })}
                autoComplete="off"
              />
              <TextField
                label="Guest reg. no. (optional)"
                value={guest.guest_reg_no}
                onChange={(e) => patchGuest(index, { guest_reg_no: e.target.value })}
                autoComplete="off"
              />
              <TextField
                label="Booking method (optional)"
                value={guest.booking_method}
                onChange={(e) => patchGuest(index, { booking_method: e.target.value })}
                hint="As accepted by MIRAconnect when filing"
                autoComplete="off"
              />
            </div>
          ))}
          <button
            type="button"
            className="min-h-11 w-full rounded-[var(--radius-md)] border border-border bg-surface text-sm font-semibold text-ink hover:bg-neutral-bg"
            onClick={addGuest}
          >
            Add another guest
          </button>
        </div>
      ) : null}

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
