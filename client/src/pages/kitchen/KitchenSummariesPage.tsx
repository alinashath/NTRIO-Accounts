import { ClipboardCopy, FileImage, FileSpreadsheet, Printer, UtensilsCrossed } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, StatRow } from "@/components/design";
import { TextField } from "@/components/ui";
import {
  buildReceiptSvg,
  buildShareCardSvg,
  copyText,
  downloadPngFromSvg,
  downloadText,
  printHtml,
  toCsv,
  type ReceiptSection,
} from "@/lib/download";
import type {
  KitchenPlanDto,
  KitchenSummariesDto,
  MealPeriod,
  TableServiceRowDto,
} from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

function formatOptionSides(
  sides: Array<{ name: string; quantity: number }> | undefined,
): string | null {
  if (!sides?.length) return null;
  return sides.map((s) => `${s.name} ${s.quantity}`).join(" · ");
}

function fmtNum(n: number) {
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/\.?0+$/, "");
}

function fmtQty(n: number, unit?: string | null) {
  return unit ? `${fmtNum(n)} ${unit}` : fmtNum(n);
}

function itemType(unit?: string | null) {
  const u = (unit ?? "").trim();
  return u || "each";
}

function fmtCost(n: number | null | undefined) {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toFixed(2);
}

function mealCostCaption(m: {
  estimated_cost?: number | null;
  cost_per_serving?: number | null;
  cost_incomplete?: boolean;
}) {
  if (m.estimated_cost == null) return "Cost — set unit prices on stock refill";
  const bits = [
    `Est. ${fmtCost(m.estimated_cost)}`,
    m.cost_per_serving != null ? `${fmtCost(m.cost_per_serving)} / serving` : null,
    m.cost_incomplete ? "partial (missing prices)" : null,
  ].filter(Boolean);
  return bits.join(" · ");
}

function planSections(k: KitchenPlanDto) {
  return {
    main_meals: k.main_meals ?? [],
    by_room: k.by_room ?? [],
    prepared_needed: k.prepared_needed ?? [],
    stock_needed: k.stock_needed ?? [],
    stock_alerts: k.stock_alerts ?? [],
    estimated_meals_cost: k.estimated_meals_cost ?? null,
    meals_cost_incomplete: k.meals_cost_incomplete ?? false,
  };
}

function kitchenReceiptSections(k: KitchenPlanDto): ReceiptSection[] {
  const p = planSections(k);
  return [
    {
      heading: "Main meals",
      headers: ["Menu", "Qty", "Type"],
      rows: [
        ...p.main_meals.map((m) => [
          `${m.meal_period} · ${m.menu_name}`,
          fmtNum(m.count),
          m.estimated_cost != null ? `est ${fmtCost(m.estimated_cost)}` : "servings",
        ]),
        ...(p.estimated_meals_cost != null
          ? [[
              "Meals total cost",
              fmtCost(p.estimated_meals_cost),
              p.meals_cost_incomplete ? "partial" : "est",
            ]]
          : []),
      ],
    },
    {
      heading: "By room",
      headers: ["Room / guest", "Qty", "Type"],
      rows: p.by_room.flatMap((r) =>
        r.guests.map((g) => [
          `R${r.room_number} G${g.guest_number} · ${g.menu_name}`,
          "1",
          g.egg_style || "guest",
        ]),
      ),
    },
    {
      heading: "Prepared items needed",
      headers: ["Item", "Qty", "Type"],
      rows: p.prepared_needed.map((l) => [l.name, fmtNum(l.quantity), itemType(l.unit)]),
    },
    {
      heading: "Stock items needed",
      headers: ["Item", "Need", "In stock", "Buy", "Type"],
      rows: p.stock_needed.map((l) => [
        l.name,
        fmtNum(l.required),
        fmtNum(l.on_hand),
        fmtNum(l.to_buy ?? Math.max(0, l.required - l.on_hand)),
        itemType(l.unit),
      ]),
    },
  ];
}

function receiptTable(headers: string[], rows: string[][]) {
  const n = Math.max(headers.length, 3);
  const cls = n >= 5 ? "rcpt cols5" : "rcpt cols3";
  const head = headers
    .map((h, i) => `<th class="c${i + 1}">${h}</th>`)
    .join("");
  const body = rows.length
    ? rows
        .map((row) => {
          const cells = headers
            .map((_, i) => `<td class="c${i + 1}">${row[i] ?? "—"}</td>`)
            .join("");
          return `<tr>${cells}</tr>`;
        })
        .join("")
    : `<tr><td class="c1" colspan="${headers.length}"><span class="empty">—</span></td></tr>`;
  return `<table class="${cls}"><thead><tr>${head}</tr></thead><tbody>${body}</tbody></table>`;
}

function ActionIcon({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-sm border border-border bg-surface text-ink hover:bg-neutral-bg"
    >
      {children}
    </button>
  );
}

function SectionLabel({ children, hint }: { children: React.ReactNode; hint?: string }) {
  return (
    <div className="border-t border-border px-4 py-3">
      <p className="text-label">{children}</p>
      {hint ? <p className="mt-0.5 text-caption">{hint}</p> : null}
    </div>
  );
}

function emptyPlan(): Pick<
  KitchenPlanDto,
  | "main_meals"
  | "by_room"
  | "prepared_needed"
  | "stock_needed"
  | "stock_alerts"
  | "estimated_meals_cost"
  | "meals_cost_incomplete"
> {
  return {
    main_meals: [],
    by_room: [],
    prepared_needed: [],
    stock_needed: [],
    stock_alerts: [],
    estimated_meals_cost: null,
    meals_cost_incomplete: false,
  };
}

function kotShareText(date: string, k: KitchenPlanDto) {
  const p = planSections(k);
  return [
    `Kitchen plan — ${date}`,
    "",
    "Main meals",
    ...(p.main_meals.length
      ? p.main_meals.map((m) => {
          const eggs = m.egg_styles.map((e) => `${e.style} ${e.count}`).join(", ");
          const cost =
            m.estimated_cost != null
              ? ` · est ${fmtCost(m.estimated_cost)}${
                  m.cost_per_serving != null ? ` (${fmtCost(m.cost_per_serving)}/svc)` : ""
                }${m.cost_incomplete ? " partial" : ""}`
              : "";
          return `${m.meal_period} · ${m.menu_name} ×${m.count}${eggs ? ` (${eggs})` : ""}${cost}`;
        })
      : ["(None)"]),
    ...(p.estimated_meals_cost != null
      ? [
          `Meals total cost: ${fmtCost(p.estimated_meals_cost)}${
            p.meals_cost_incomplete ? " (partial — missing unit prices)" : ""
          }`,
        ]
      : []),
    "",
    "By room",
    ...(p.by_room.length
      ? p.by_room.flatMap((r) => [
          `Room ${r.room_number} (${r.guest_count})`,
          ...r.guests.map((g) => {
            const bits = [
              `  G${g.guest_number} ${g.serving_time}`,
              g.menu_name,
              g.egg_style,
              g.options.length ? g.options.join(", ") : null,
              g.outside_normal_window ? "OUTSIDE WINDOW" : null,
              g.special_requests,
            ].filter(Boolean);
            return bits.join(" · ");
          }),
        ])
      : ["(None)"]),
    "",
    "Prepared items needed",
    "Item | Qty | Type",
    ...(p.prepared_needed.length
      ? p.prepared_needed.map(
          (l) => `${l.name} | ${fmtNum(l.quantity)} | ${itemType(l.unit)}`,
        )
      : ["(None)"]),
    "",
    "Stock items needed (shortfalls only)",
    "Item | Need | In stock | Buy | Type",
    ...(p.stock_needed.length
      ? p.stock_needed.map((l) => {
          const buy = l.to_buy ?? Math.max(0, l.required - l.on_hand);
          return `${l.name} | ${fmtNum(l.required)} | ${fmtNum(l.on_hand)} | ${fmtNum(buy)} | ${itemType(l.unit)}`;
        })
      : ["(None — stock covers orders)"]),
  ].join("\n");
}

export function KitchenSummariesPage() {
  const [date, setDate] = useState(todayYmd);
  const [mealPeriod, setMealPeriod] = useState<MealPeriod | "all">("all");
  const [data, setData] = useState<KitchenSummariesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const q =
      mealPeriod === "all"
        ? `date=${date}`
        : `date=${date}&meal_period=${mealPeriod}`;
    const d = await apiFetch<KitchenSummariesDto>(`/api/kitchen/summaries?${q}`);
    setData(d);
  }, [date, mealPeriod]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function serverShareText() {
    if (!data) return "";
    return [
      `Server breakfast summary — ${data.date}`,
      "",
      ...data.server_summary.map((r) => {
        const sides = formatOptionSides(r.option_sides);
        return `${r.breakfast_time} · Room ${r.room_number} · ${r.menu_name ?? "Meal"} ×${r.menu_count ?? r.maldivian + r.continental}${
          sides ? ` · ${sides}` : ""
        }${r.outside_normal_window ? " · OUTSIDE WINDOW" : ""}${
          r.special_requests.length ? ` · ${r.special_requests.join("; ")}` : ""
        }`;
      }),
    ].join("\n");
  }

  function downloadServerCsv() {
    if (!data) return;
    downloadText(
      `server-summary-${date}.csv`,
      toCsv(
        [
          "Date",
          "Meal",
          "Time",
          "Room",
          "Menu",
          "Guests",
          "Options & sides",
          "Special Requests",
          "Outside Window",
        ],
        data.server_summary.map((r) => [
          r.date,
          r.meal_period ?? "",
          r.breakfast_time,
          r.room_number,
          r.menu_name ?? "",
          r.menu_count ?? r.maldivian + r.continental,
          formatOptionSides(r.option_sides) ?? "",
          r.special_requests.join("; "),
          r.outside_normal_window,
        ]),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function downloadServerPng() {
    if (!data) return;
    const svg = buildShareCardSvg({
      title: "Server breakfast summary",
      subtitle: data.date,
      rows: data.server_summary.map((r) => ({
        label: `${r.breakfast_time}  Room ${r.room_number}`,
        value: `${r.menu_name ?? "Meal"} ×${r.menu_count ?? r.maldivian + r.continental}`,
      })),
      sections: [
        {
          heading: "Details",
          lines: data.server_summary.map((r) => {
            const bits = [
              `${r.breakfast_time} R${r.room_number}`,
              formatOptionSides(r.option_sides),
              r.outside_normal_window ? "OUTSIDE WINDOW" : null,
              r.special_requests.join("; ") || null,
            ].filter(Boolean);
            return bits.join(" · ");
          }),
        },
      ],
    });
    void downloadPngFromSvg(`server-summary-${date}.png`, svg)
      .then(() => setMsg("Server summary PNG ready"))
      .catch(() => setError("PNG download failed"));
  }

  function tableRows(): TableServiceRowDto[] {
    return data?.table_service ?? [];
  }

  function formatServeLine(items: TableServiceRowDto["serve_items"]) {
    if (!items.length) return "—";
    return items.map((i) => `${i.name} ×${fmtNum(i.quantity)}`).join(" · ");
  }

  function tableServiceShareText() {
    if (!data) return "";
    const rows = tableRows();
    return [
      `Table service — ${data.date}`,
      "(What to serve on each table — portions, not stock units)",
      "",
      ...(rows.length
        ? rows.flatMap((r) => [
            `${r.serving_time} · Room ${r.room_number} · ${r.guest_count} guest${r.guest_count === 1 ? "" : "s"}`,
            `  Menus: ${r.menu_names.join(", ") || "—"}`,
            `  Cost: ${r.estimated_cost != null ? fmtCost(r.estimated_cost) : "—"}${
              r.cost_incomplete ? " (partial)" : ""
            }`,
            `  Serve: ${formatServeLine(r.serve_items)}`,
            ...(r.special_requests.length
              ? [`  Notes: ${r.special_requests.join("; ")}`]
              : []),
            ...(r.outside_normal_window ? ["  OUTSIDE WINDOW"] : []),
            "",
          ])
        : ["(No tables)"]),
    ].join("\n");
  }

  function downloadTableServiceCsv() {
    if (!data) return;
    downloadText(
      `table-service-${date}.csv`,
      toCsv(
        [
          "Date",
          "Time",
          "Room",
          "Guests",
          "Menus",
          "Cost",
          "Cost note",
          "Serve on table",
          "Special requests",
          "Outside window",
        ],
        tableRows().map((r) => [
          data.date,
          r.serving_time,
          r.room_number,
          r.guest_count,
          r.menu_names.join("; "),
          r.estimated_cost,
          r.cost_incomplete ? "partial" : "",
          formatServeLine(r.serve_items),
          r.special_requests.join("; "),
          r.outside_normal_window,
        ]),
      ),
      "text/csv;charset=utf-8",
    );
  }

  function downloadTableServicePng() {
    if (!data) return;
    const rows = tableRows();
    const svg = buildReceiptSvg({
      title: "Table service",
      subtitle: `${data.date} · serve on table (portions)`,
      sections: rows.length
        ? rows.map((r) => {
            const menus = r.menu_names.join(", ") || "—";
            const costNote = r.cost_incomplete ? "partial" : "est";
            return {
              heading: `${r.serving_time} · Room ${r.room_number}`,
              headers: ["Serve", "Qty", "Note"],
              rows: [
                ["Guests", fmtNum(r.guest_count), menus],
                [
                  "Cost",
                  r.estimated_cost != null ? fmtCost(r.estimated_cost) : "—",
                  r.estimated_cost != null ? costNote : "—",
                ],
                ...r.serve_items.map((i) => [i.name, fmtNum(i.quantity), "serve"]),
                ...(r.special_requests.length
                  ? [["Special", "—", r.special_requests.join("; ")]]
                  : []),
              ],
            };
          })
        : [{ heading: "Tables", headers: ["Serve", "Qty", "Note"], rows: [] }],
    });
    void downloadPngFromSvg(`table-service-${date}.png`, svg)
      .then(() => setMsg("Table service PNG ready"))
      .catch(() => setError("PNG download failed"));
  }

  function printTableService() {
    if (!data) return;
    const rows = tableRows();
    const blocks = rows.length
      ? rows
          .map((r) => {
            const items = r.serve_items.length
              ? `<ul>${r.serve_items
                  .map((i) => `<li>${i.name} ×${fmtNum(i.quantity)}</li>`)
                  .join("")}</ul>`
              : "<p class=\"empty\">—</p>";
            const costLine =
              r.estimated_cost != null
                ? `<p><strong>Cost</strong> ${fmtCost(r.estimated_cost)}${
                    r.cost_incomplete ? " (partial)" : ""
                  }</p>`
                : `<p><strong>Cost</strong> —</p>`;
            return `<hr class="rule"/><p class="sec">${r.serving_time} · Room ${r.room_number}</p>
              <p>${r.guest_count} guest${r.guest_count === 1 ? "" : "s"} · ${r.menu_names.join(", ") || "—"}</p>
              ${costLine}
              ${items}
              ${r.special_requests.length ? `<p>Notes: ${r.special_requests.join("; ")}</p>` : ""}
              ${r.outside_normal_window ? `<p class="flag">Outside window</p>` : ""}`;
          })
          .join("")
      : `<p class="empty">No tables</p>`;
    printHtml(
      `Table service ${date}`,
      `<h1>Table service</h1><p class="sub">${date} · what to serve on each table</p>${blocks}<hr class="rule"/>`,
      { receipt: true },
    );
  }

  function downloadKotCsv() {
    if (!data) return;
    const k = data.kitchen_plan;
    const p = planSections(k);
    const meals = toCsv(
      [
        "Section",
        "Meal period",
        "Menu",
        "Count",
        "Egg styles",
        "Est. cost",
        "Cost / serving",
        "Cost note",
      ],
      p.main_meals.map((m) => [
        "Main meals",
        m.meal_period,
        m.menu_name,
        m.count,
        m.egg_styles.map((e) => `${e.style}:${e.count}`).join("; "),
        m.estimated_cost,
        m.cost_per_serving,
        m.cost_incomplete ? "partial" : "",
      ]),
    );
    const rooms = toCsv(
      [
        "Section",
        "Room",
        "Guest",
        "Time",
        "Meal",
        "Menu",
        "Egg style",
        "Options",
        "Outside window",
        "Special requests",
      ],
      p.by_room.flatMap((r) =>
        r.guests.map((g) => [
          "By room",
          r.room_number,
          g.guest_number,
          g.serving_time,
          g.meal_period,
          g.menu_name,
          g.egg_style,
          g.options.join("; "),
          g.outside_normal_window,
          g.special_requests ?? "",
        ]),
      ),
    );
    const prepared = toCsv(
      ["Section", "Item", "Qty", "Type", "Rooms"],
      p.prepared_needed.map((l) => [
        "Prepared needed",
        l.name,
        fmtNum(l.quantity),
        itemType(l.unit),
        l.rooms.join("; "),
      ]),
    );
    const stock = toCsv(
      ["Section", "Item", "Need", "In stock", "Buy", "Type"],
      p.stock_needed.map((l) => [
        "Stock items needed",
        l.name,
        fmtNum(l.required),
        fmtNum(l.on_hand),
        fmtNum(l.to_buy ?? Math.max(0, l.required - l.on_hand)),
        itemType(l.unit),
      ]),
    );
    downloadText(
      `kitchen-plan-${date}.csv`,
      [meals, rooms, prepared, stock].join("\n\n"),
      "text/csv;charset=utf-8",
    );
  }

  function downloadKotPng() {
    if (!data) return;
    const svg = buildReceiptSvg({
      title: "Kitchen plan",
      subtitle: data.date,
      sections: kitchenReceiptSections(data.kitchen_plan),
    });
    void downloadPngFromSvg(`kitchen-plan-${date}.png`, svg)
      .then(() => setMsg("Kitchen plan PNG ready"))
      .catch(() => setError("PNG download failed"));
  }

  function printServer() {
    if (!data) return;
    const rows = data.server_summary
      .map(
        (r) =>
          `<tr><td>${r.date}</td><td>${r.meal_period ?? ""}</td><td>${r.breakfast_time}</td><td>${r.room_number}</td><td>${r.menu_name ?? ""}</td><td>${r.menu_count ?? r.maldivian + r.continental}</td><td>${formatOptionSides(r.option_sides) ?? ""}</td><td>${r.special_requests.join("; ")}</td><td>${r.outside_normal_window ? "YES" : ""}</td></tr>`,
      )
      .join("");
    printHtml(
      `Server summary ${date}`,
      `<h1>Meal summary for servers</h1><p>${date}</p><table><thead><tr><th>Date</th><th>Meal</th><th>Time</th><th>Room</th><th>Menu</th><th>Guests</th><th>Options &amp; sides</th><th>Special requests</th><th>Outside</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  function printKot() {
    if (!data) return;
    const sections = kitchenReceiptSections(data.kitchen_plan)
      .map((s) => {
        const table = receiptTable(s.headers ?? ["Item", "Qty", "Type"], s.rows);
        return `<hr class="rule"/><p class="sec">${s.heading}</p>${table}`;
      })
      .join("");
    printHtml(
      `Kitchen plan ${date}`,
      `<h1>Kitchen plan</h1><p class="sub">${date}</p>${sections}<hr class="rule"/>`,
      { receipt: true },
    );
  }

  const k = data?.kitchen_plan;
  const p = k ? planSections(k) : emptyPlan();

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Server summary &amp; kitchen plan</h1>
          <p className="mt-1 text-caption">Copy · CSV · PNG · Print</p>
        </div>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      <div className="flex flex-wrap gap-2">
        {(
          [
            { value: "all", label: "All meals" },
            { value: "breakfast", label: "Breakfast" },
            { value: "lunch", label: "Lunch" },
            { value: "dinner", label: "Dinner" },
          ] as const
        ).map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setMealPeriod(opt.value)}
            className={
              mealPeriod === opt.value
                ? "inline-flex min-h-11 items-center rounded-[var(--radius-md)] bg-ink px-3 text-sm font-semibold text-white"
                : "inline-flex min-h-11 items-center rounded-sm border border-border bg-surface px-3 text-sm font-semibold text-ink"
            }
          >
            {opt.label}
          </button>
        ))}
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard title="Meal summary for servers" caption={date}>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <ActionIcon
            label="Copy summary"
            onClick={() =>
              void copyText(serverShareText())
                .then(() => setMsg("Server summary copied"))
                .catch(() => setError("Copy failed"))
            }
          >
            <ClipboardCopy className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download CSV" onClick={downloadServerCsv}>
            <FileSpreadsheet className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download PNG" onClick={downloadServerPng}>
            <FileImage className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Print / PDF" onClick={printServer}>
            <Printer className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-border px-4 py-3">
          <p className="mr-1 text-label">Table service</p>
          <ActionIcon
            label="Copy table service"
            onClick={() =>
              void copyText(tableServiceShareText())
                .then(() => setMsg("Table service copied"))
                .catch(() => setError("Copy failed"))
            }
          >
            <ClipboardCopy className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download table service CSV" onClick={downloadTableServiceCsv}>
            <FileSpreadsheet className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download table service PNG" onClick={downloadTableServicePng}>
            <FileImage className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Print table service" onClick={printTableService}>
            <Printer className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <span className="inline-flex min-h-11 items-center gap-1 text-caption">
            <UtensilsCrossed className="h-4 w-4" strokeWidth={1.8} aria-hidden />
            Per room · time · serve on table
          </span>
        </div>
        {(data?.server_summary ?? []).length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No active orders for this date.</p>
        ) : (
          data!.server_summary.map((r, i) => (
            <ListRow
              key={i}
              primary={`${r.breakfast_time} · Room ${r.room_number}`}
              secondary={[
                r.meal_period,
                r.menu_name,
                formatOptionSides(r.option_sides),
                r.outside_normal_window ? "Outside window" : null,
                r.special_requests.join("; ") || null,
              ]
                .filter(Boolean)
                .join(" · ")}
              right={
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {r.menu_count ?? r.maldivian + r.continental}
                </span>
              }
              rightSecondary="guests"
            />
          ))
        )}
        <SectionLabel hint="Portions to place on each table — not stock units">
          Table run sheet
        </SectionLabel>
        {(data?.table_service ?? []).map((r) => (
          <ListRow
            key={`${r.meal_period}-${r.room_number}-${r.serving_time}`}
            primary={`${r.serving_time} · Room ${r.room_number}`}
            secondary={[
              `${r.guest_count} guest${r.guest_count === 1 ? "" : "s"}`,
              r.menu_names.join(", ") || null,
              r.estimated_cost != null
                ? `Cost ${fmtCost(r.estimated_cost)}${r.cost_incomplete ? " partial" : ""}`
                : "Cost —",
              formatServeLine(r.serve_items),
              r.outside_normal_window ? "Outside window" : null,
              r.special_requests.join("; ") || null,
            ]
              .filter(Boolean)
              .join(" · ")}
            right={
              r.estimated_cost != null ? (
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {fmtCost(r.estimated_cost)}
                </span>
              ) : (
                <span className="text-caption">—</span>
              )
            }
            rightSecondary="Cost"
          />
        ))}
        {data && (data.table_service ?? []).length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No table service rows.</p>
        ) : null}
      </PanelCard>

      <PanelCard title="Kitchen plan" caption={date}>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <ActionIcon
            label="Copy kitchen plan"
            onClick={() =>
              void copyText(k ? kotShareText(date, k) : "")
                .then(() => setMsg("Kitchen plan copied"))
                .catch(() => setError("Copy failed"))
            }
          >
            <ClipboardCopy className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download kitchen plan CSV" onClick={downloadKotCsv}>
            <FileSpreadsheet className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download kitchen plan PNG" onClick={downloadKotPng}>
            <FileImage className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Print / PDF" onClick={printKot}>
            <Printer className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
        </div>

        <SectionLabel hint="Menu counts and estimated ingredient cost from stock unit prices">
          Main meals
        </SectionLabel>
        {p.main_meals.map((m) => (
          <StatRow
            key={`${m.meal_period}-${m.menu_code ?? m.menu_name}`}
            label={`${m.meal_period} · ${m.menu_name}`}
            value={
              <span className="inline-flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
                <span className="text-amount-lg tabular-nums">×{m.count}</span>
                {m.estimated_cost != null ? (
                  <span className="text-sm font-semibold tabular-nums text-ink">
                    {fmtCost(m.estimated_cost)}
                  </span>
                ) : null}
              </span>
            }
            caption={[
              m.egg_styles.length
                ? m.egg_styles.map((e) => `${e.style} ${e.count}`).join(" · ")
                : null,
              mealCostCaption(m),
            ]
              .filter(Boolean)
              .join(" · ")}
          />
        ))}
        {p.estimated_meals_cost != null ? (
          <StatRow
            label="Meals total cost"
            value={
              <span className="text-amount-lg tabular-nums">{fmtCost(p.estimated_meals_cost)}</span>
            }
            caption={
              p.meals_cost_incomplete
                ? "Partial — enter unit prices when refilling stock"
                : "From stock unit prices × recipe usage"
            }
          />
        ) : p.main_meals.length > 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            Meal cost unavailable until stock refills include a unit price.
          </p>
        ) : null}
        {p.main_meals.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No main meals.</p>
        ) : null}

        <SectionLabel hint="Guests and sides per room">By room</SectionLabel>
        {p.by_room.map((r) => (
          <div key={r.room_number}>
            <ListRow
              primary={`Room ${r.room_number}`}
              secondary={`${r.guest_count} guest${r.guest_count === 1 ? "" : "s"}`}
              right={
                <span className="text-sm font-semibold tabular-nums text-ink">{r.guest_count}</span>
              }
            />
            {r.guests.map((g) => (
              <ListRow
                key={`${r.room_number}-${g.guest_number}-${g.serving_time}-${g.meal_period}`}
                primary={`Guest ${g.guest_number} · ${g.serving_time}`}
                secondary={[
                  g.meal_period,
                  g.menu_name,
                  g.egg_style,
                  g.options.length ? g.options.join(", ") : null,
                  g.outside_normal_window ? "Outside window" : null,
                  g.special_requests,
                ]
                  .filter(Boolean)
                  .join(" · ")}
                right={
                  g.outside_normal_window ? (
                    <span className="text-sm font-semibold text-debit">Flag</span>
                  ) : (
                    <span className="text-caption">—</span>
                  )
                }
              />
            ))}
          </div>
        ))}
        {p.by_room.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No rooms with orders.</p>
        ) : null}

        <SectionLabel hint="Item · Qty · Type — plated / prepared dishes (KOT)">
          Prepared items needed
        </SectionLabel>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-t border-border px-4 py-2 text-caption">
          <span>Item</span>
          <span className="text-right tabular-nums">Qty</span>
          <span className="min-w-[4.5rem] text-right">Type</span>
        </div>
        {p.prepared_needed.map((l) => (
          <div
            key={`${l.code ?? l.name}-${l.rooms.join("-")}`}
            className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-border px-4 py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium text-ink">{l.name}</p>
              {l.rooms.length ? (
                <p className="text-caption">Rooms {l.rooms.join(", ")}</p>
              ) : null}
            </div>
            <span className="text-sm font-semibold tabular-nums text-ink">{fmtNum(l.quantity)}</span>
            <span className="min-w-[4.5rem] text-right text-sm text-muted-label">{itemType(l.unit)}</span>
          </div>
        ))}
        {p.prepared_needed.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No prepared items.</p>
        ) : null}

        <SectionLabel hint="Shortfalls only — Item · Need · In stock · Buy · Type">
          Stock items needed
        </SectionLabel>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] gap-x-2 border-t border-border px-4 py-2 text-caption">
          <span>Item</span>
          <span className="min-w-[3.25rem] text-right tabular-nums">Need</span>
          <span className="min-w-[3.25rem] text-right tabular-nums">In stock</span>
          <span className="min-w-[3.25rem] text-right tabular-nums">Buy</span>
          <span className="min-w-[3.75rem] text-right">Type</span>
        </div>
        {p.stock_needed.map((l) => {
          const buy = l.to_buy ?? Math.max(0, l.required - l.on_hand);
          return (
            <div
              key={l.stock_item_id ?? l.code ?? l.name}
              className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto_auto] items-baseline gap-x-2 border-t border-border px-4 py-3"
            >
              <p className="min-w-0 truncate text-sm font-medium text-ink">{l.name}</p>
              <span className="min-w-[3.25rem] text-right text-sm font-semibold tabular-nums text-ink">
                {fmtNum(l.required)}
              </span>
              <span className="min-w-[3.25rem] text-right text-sm font-semibold tabular-nums text-ink">
                {fmtNum(l.on_hand)}
              </span>
              <span className="min-w-[3.25rem] text-right text-sm font-semibold tabular-nums text-debit">
                {fmtNum(buy)}
              </span>
              <span className="min-w-[3.75rem] text-right text-sm text-muted-label">
                {itemType(l.unit)}
              </span>
            </div>
          );
        })}
        {p.stock_needed.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">
            Stock covers these orders — nothing to buy.
          </p>
        ) : null}
      </PanelCard>
    </div>
  );
}
