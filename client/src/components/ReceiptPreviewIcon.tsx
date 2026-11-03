import { useState } from "react";
import { Receipt } from "lucide-react";
import { Modal } from "@/components/Modal";

function isLikelyPdf(url: string) {
  const u = url.toLowerCase().split("?")[0] ?? "";
  return u.endsWith(".pdf");
}

export function ReceiptPreviewIcon({
  url,
  className = "",
}: {
  url: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const pdf = isLikelyPdf(url);

  return (
    <>
      <button
        type="button"
        className={`inline-flex rounded-lg border border-border bg-surface p-1.5 text-muted-label transition hover:border-border hover:bg-neutral-bg hover:text-ink ${className}`}
        aria-label="View receipt"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <Receipt className="h-4 w-4" />
      </button>
      <Modal open={open} title="Receipt" size="lg" onClose={() => setOpen(false)}>
        <div className="space-y-3">
          {pdf ? (
            <iframe src={url} className="h-[min(70vh,560px)] w-full rounded-lg border border-border" title="Receipt PDF" />
          ) : (
            <img src={url} alt="Receipt" className="mx-auto max-h-[min(70vh,560px)] w-auto max-w-full rounded-lg border border-border" />
          )}
          <p className="text-center text-xs">
            <a href={url} target="_blank" rel="noopener noreferrer" className="font-medium text-action underline">
              Open in new tab
            </a>
          </p>
        </div>
      </Modal>
    </>
  );
}
