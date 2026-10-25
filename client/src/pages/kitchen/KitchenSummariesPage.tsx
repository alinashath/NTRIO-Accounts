import { ClipboardCopy, FileImage, FileSpreadsheet, Printer } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/api/http";
import { ListRow, PanelCard, StatRow } from "@/components/design";
import { TextField } from "@/components/ui";
import {
  buildShareCardSvg,
  copyText,
  downloadPngFromSvg,
  downloadText,
  printHtml,
  toCsv,
} from "@/lib/download";
import type { KitchenPlanDto, KitchenSummariesDto } from "../../../../shared/types";

function todayYmd() {
  return new Date().toISOString().slice(0, 10);
}

/** KOT metrics with quantity > 0 only. */
function kotNonZeroLines(k: KitchenPlanDto): Array<{ label: string; value: number }> {
  return (
    [
      { label: "Roshi", value: k.roshi },
      { label: "Mashuni cups", value: k.mashuni_cups },
      { label: "Sausages", value: k.sausages },
      { label: "Eggs omelette", value: k.eggs_omelette },
      { label: "Eggs fried", value: k.eggs_fried },
      { label: "Eggs boiled", value: k.eggs_boiled },
      { label: "Eggs scrambled", value: k.eggs_scrambled },
      { label: "Potato servings", value: k.potato_servings },
      { label: "Pancakes", value: k.pancakes },
    ] as const
  ).filter((line) => line.value > 0);
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

export function KitchenSummariesPage() {
  const [date, setDate] = useState(todayYmd);
  const [data, setData] = useState<KitchenSummariesDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const d = await apiFetch<KitchenSummariesDto>(`/api/kitchen/summaries?date=${date}`);
    setData(d);
  }, [date]);

  useEffect(() => {
    void load().catch((e) => setError(e instanceof Error ? e.message : "Failed"));
  }, [load]);

  function serverShareText() {
    if (!data) return "";
    return [
      `Server breakfast summary — ${data.date}`,
      "",
      ...data.server_summary.map(
        (r) =>
          `${r.breakfast_time} · Room ${r.room_number} · M:${r.maldivian} C:${r.continental} Juice:${r.juice} Tea/Coffee:${r.tea_or_coffee}${
            r.outside_normal_window ? " · OUTSIDE WINDOW" : ""
          }${r.special_requests.length ? ` · ${r.special_requests.join("; ")}` : ""}`,
      ),
    ].join("\n");
  }

  function kotShareText() {
    if (!data) return "";
    const k = data.kitchen_plan;
    const lines = kotNonZeroLines(k);
    return [
      `KOT / Kitchen plan — ${data.date}`,
      ...(lines.length ? lines.map((l) => `${l.label}: ${l.value}`) : ["(No prep quantities)"]),
      "",
      "Schedule:",
      ...k.schedule.map(
        (s) =>
          `${s.serving_time} Room ${s.room_number} G${s.guest_number} ${s.breakfast_type} ${s.egg_style}${
            s.outside_normal_window ? " [OUTSIDE WINDOW]" : ""
          }${s.special_requests ? ` — ${s.special_requests}` : ""}`,
      ),
    ].join("\n");
  }

  function downloadServerCsv() {
    if (!data) return;
    downloadText(
      `server-summary-${date}.csv`,
      toCsv(
        [
          "Date",
          "Breakfast Time",
          "Room Number",
          "Maldivian",
          "Continental",
          "Juice",
          "Tea or Coffee",
          "Special Requests",
          "Outside Window",
        ],
        data.server_summary.map((r) => [
          r.date,
          r.breakfast_time,
          r.room_number,
          r.maldivian,
          r.continental,
          r.juice,
          r.tea_or_coffee,
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
        value: `M${r.maldivian}  C${r.continental}`,
      })),
      sections: [
        {
          heading: "Details",
          lines: data.server_summary.map((r) => {
            const bits = [
              `${r.breakfast_time} R${r.room_number}`,
              `Juice ${r.juice}`,
              `Tea/Coffee ${r.tea_or_coffee}`,
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
    const summary = toCsv(
      ["Metric", "Quantity"],
      kotNonZeroLines(k).map((l) => [l.label, l.value]),
    );
    const schedule = toCsv(
      ["Serving time", "Room", "Guest", "Type", "Egg", "Outside window", "Special requests"],
      k.schedule.map((s) => [
        s.serving_time,
        s.room_number,
        s.guest_number,
        s.breakfast_type,
        s.egg_style,
        s.outside_normal_window,
        s.special_requests,
      ]),
    );
    downloadText(`KOT-${date}.csv`, `${summary}\n\n${schedule}`, "text/csv;charset=utf-8");
  }

  function downloadKotPng() {
    if (!data) return;
    const k = data.kitchen_plan;
    const lines = kotNonZeroLines(k);
    const svg = buildShareCardSvg({
      title: "KOT / Kitchen plan",
      subtitle: data.date,
      rows: lines.length
        ? lines.map((l) => ({ label: l.label, value: String(l.value) }))
        : [{ label: "Prep quantities", value: "None" }],
      sections: [
        {
          heading: "Preparation schedule",
          lines: k.schedule.length
            ? k.schedule.map((s) => {
                const bits = [
                  `${s.serving_time} Room ${s.room_number} G${s.guest_number}`,
                  s.breakfast_type,
                  s.egg_style,
                  s.outside_normal_window ? "OUTSIDE WINDOW" : null,
                  s.special_requests || null,
                ].filter(Boolean);
                return bits.join(" · ");
              })
            : ["No schedule rows"],
        },
      ],
    });
    void downloadPngFromSvg(`KOT-${date}.png`, svg)
      .then(() => setMsg("KOT PNG ready"))
      .catch(() => setError("PNG download failed"));
  }

  function printServer() {
    if (!data) return;
    const rows = data.server_summary
      .map(
        (r) =>
          `<tr><td>${r.date}</td><td>${r.breakfast_time}</td><td>${r.room_number}</td><td>${r.maldivian}</td><td>${r.continental}</td><td>${r.juice}</td><td>${r.tea_or_coffee}</td><td>${r.special_requests.join("; ")}</td><td>${r.outside_normal_window ? "YES" : ""}</td></tr>`,
      )
      .join("");
    printHtml(
      `Server summary ${date}`,
      `<h1>Breakfast summary for servers</h1><p>${date}</p><table><thead><tr><th>Date</th><th>Time</th><th>Room</th><th>Maldivian</th><th>Continental</th><th>Juice</th><th>Tea/Coffee</th><th>Special requests</th><th>Outside</th></tr></thead><tbody>${rows}</tbody></table>`,
    );
  }

  function printKot() {
    if (!data) return;
    const k = data.kitchen_plan;
    const lines = kotNonZeroLines(k);
    const metrics = lines.length
      ? `<ul>${lines.map((l) => `<li>${l.label}: ${l.value}</li>`).join("")}</ul>`
      : "<p>No prep quantities</p>";
    const sched = k.schedule
      .map(
        (s) =>
          `<tr><td>${s.serving_time}</td><td>${s.room_number}</td><td>${s.guest_number}</td><td>${s.breakfast_type}</td><td>${s.egg_style}</td><td>${s.outside_normal_window ? "FLAG" : ""}</td><td>${s.special_requests ?? ""}</td></tr>`,
      )
      .join("");
    printHtml(
      `KOT ${date}`,
      `<h1>KOT / Kitchen plan</h1><p>${date}</p>
      ${metrics}
      <h2>Preparation schedule</h2>
      <table><thead><tr><th>Time</th><th>Room</th><th>Guest</th><th>Type</th><th>Egg</th><th>Outside</th><th>Requests</th></tr></thead><tbody>${sched}</tbody></table>`,
    );
  }

  const k = data?.kitchen_plan;
  const kotLines = k ? kotNonZeroLines(k) : [];

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-page-title text-ink">Server summary &amp; KOT</h1>
          <p className="mt-1 text-caption">Copy · CSV · PNG · Print</p>
        </div>
        <TextField label="Date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
      </div>

      {error ? <p className="text-sm font-medium text-debit">{error}</p> : null}
      {msg ? <p className="text-sm font-medium text-credit">{msg}</p> : null}

      <PanelCard title="Breakfast summary for servers" caption={date}>
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
                `M ${r.maldivian}`,
                `C ${r.continental}`,
                `Juice ${r.juice}`,
                `Tea/Coffee ${r.tea_or_coffee}`,
                r.outside_normal_window ? "Outside window" : null,
                r.special_requests.join("; ") || null,
              ]
                .filter(Boolean)
                .join(" · ")}
              right={
                <span className="text-sm font-semibold tabular-nums text-ink">
                  {r.maldivian + r.continental}
                </span>
              }
              rightSecondary="guests"
            />
          ))
        )}
      </PanelCard>

      <PanelCard title="KOT / Kitchen plan" caption={date}>
        <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
          <ActionIcon
            label="Copy KOT"
            onClick={() =>
              void copyText(kotShareText())
                .then(() => setMsg("KOT copied"))
                .catch(() => setError("Copy failed"))
            }
          >
            <ClipboardCopy className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download KOT CSV" onClick={downloadKotCsv}>
            <FileSpreadsheet className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Download KOT PNG" onClick={downloadKotPng}>
            <FileImage className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
          <ActionIcon label="Print / PDF" onClick={printKot}>
            <Printer className="h-5 w-5" strokeWidth={1.8} aria-hidden />
          </ActionIcon>
        </div>
        {kotLines.map((l) => (
          <StatRow
            key={l.label}
            label={l.label}
            value={<span className="text-amount-lg tabular-nums">{l.value}</span>}
          />
        ))}
        {k && kotLines.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No prep quantities for this date.</p>
        ) : null}

        <div className="border-t border-border px-4 py-3">
          <p className="text-label">Preparation schedule</p>
        </div>
        {(k?.schedule ?? []).map((s, i) => (
          <ListRow
            key={i}
            primary={`${s.serving_time} · Room ${s.room_number} · Guest ${s.guest_number}`}
            secondary={[
              s.breakfast_type,
              s.egg_style,
              s.outside_normal_window ? "Outside window" : null,
              s.special_requests,
            ]
              .filter(Boolean)
              .join(" · ")}
            right={
              s.outside_normal_window ? (
                <span className="text-sm font-semibold text-debit">Flag</span>
              ) : (
                <span className="text-caption">—</span>
              )
            }
          />
        ))}
        {k && k.schedule.length === 0 ? (
          <p className="border-t border-border px-4 py-3 text-caption">No schedule rows.</p>
        ) : null}
      </PanelCard>
    </div>
  );
}
