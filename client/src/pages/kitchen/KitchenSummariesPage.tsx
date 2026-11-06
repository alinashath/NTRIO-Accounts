import { ClipboardCopy, FileImage, FileSpreadsheet, Printer } from "lucide-react";
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
import type { KitchenPlanDto, KitchenSummariesDto, MealPeriod } from "../../../../shared/types";

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

function planSections(k: KitchenPlanDto) {
  return {
    main_meals: k.main_meals ?? [],
    by_room: k.by_room ?? [],
    prepared_needed: k.prepared_needed ?? [],
    stock_needed: k.stock_needed ?? [],
    stock_alerts: k.stock_alerts ?? [],
  };
}

function row3(a: string, b: string, c: string): [string, string, string] {
  return [a, b, c];
}

function kitchenReceiptSections(k: KitchenPlanDto): ReceiptSection[] {
  const p = planSections(k);
  return [
    {
      heading: "Main meals",
      headers: ["Menu", "Qty", "Type"],
      rows: p.main_meals.map((m) =>
        row3(`${m.meal_period} · ${m.menu_name}`, fmtNum(m.count), "servings"),
      ),
    },
    {
      heading: "By room",
      headers: ["Room / guest", "Qty", "Type"],
      rows: p.by_room.flatMap((r) =>
        r.guests.map((g) =>
          row3(`R${r.room_number} G${g.guest_number} · ${g.menu_name}`, "1", g.egg_style || "guest"),
        ),
      ),
    },
    {
      heading: "Prepared items needed",
      headers: ["Item", "Qty", "Type"],
      rows: p.prepared_needed.map((l) => row3(l.name, fmtNum(l.quantity), itemType(l.unit))),
    },
    {
      heading: "Stock items needed",
      headers: ["Item", "In stock", "Buy"],
      rows: p.stock_needed.map((l) =>
        row3(
          `${l.name} (${itemType(l.unit)})`,
          fmtNum(l.on_hand),
          fmtNum(l.to_buy ?? Math.max(0, l.required - l.on_hand)),
        ),
      ),
    },
  ];
}

function receiptTable(headers: [string, string, string], rows: Array<[string, string, string]>) {
  const body = rows.length
    ? rows
        .map(
          ([a, b, c]) =>
            `<tr><td class="c1">${a}</td><td class="c2">${b}</td><td class="c3">${c}</td></tr>`,
        )
        .join("")
    : `<tr><td class="c1" colspan="3"><span class="empty">—</span></td></tr>`;
  return `<table class="rcpt"><thead><tr><th class="c1">${headers[0]}</th><th class="c2">${headers[1]}</th><th class="c3">${headers[2]}</th></tr></thead><tbody>${body}</tbody></table>`;
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
  "main_meals" | "by_room" | "prepared_needed" | "stock_needed" | "stock_alerts"
> {
  return {
    main_meals: [],
    by_room: [],
    prepared_needed: [],
    stock_needed: [],
    stock_alerts: [],
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
          return `${m.meal_period} · ${m.menu_name} ×${m.count}${eggs ? ` (${eggs})` : ""}`;
        })
      : ["(None)"]),
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
    "Item | In stock | Buy",
    ...(p.stock_needed.length
      ? p.stock_needed.map((l) => {
          const buy = l.to_buy ?? Math.max(0, l.required - l.on_hand);
          return `${l.name} (${itemType(l.unit)}) | ${fmtNum(l.on_hand)} | ${fmtNum(buy)}`;
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

  function downloadKotCsv() {
    if (!data) return;
    const k = data.kitchen_plan;
    const p = planSections(k);
    const meals = toCsv(
      ["Section", "Meal period", "Menu", "Count", "Egg styles"],
      p.main_meals.map((m) => [
        "Main meals",
        m.meal_period,
        m.menu_name,
        m.count,
        m.egg_styles.map((e) => `${e.style}:${e.count}`).join("; "),
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
      ["Section", "Item", "Type", "In stock", "Buy", "Need"],
      p.stock_needed.map((l) => [
        "Stock items needed",
        l.name,
        itemType(l.unit),
        fmtNum(l.on_hand),
        fmtNum(l.to_buy ?? Math.max(0, l.required - l.on_hand)),
        fmtNum(l.required),
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

        <SectionLabel hint="Menu counts for this date / meal filter">Main meals</SectionLabel>
        {p.main_meals.map((m) => (
          <StatRow
            key={`${m.meal_period}-${m.menu_code ?? m.menu_name}`}
            label={`${m.meal_period} · ${m.menu_name}`}
            value={<span className="text-amount-lg tabular-nums">×{m.count}</span>}
            caption={
              m.egg_styles.length
                ? m.egg_styles.map((e) => `${e.style} ${e.count}`).join(" · ")
                : undefined
            }
          />
        ))}
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

        <SectionLabel hint="Shortfalls only — Item · In stock · Buy">
          Stock items needed
        </SectionLabel>
        <div className="grid grid-cols-[1fr_auto_auto] gap-x-3 border-t border-border px-4 py-2 text-caption">
          <span>Item</span>
          <span className="min-w-[4.5rem] text-right tabular-nums">In stock</span>
          <span className="min-w-[4.5rem] text-right tabular-nums">Buy</span>
        </div>
        {p.stock_needed.map((l) => {
          const buy = l.to_buy ?? Math.max(0, l.required - l.on_hand);
          return (
            <div
              key={l.stock_item_id ?? l.code ?? l.name}
              className="grid grid-cols-[1fr_auto_auto] items-baseline gap-x-3 border-t border-border px-4 py-3"
            >
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink">{l.name}</p>
                <p className="text-caption">
                  Need {fmtQty(l.required, l.unit)} · type {itemType(l.unit)}
                </p>
              </div>
              <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums text-ink">
                {fmtNum(l.on_hand)}
              </span>
              <span className="min-w-[4.5rem] text-right text-sm font-semibold tabular-nums text-debit">
                {fmtNum(buy)}
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
