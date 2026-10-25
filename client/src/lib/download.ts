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

export function printHtml(title: string, bodyHtml: string) {
  const w = window.open("", "_blank", "noopener,noreferrer,width=800,height=900");
  if (!w) return;
  w.document.write(`<!DOCTYPE html><html><head><title>${title}</title>
    <style>
      body{font-family:system-ui,sans-serif;padding:24px;color:#171717;font-size:13px}
      h1{font-size:18px;margin:0 0 8px} h2{font-size:14px;margin:16px 0 8px}
      table{border-collapse:collapse;width:100%;margin-top:8px}
      th,td{border:1px solid #e5e5e5;padding:6px 8px;text-align:left}
      th{background:#f0f0f0}
      .flag{color:#d3212c;font-weight:600}
      @media print{body{padding:0}}
    </style></head><body>${bodyHtml}</body></html>`);
  w.document.close();
  w.focus();
  w.print();
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
