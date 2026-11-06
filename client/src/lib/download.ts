/** Trigger a browser download of text content. */
export function downloadText(filename: string, content: string, mime = "text/plain;charset=utf-8") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function toCsv(headers: string[], rows: Array<Array<string | number | boolean | null | undefined>>) {
  const esc = (v: string | number | boolean | null | undefined) => {
    const s = v == null ? "" : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(esc).join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

export async function copyText(text: string) {
  await navigator.clipboard.writeText(text);
}

export function printHtml(
  title: string,
  bodyHtml: string,
  opts?: { receipt?: boolean },
) {
  // Do not use noopener — it makes window.open return null and leaves a blank tab.
  const w = window.open("", "_blank", "width=720,height=900");
  if (!w) return;
  const receiptCss = opts?.receipt
    ? `
      body{font-family:"IBM Plex Sans",ui-monospace,Menlo,Consolas,monospace;padding:16px;color:#181a20;font-size:12px;max-width:480px;margin:0 auto}
      h1{font-size:15px;margin:0;text-align:center;letter-spacing:0.04em;text-transform:uppercase}
      .sub{text-align:center;color:#707a8a;margin:4px 0 12px;font-size:11px}
      .rule{border:0;border-top:1px solid #181a20;margin:10px 0}
      .rule-dashed{border:0;border-top:1px dashed #cdd1d6;margin:8px 0}
      .sec{font-size:11px;font-weight:700;letter-spacing:0.06em;text-transform:uppercase;margin:0 0 6px;color:#181a20}
      table.rcpt{border-collapse:collapse;width:100%;margin:0 0 4px}
      table.rcpt th,table.rcpt td{border:0;padding:3px 2px;vertical-align:top;font-size:11px}
      table.rcpt th{color:#707a8a;font-weight:600;font-size:9px;text-transform:uppercase;letter-spacing:0.04em;border-bottom:1px solid #eaecef}
      table.rcpt .c1{text-align:left}
      table.rcpt .c2,table.rcpt .c3,table.rcpt .c4,table.rcpt .c5{text-align:right;font-variant-numeric:tabular-nums;font-family:"IBM Plex Sans",ui-monospace,monospace}
      table.rcpt.cols3 .c1{width:54%} table.rcpt.cols3 .c2{width:22%} table.rcpt.cols3 .c3{width:24%;color:#374151}
      table.rcpt.cols5 .c1{width:34%} table.rcpt.cols5 .c2{width:14%} table.rcpt.cols5 .c3{width:16%} table.rcpt.cols5 .c4{width:14%} table.rcpt.cols5 .c5{width:22%;color:#374151;text-align:right}
      .empty{color:#707a8a;font-size:11px;margin:0 0 4px}
      .flag{color:#f6465d;font-weight:600}
      @media print{body{padding:0;max-width:none}}
    `
    : `
      body{font-family:system-ui,sans-serif;padding:24px;color:#171717;font-size:13px}
      h1{font-size:18px;margin:0 0 8px} h2{font-size:14px;margin:16px 0 8px}
      table{border-collapse:collapse;width:100%;margin-top:8px}
      th,td{border:1px solid #e5e5e5;padding:6px 8px;text-align:left}
      th{background:#f0f0f0}
      .flag{color:#d3212c;font-weight:600}
      @media print{body{padding:0}}
    `;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>${receiptCss}</style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
}

/**
 * Print / Save as PDF for a single report node only (no hub, nav, KPI cards, charts).
 * Uses the current page + @media print so styles stay intact (popup clone was blank).
 */
export function printDomElement(
  title: string,
  el: HTMLElement,
  opts?: { orgTitle?: string | null },
) {
  const prevTitle = document.title;
  document.title = title;

  let brand: HTMLParagraphElement | null = null;
  const org = opts?.orgTitle?.trim();
  if (org) {
    brand = document.createElement("p");
    brand.setAttribute("data-print-brand", "");
    brand.className = "mb-3 text-xs font-bold uppercase tracking-[0.08em] text-ink";
    brand.textContent = org;
    el.insertBefore(brand, el.firstChild);
  }

  el.setAttribute("data-print-root", "");
  document.documentElement.classList.add("printing-report");

  let cleaned = false;
  const cleanup = () => {
    if (cleaned) return;
    cleaned = true;
    document.documentElement.classList.remove("printing-report");
    el.removeAttribute("data-print-root");
    brand?.remove();
    document.title = prevTitle;
    window.removeEventListener("afterprint", cleanup);
  };

  window.addEventListener("afterprint", cleanup);
  requestAnimationFrame(() => {
    window.print();
    // Safari / some mobile browsers skip afterprint
    setTimeout(cleanup, 1500);
  });
}

export function escapeXml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Share-card SVG sized for phone chat (WhatsApp / Viber).
 * Large type, high contrast, portrait width ~1080 so text stays readable after compression.
 */
export function buildShareCardSvg(opts: {
  title: string;
  subtitle?: string;
  /** Two-column rows: label | value (value right-aligned). */
  rows: Array<{ label: string; value: string; emphasize?: boolean }>;
  sections?: Array<{ heading: string; lines: string[] }>;
}) {
  const width = 1080;
  const padX = 48;
  const rowH = 72;
  const titleSize = 44;
  const subtitleSize = 28;
  const labelSize = 32;
  const valueSize = 36;
  const sectionHeadSize = 26;
  const lineSize = 28;
  const lineH = 44;

  let y = 56;
  const parts: string[] = [];

  parts.push(
    `<text x="${padX}" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${titleSize}" font-weight="700" fill="#111827">${escapeXml(opts.title)}</text>`,
  );
  y += 40;
  if (opts.subtitle) {
    parts.push(
      `<text x="${padX}" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${subtitleSize}" fill="#4B5563">${escapeXml(opts.subtitle)}</text>`,
    );
    y += 36;
  }
  y += 16;

  for (const row of opts.rows) {
    const mid = y + rowH / 2 + labelSize / 3;
    parts.push(`<line x1="${padX}" y1="${y}" x2="${width - padX}" y2="${y}" stroke="#E5E7EB" stroke-width="2"/>`);
    parts.push(
      `<text x="${padX}" y="${mid}" font-family="system-ui,-apple-system,sans-serif" font-size="${labelSize}" fill="#111827">${escapeXml(row.label)}</text>`,
    );
    parts.push(
      `<text x="${width - padX}" y="${mid}" text-anchor="end" font-family="system-ui,-apple-system,sans-serif" font-size="${valueSize}" font-weight="${row.emphasize === false ? "600" : "700"}" fill="#111827">${escapeXml(row.value)}</text>`,
    );
    y += rowH;
  }

  if (opts.sections?.length) {
    for (const section of opts.sections) {
      y += 28;
      parts.push(
        `<text x="${padX}" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${sectionHeadSize}" font-weight="700" fill="#4B5563">${escapeXml(section.heading.toUpperCase())}</text>`,
      );
      y += 24;
      for (const line of section.lines) {
        y += lineH;
        const truncated = line.length > 72 ? `${line.slice(0, 69)}…` : line;
        parts.push(
          `<text x="${padX}" y="${y}" font-family="system-ui,-apple-system,sans-serif" font-size="${lineSize}" fill="#111827">${escapeXml(truncated)}</text>`,
        );
      }
    }
  }

  y += 48;
  const height = Math.max(y, 320);

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  ${parts.join("\n  ")}
</svg>`;
}

export type ReceiptSection = {
  heading: string;
  /** 3-col: Item | Qty | Type — or 5-col stock: Item | Need | In stock | Buy | Type */
  headers?: string[];
  rows: string[][];
};

/**
 * Compact receipt-style SVG with clear section rules.
 * Supports 3-column sections and 5-column stock (Item / Need / In stock / Buy / Type).
 */
export function buildReceiptSvg(opts: {
  title: string;
  subtitle?: string;
  sections: ReceiptSection[];
}) {
  const width = 800;
  const padX = 24;
  const titleSize = 22;
  const subSize = 14;
  const headSize = 13;
  const cellSize = 14;
  const rowH = 26;
  const font = "IBM Plex Sans,ui-monospace,Menlo,Consolas,monospace";

  let y = 36;
  const parts: string[] = [];

  parts.push(
    `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${titleSize}" font-weight="700" fill="#181a20">${escapeXml(opts.title.toUpperCase())}</text>`,
  );
  y += 22;
  if (opts.subtitle) {
    parts.push(
      `<text x="${width / 2}" y="${y}" text-anchor="middle" font-family="${font}" font-size="${subSize}" fill="#707a8a">${escapeXml(opts.subtitle)}</text>`,
    );
    y += 18;
  }

  const solidRule = (yy: number) =>
    `<line x1="${padX}" y1="${yy}" x2="${width - padX}" y2="${yy}" stroke="#181a20" stroke-width="1.5"/>`;
  const dashedRule = (yy: number) =>
    `<line x1="${padX}" y1="${yy}" x2="${width - padX}" y2="${yy}" stroke="#cdd1d6" stroke-width="1" stroke-dasharray="4 3"/>`;

  /** Right-edge x positions for trailing numeric columns (from right). */
  function colXs(colCount: number): number[] {
    if (colCount >= 5) {
      // Item | Need | In stock | Buy | Type
      return [padX, width - padX - 280, width - padX - 190, width - padX - 100, width - padX];
    }
    // Item | Qty | Note — wider gap so qty never overlaps a long note
    return [padX, width - padX - 220, width - padX];
  }

  parts.push(solidRule(y));
  y += 14;

  for (const section of opts.sections) {
    const colCount = Math.max(3, section.headers?.length ?? 3, ...(section.rows.map((r) => r.length) || [3]));
    const xs = colXs(colCount);
    const headers =
      section.headers ??
      (colCount >= 5
        ? ["Item", "Need", "In stock", "Buy", "Type"]
        : ["Item", "Qty", "Type"]);

    parts.push(
      `<text x="${padX}" y="${y}" font-family="${font}" font-size="${headSize}" font-weight="700" letter-spacing="0.08em" fill="#181a20">${escapeXml(section.heading.toUpperCase())}</text>`,
    );
    y += 8;
    parts.push(dashedRule(y));
    y += 16;

    for (let i = 0; i < headers.length; i++) {
      const anchor = i === 0 ? "start" : "end";
      parts.push(
        `<text x="${xs[i]}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="10" font-weight="600" fill="#707a8a">${escapeXml(headers[i].toUpperCase())}</text>`,
      );
    }
    y += 6;
    parts.push(dashedRule(y));
    y += rowH - 4;

    if (!section.rows.length) {
      parts.push(
        `<text x="${xs[0]}" y="${y}" font-family="${font}" font-size="${cellSize}" fill="#707a8a">—</text>`,
      );
      y += rowH;
    } else {
      const maxItem = colCount >= 5 ? 22 : 28;
      const maxNote = colCount >= 5 ? 10 : 14;
      const maxMid = 8;
      const clip = (s: string, max: number) =>
        s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
      for (const row of section.rows) {
        for (let i = 0; i < headers.length; i++) {
          const raw = row[i] ?? "—";
          const val =
            i === 0
              ? clip(raw, maxItem)
              : i === headers.length - 1
                ? clip(raw, maxNote)
                : clip(raw, maxMid);
          const anchor = i === 0 ? "start" : "end";
          const weight = i === 0 || i === headers.length - 1 ? "400" : "600";
          const fill = i === headers.length - 1 ? "#374151" : "#181a20";
          parts.push(
            `<text x="${xs[i]}" y="${y}" text-anchor="${anchor}" font-family="${font}" font-size="${cellSize}" font-weight="${weight}" fill="${fill}">${escapeXml(val)}</text>`,
          );
        }
        y += rowH;
      }
    }

    y += 4;
    parts.push(solidRule(y));
    y += 16;
  }

  y += 8;
  const height = Math.max(y, 240);
  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
  <rect width="100%" height="100%" fill="#FFFFFF"/>
  ${parts.join("\n  ")}
</svg>`;
}

/** Rasterize SVG → PNG (2×) for crisp WhatsApp / Viber sharing. */
export function downloadPngFromSvg(filename: string, svg: string, scale = 2): Promise<void> {
  return new Promise((resolve, reject) => {
    const blob = new Blob([svg], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const img = new Image();
    img.onload = () => {
      try {
        const w = img.naturalWidth || 1080;
        const h = img.naturalHeight || 320;
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(w * scale);
        canvas.height = Math.round(h * scale);
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          URL.revokeObjectURL(url);
          reject(new Error("Canvas unavailable"));
          return;
        }
        ctx.fillStyle = "#FFFFFF";
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.scale(scale, scale);
        ctx.drawImage(img, 0, 0);
        URL.revokeObjectURL(url);
        canvas.toBlob(
          (png) => {
            if (!png) {
              reject(new Error("PNG encode failed"));
              return;
            }
            const out = URL.createObjectURL(png);
            const a = document.createElement("a");
            a.href = out;
            a.download = filename.endsWith(".png") ? filename : `${filename}.png`;
            a.click();
            URL.revokeObjectURL(out);
            resolve();
          },
          "image/png",
        );
      } catch (e) {
        URL.revokeObjectURL(url);
        reject(e);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not render image"));
    };
    img.src = url;
  });
}
