import ExcelJS from "exceljs";
import type { Request } from "express";
import {
  mapOrganizationTaxInfo,
  parseTaxableActivities,
  readPreferredOrgId,
  type OrganizationTaxInfoDto,
} from "../lib/organization.js";
import { prisma } from "../lib/prisma.js";
import { toMoney } from "../lib/money.js";

/** MIRA Input Tax Statement v25.1 rate columns (TaxMaldives mapping). */
export const MIRA_RATE_COLUMNS = [6, 8, 12, 16, 17] as const;
export type MiraRate = (typeof MIRA_RATE_COLUMNS)[number];

const RATE_TOLERANCE = 0.6;

export function matchMiraRate(rate: number | null | undefined): MiraRate | null {
  if (rate == null || !Number.isFinite(rate)) return null;
  let best: MiraRate = MIRA_RATE_COLUMNS[0];
  let bestDiff = Math.abs(best - rate);
  for (const r of MIRA_RATE_COLUMNS) {
    const d = Math.abs(r - rate);
    if (d < bestDiff) {
      best = r;
      bestDiff = d;
    }
  }
  return bestDiff <= RATE_TOLERANCE ? best : null;
}

function ymd(d: Date) {
  return d.toISOString().slice(0, 10);
}

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? toMoney(n) : null;
}

function hasGstBreakdown(row: {
  invoiceNumber: string | null;
  gstRate: unknown;
  gstSubtotal: unknown;
  gstAmount: unknown;
  zeroRatedAmount: unknown;
}) {
  return (
    Boolean(row.invoiceNumber?.trim()) ||
    row.gstRate != null ||
    row.gstSubtotal != null ||
    row.gstAmount != null ||
    row.zeroRatedAmount != null
  );
}

export type MiraGstLineDto = {
  id: string;
  counterparty_tin: string | null;
  counterparty_name: string;
  invoice_number: string | null;
  invoice_date: string;
  invoice_total: number;
  currency: string;
  gst_rate: number | null;
  mira_rate_bucket: MiraRate | null;
  taxable_value: number | null;
  gst_amount: number | null;
  zero_rated_amount: number | null;
  description: string | null;
};

export type MiraGstPreviewDto = {
  from: string;
  to: string;
  organization: OrganizationTaxInfoDto & {
    organization_title: string | null;
  };
  input: {
    row_count: number;
    total_invoice: number;
    total_gst: number;
    total_zero_rated: number;
    rows: MiraGstLineDto[];
  };
  output: {
    row_count: number;
    total_invoice: number;
    total_gst: number;
    total_zero_rated: number;
    rows: MiraGstLineDto[];
  };
};

const EMPTY_ORG_TAX: OrganizationTaxInfoDto & { organization_title: string | null } = {
  organization_title: null,
  gst_tin: null,
  gst_registered_name: null,
  gst_return_currency: "MVR",
  taxable_activities: [],
  green_tax_enabled: false,
  green_tax_collect_guests: false,
};

/** Resolve org GST fields for the active workspace (preferred header, else data owner's active org). */
export async function loadMiraOrgTaxInfo(
  dataUserId: string,
  req?: Request,
): Promise<OrganizationTaxInfoDto & { organization_title: string | null }> {
  const preferred = req ? readPreferredOrgId(req) : null;
  let orgId = preferred;
  if (!orgId) {
    const user = await prisma.user.findUnique({
      where: { id: dataUserId },
      select: { organizationId: true },
    });
    orgId = user?.organizationId ?? null;
  }
  if (!orgId) {
    const membership = await prisma.organizationMember.findFirst({
      where: { userId: dataUserId },
      orderBy: { createdAt: "asc" },
      select: { organizationId: true },
    });
    orgId = membership?.organizationId ?? null;
  }
  if (!orgId) return { ...EMPTY_ORG_TAX };

  const org = await prisma.organization.findUnique({
    where: { id: orgId },
    select: {
      title: true,
      gstTin: true,
      gstRegisteredName: true,
      gstReturnCurrency: true,
      taxableActivities: true,
    },
  });
  if (!org) return { ...EMPTY_ORG_TAX };

  return {
    organization_title: org.title?.trim() || null,
    ...mapOrganizationTaxInfo(org),
  };
}

function defaultTaxableActivityNo(tax: OrganizationTaxInfoDto): string {
  return parseTaxableActivities(tax.taxable_activities)[0]?.number ?? "";
}

async function loadInputLines(userId: string, from: Date, to: Date): Promise<MiraGstLineDto[]> {
  const rows = await prisma.expenseEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      voidedAt: null,
      billDate: { gte: from, lte: to },
      OR: [
        { invoiceNumber: { not: null } },
        { gstRate: { not: null } },
        { gstSubtotal: { not: null } },
        { gstAmount: { not: null } },
        { zeroRatedAmount: { not: null } },
      ],
    },
    include: { contact: true, account: true, debt: true },
    orderBy: [{ billDate: "asc" }, { createdAt: "asc" }],
  });

  return rows.filter(hasGstBreakdown).map((r) => {
    const rate = num(r.gstRate);
    const currency = r.payLater
      ? r.billCurrency
      : (r.account?.currency ?? r.debt?.currency ?? "USD");
    return {
      id: r.id,
      counterparty_tin: r.contact?.tgstNumber?.trim() || null,
      counterparty_name: r.contact?.name?.trim() || r.merchant?.trim() || "—",
      invoice_number: r.invoiceNumber?.trim() || null,
      invoice_date: ymd(r.billDate),
      invoice_total: toMoney(Number(r.amount)),
      currency,
      gst_rate: rate,
      mira_rate_bucket: matchMiraRate(rate),
      taxable_value: num(r.gstSubtotal),
      gst_amount: num(r.gstAmount),
      zero_rated_amount: num(r.zeroRatedAmount),
      description: r.description,
    };
  });
}

async function loadOutputLines(userId: string, from: Date, to: Date): Promise<MiraGstLineDto[]> {
  const rows = await prisma.incomeEntry.findMany({
    where: {
      userId,
      deletedAt: null,
      voidedAt: null,
      date: { gte: from, lte: to },
      OR: [
        { invoiceNumber: { not: null } },
        { gstRate: { not: null } },
        { gstSubtotal: { not: null } },
        { gstAmount: { not: null } },
        { zeroRatedAmount: { not: null } },
      ],
    },
    include: { contact: true, account: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });

  return rows.filter(hasGstBreakdown).map((r) => {
    const rate = num(r.gstRate);
    return {
      id: r.id,
      counterparty_tin: r.contact?.tgstNumber?.trim() || null,
      counterparty_name: r.contact?.name?.trim() || r.source?.trim() || "—",
      invoice_number: r.invoiceNumber?.trim() || null,
      invoice_date: ymd(r.date),
      invoice_total: toMoney(Number(r.amount)),
      currency: r.currency,
      gst_rate: rate,
      mira_rate_bucket: matchMiraRate(rate),
      taxable_value: num(r.gstSubtotal),
      gst_amount: num(r.gstAmount),
      zero_rated_amount: num(r.zeroRatedAmount),
      description: r.description,
    };
  });
}

function sumField(rows: MiraGstLineDto[], key: "invoice_total" | "gst_amount" | "zero_rated_amount") {
  return toMoney(rows.reduce((a, r) => a + (r[key] ?? 0), 0));
}

export async function buildMiraGstPreview(
  userId: string,
  fromYmd: string,
  toYmd: string,
  req?: Request,
): Promise<MiraGstPreviewDto> {
  const from = new Date(`${fromYmd}T00:00:00Z`);
  const to = new Date(`${toYmd}T00:00:00Z`);
  const [input, output, organization] = await Promise.all([
    loadInputLines(userId, from, to),
    loadOutputLines(userId, from, to),
    loadMiraOrgTaxInfo(userId, req),
  ]);

  return {
    from: fromYmd,
    to: toYmd,
    organization,
    input: {
      row_count: input.length,
      total_invoice: sumField(input, "invoice_total"),
      total_gst: sumField(input, "gst_amount"),
      total_zero_rated: sumField(input, "zero_rated_amount"),
      rows: input,
    },
    output: {
      row_count: output.length,
      total_invoice: sumField(output, "invoice_total"),
      total_gst: sumField(output, "gst_amount"),
      total_zero_rated: sumField(output, "zero_rated_amount"),
      rows: output,
    },
  };
}

function styleHeader(row: ExcelJS.Row) {
  row.font = { bold: true };
  row.alignment = { vertical: "middle", wrapText: true };
}

function rateValues(line: MiraGstLineDto): Record<MiraRate, number | null> {
  const out: Record<MiraRate, number | null> = {
    6: null,
    8: null,
    12: null,
    16: null,
    17: null,
  };
  if (line.mira_rate_bucket != null && line.taxable_value != null) {
    out[line.mira_rate_bucket] = line.taxable_value;
  }
  return out;
}

function orgHeaderLine(org: OrganizationTaxInfoDto & { organization_title: string | null }) {
  const name = org.gst_registered_name || org.organization_title || "";
  const tin = org.gst_tin || "";
  const parts = [
    name ? `Taxpayer: ${name}` : null,
    tin ? `TIN: ${tin}` : null,
    `Return currency: ${org.gst_return_currency || "MVR"}`,
  ].filter(Boolean);
  return parts.join(" · ");
}

function addInputSheet(
  wb: ExcelJS.Workbook,
  lines: MiraGstLineDto[],
  from: string,
  to: string,
  org: OrganizationTaxInfoDto & { organization_title: string | null },
) {
  const ws = wb.addWorksheet("Input Tax Statement", {
    views: [{ state: "frozen", ySplit: 4 }],
  });

  ws.addRow(["Maldives MIRA — Input Tax Statement (purchase / expense invoices)"]);
  ws.addRow([orgHeaderLine(org)]);
  ws.addRow([`Taxable period: ${from} to ${to}`, "", "", "Aligned to Input Tax Statement v25.1 rate columns"]);
  ws.mergeCells("A1:N1");
  ws.mergeCells("A2:N2");
  ws.getRow(1).font = { bold: true, size: 14 };

  const header = ws.addRow([
    "No.",
    "Supplier TIN",
    "Supplier Name",
    "Invoice No.",
    "Invoice Date",
    "Invoice Total",
    "Value at 6%",
    "Value at 8%",
    "Value at 12%",
    "Value at 16%",
    "Value at 17%",
    "GST Amount",
    "Value of Zero-Rated Supplies",
    "Currency",
    "Recorded rate %",
    "Description",
  ]);
  styleHeader(header);

  lines.forEach((line, i) => {
    const rates = rateValues(line);
    ws.addRow([
      i + 1,
      line.counterparty_tin ?? "",
      line.counterparty_name,
      line.invoice_number ?? "",
      line.invoice_date,
      line.invoice_total,
      rates[6],
      rates[8],
      rates[12],
      rates[16],
      rates[17],
      line.gst_amount,
      line.zero_rated_amount,
      line.currency,
      line.gst_rate,
      line.description ?? "",
    ]);
  });

  ws.columns = [
    { width: 6 },
    { width: 16 },
    { width: 28 },
    { width: 16 },
    { width: 14 },
    { width: 14 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 10 },
    { width: 12 },
    { width: 28 },
  ];
}

function addOutputSheet(
  wb: ExcelJS.Workbook,
  lines: MiraGstLineDto[],
  from: string,
  to: string,
  org: OrganizationTaxInfoDto & { organization_title: string | null },
) {
  const ws = wb.addWorksheet("Output Tax Statement", {
    views: [{ state: "frozen", ySplit: 4 }],
  });
  const activityNo = defaultTaxableActivityNo(org);

  ws.addRow(["Maldives MIRA — Output Tax Statement (sales / income invoices)"]);
  ws.addRow([orgHeaderLine(org)]);
  ws.addRow([
    `Taxable period: ${from} to ${to}`,
    "",
    "",
    "Include tax invoices to GST-registered customers (TIN on contact)",
  ]);
  ws.mergeCells("A1:N1");
  ws.mergeCells("A2:N2");
  ws.getRow(1).font = { bold: true, size: 14 };

  const header = ws.addRow([
    "No.",
    "Customer TIN",
    "Customer Name",
    "Invoice No.",
    "Invoice Date",
    "Your Taxable Activity No.",
    "Value at 6%",
    "Value at 8%",
    "Value at 12%",
    "Value at 16%",
    "Value at 17%",
    "GST Amount",
    "Value of Zero-Rated Supplies",
    "Invoice Total",
    "Currency",
    "Recorded rate %",
    "Description",
  ]);
  styleHeader(header);

  lines.forEach((line, i) => {
    const rates = rateValues(line);
    ws.addRow([
      i + 1,
      line.counterparty_tin ?? "",
      line.counterparty_name,
      line.invoice_number ?? "",
      line.invoice_date,
      activityNo,
      rates[6],
      rates[8],
      rates[12],
      rates[16],
      rates[17],
      line.gst_amount,
      line.zero_rated_amount,
      line.invoice_total,
      line.currency,
      line.gst_rate,
      line.description ?? "",
    ]);
  });

  ws.columns = [
    { width: 6 },
    { width: 16 },
    { width: 28 },
    { width: 16 },
    { width: 14 },
    { width: 18 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 12 },
    { width: 18 },
    { width: 14 },
    { width: 10 },
    { width: 12 },
    { width: 28 },
  ];
}

function addNotesSheet(
  wb: ExcelJS.Workbook,
  org: OrganizationTaxInfoDto & { organization_title: string | null },
) {
  const ws = wb.addWorksheet("Notes");
  ws.addRow(["About this export"]);
  ws.getRow(1).font = { bold: true, size: 14 };
  ws.addRow([]);
  ws.addRow([
    "This workbook is generated from EffiBooks income/expense GST fields to help prepare MIRA Input and Output Tax Statements.",
  ]);
  ws.addRow([
    "Rate columns follow Input Tax Statement v25.1 layout (6%, 8%, 12%, 16%, 17%). Taxable value (excl. GST) is placed in the matching rate column.",
  ]);
  ws.addRow([
    "Organization TIN, registered name, and taxable activity numbers come from Settings → Organization. Update them there if blank.",
  ]);
  ws.addRow([
    `Configured TIN: ${org.gst_tin || "(not set)"} · Default taxable activity: ${defaultTaxableActivityNo(org) || "(not set)"}`,
  ]);
  if (org.taxable_activities.length) {
    ws.addRow([
      `All taxable activities: ${org.taxable_activities
        .map((a) => (a.name ? `${a.number} (${a.name})` : a.number))
        .join(", ")}`,
    ]);
  }
  ws.addRow([
    "Review Supplier/Customer TIN (contact TGST number), invoice numbers, and Your Taxable Activity No. before filing on MIRAconnect.",
  ]);
  ws.addRow([
    "Only entries with GST / invoice fields filled in the period are included. Blank TIN rows may need excluding for Output Tax (registered customers only).",
  ]);
  ws.addRow([
    "Official templates: https://www.mira.gov.mv — download the current Input/Output Tax Statement workbooks and copy rows if MIRA requires an exact template version.",
  ]);
  ws.addRow([
    "Maldives Green Tax (if captured on income invoices) is excluded from GST taxable subtotal — GST is not charged on Green Tax. Use Reports → Green Tax for Information Sheet guest rows and CSV export.",
  ]);
  ws.getColumn(1).width = 120;
}

export async function buildMiraGstWorkbook(
  userId: string,
  fromYmd: string,
  toYmd: string,
  req?: Request,
): Promise<ExcelJS.Buffer> {
  const preview = await buildMiraGstPreview(userId, fromYmd, toYmd, req);
  const wb = new ExcelJS.Workbook();
  wb.creator = "EffiBooks / NTRIO Accounts";
  wb.created = new Date();
  addInputSheet(wb, preview.input.rows, fromYmd, toYmd, preview.organization);
  addOutputSheet(wb, preview.output.rows, fromYmd, toYmd, preview.organization);
  addNotesSheet(wb, preview.organization);
  return wb.xlsx.writeBuffer();
}
