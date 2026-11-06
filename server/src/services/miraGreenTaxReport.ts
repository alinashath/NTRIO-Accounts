import type { Request } from "express";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";
import { getOrganizationTaxInfo, readPreferredOrgId } from "../lib/organization.js";

export type GreenTaxGuestReportRow = {
  income_id: string;
  income_date: string;
  invoice_number: string | null;
  description: string | null;
  guest_reg_no: string | null;
  name: string;
  category: "1" | "2" | "3";
  identification_no: string | null;
  nationality: string;
  booking_method: string | null;
  check_in: string | null;
  check_out: string | null;
  green_tax_amount: number | null;
  currency: string;
};

export type MiraGreenTaxPreview = {
  from: string;
  to: string;
  enabled: boolean;
  collect_guests: boolean;
  organization: {
    gst_tin: string | null;
    gst_registered_name: string | null;
    organization_title: string;
  };
  summary: {
    invoice_count: number;
    guest_count: number;
    total_green_tax: number;
    category_1_guests: number;
    category_2_guests: number;
    category_3_guests: number;
  };
  rows: GreenTaxGuestReportRow[];
};

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function parseGuests(raw: unknown): Array<{
  guest_reg_no: string | null;
  name: string;
  category: "1" | "2" | "3";
  identification_no: string | null;
  nationality: string;
  booking_method: string | null;
}> {
  if (!Array.isArray(raw)) return [];
  const out: ReturnType<typeof parseGuests> = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const name = String(row.name ?? "").trim();
    const nationality = String(row.nationality ?? "").trim();
    if (!name && !nationality) continue;
    const cat = String(row.category ?? "1");
    out.push({
      guest_reg_no: String(row.guest_reg_no ?? "").trim() || null,
      name: name || "—",
      category: cat === "2" || cat === "3" ? cat : "1",
      identification_no: String(row.identification_no ?? "").trim() || null,
      nationality: nationality || "—",
      booking_method: String(row.booking_method ?? "").trim() || null,
    });
  }
  return out;
}

function inPeriod(isoDate: string, from: string, to: string) {
  return isoDate >= from && isoDate <= to;
}

/** Period key for filing: check-out date when set, else income earned date. */
function periodKey(checkOut: Date | null, incomeDate: Date): string {
  return checkOut ? ymd(checkOut) : ymd(incomeDate);
}

export async function buildMiraGreenTaxPreview(
  dataUserId: string,
  from: string,
  to: string,
  req?: Request,
): Promise<MiraGreenTaxPreview> {
  const preferred = req ? readPreferredOrgId(req) : null;
  const tax = await getOrganizationTaxInfo(dataUserId, preferred);

  if (!tax.green_tax_enabled) {
    return {
      from,
      to,
      enabled: false,
      collect_guests: false,
      organization: {
        gst_tin: tax.gst_tin,
        gst_registered_name: tax.gst_registered_name,
        organization_title: tax.organization_title,
      },
      summary: {
        invoice_count: 0,
        guest_count: 0,
        total_green_tax: 0,
        category_1_guests: 0,
        category_2_guests: 0,
        category_3_guests: 0,
      },
      rows: [],
    };
  }

  const entries = await prisma.incomeEntry.findMany({
    where: {
      userId: dataUserId,
      deletedAt: null,
      voidedAt: null,
      OR: [
        { greenTaxAmount: { not: null } },
        { greenTaxCheckIn: { not: null } },
        { greenTaxCheckOut: { not: null } },
        { greenTaxFormUrl: { not: null } },
        { NOT: { greenTaxGuests: { equals: [] } } },
      ],
    },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    select: {
      id: true,
      date: true,
      currency: true,
      description: true,
      invoiceNumber: true,
      amount: true,
      greenTaxAmount: true,
      greenTaxCheckIn: true,
      greenTaxCheckOut: true,
      greenTaxGuests: true,
    },
  });

  const rows: GreenTaxGuestReportRow[] = [];
  let invoiceCount = 0;
  let totalGreenTax = 0;
  let cat1 = 0;
  let cat2 = 0;
  let cat3 = 0;

  for (const e of entries) {
    const key = periodKey(e.greenTaxCheckOut, e.date);
    if (!inPeriod(key, from, to)) continue;

    invoiceCount += 1;
    const greenAmt = e.greenTaxAmount != null ? toMoney(Number(e.greenTaxAmount)) : null;
    if (greenAmt != null) totalGreenTax = toMoney(totalGreenTax + greenAmt);

    const guests = parseGuests(e.greenTaxGuests);
    const checkIn = e.greenTaxCheckIn ? e.greenTaxCheckIn.toISOString() : null;
    const checkOut = e.greenTaxCheckOut ? e.greenTaxCheckOut.toISOString() : null;

    if (guests.length === 0) {
      rows.push({
        income_id: e.id,
        income_date: ymd(e.date),
        invoice_number: e.invoiceNumber,
        description: e.description,
        guest_reg_no: null,
        name: e.description?.trim() || "Green Tax (no guest rows)",
        category: "1",
        identification_no: null,
        nationality: "—",
        booking_method: null,
        check_in: checkIn,
        check_out: checkOut,
        green_tax_amount: greenAmt,
        currency: e.currency,
      });
      cat1 += 1;
      continue;
    }

    guests.forEach((g, guestIndex) => {
      if (g.category === "2") cat2 += 1;
      else if (g.category === "3") cat3 += 1;
      else cat1 += 1;
      rows.push({
        income_id: e.id,
        income_date: ymd(e.date),
        invoice_number: e.invoiceNumber,
        description: e.description,
        guest_reg_no: g.guest_reg_no,
        name: g.name,
        category: g.category,
        identification_no: g.identification_no,
        nationality: g.nationality,
        booking_method: g.booking_method,
        check_in: checkIn,
        check_out: checkOut,
        // Invoice-level amount once — avoid double-counting in the sheet.
        green_tax_amount: guestIndex === 0 ? greenAmt : null,
        currency: e.currency,
      });
    });
  }

  return {
    from,
    to,
    enabled: true,
    collect_guests: tax.green_tax_collect_guests,
    organization: {
      gst_tin: tax.gst_tin,
      gst_registered_name: tax.gst_registered_name,
      organization_title: tax.organization_title,
    },
    summary: {
      invoice_count: invoiceCount,
      guest_count: rows.length,
      total_green_tax: totalGreenTax,
      category_1_guests: cat1,
      category_2_guests: cat2,
      category_3_guests: cat3,
    },
    rows,
  };
}

/** CSV content matching MIRA Information Sheet columns (simplified). */
export function miraGreenTaxPreviewToCsv(preview: MiraGreenTaxPreview): string {
  const headers = [
    "Guest Reg. No.",
    "Name",
    "Category",
    "Identification No.",
    "Nationality",
    "Booking Method",
    "Check-in Date",
    "Check-in Time",
    "Check-out Date",
    "Check-out Time",
    "Green Tax Amount",
    "Currency",
    "Invoice No.",
    "Income Date",
    "Description",
  ];

  const escape = (v: string | number | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const splitDt = (iso: string | null) => {
    if (!iso) return { date: "", time: "" };
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { date: "", time: "" };
    const pad = (n: number) => String(n).padStart(2, "0");
    return {
      date: `${pad(d.getUTCDate())}-${pad(d.getUTCMonth() + 1)}-${d.getUTCFullYear()}`,
      time: `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`,
    };
  };

  const lines = [headers.join(",")];
  for (const r of preview.rows) {
    const cin = splitDt(r.check_in);
    const cout = splitDt(r.check_out);
    lines.push(
      [
        r.guest_reg_no,
        r.name,
        r.category,
        r.identification_no,
        r.nationality,
        r.booking_method,
        cin.date,
        cin.time,
        cout.date,
        cout.time,
        r.green_tax_amount,
        r.currency,
        r.invoice_number,
        r.income_date,
        r.description,
      ]
        .map(escape)
        .join(","),
    );
  }
  return lines.join("\n");
}
