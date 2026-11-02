import { useState } from "react";
import { TextField } from "@/components/ui";
import { uploadReceiptFile } from "@/lib/receiptUpload";

export function ReceiptAttachmentField({
  attachmentUrl,
  onAttachmentUrlChange,
  userId,
  disabled,
}: {
  attachmentUrl: string;
  onAttachmentUrlChange: (url: string) => void;
  userId: string;
  disabled?: boolean;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (!f) return;
    setErr(null);
    setBusy(true);
    try {
      const url = await uploadReceiptFile(f, userId);
      onAttachmentUrlChange(url);
    } catch (er) {
      setErr(er instanceof Error ? er.message : "Upload failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-3">
      <span className="block text-sm font-medium text-ink">Receipt (optional)</span>
      <label className="flex min-h-11 w-full cursor-pointer touch-manipulation flex-col justify-center rounded-sm border border-dashed border-[var(--control-border)] bg-neutral-bg/50 px-3 py-3">
        <span className="text-sm font-medium text-ink">{busy ? "Uploading…" : "Choose photo or PDF"}</span>
        <span className="mt-0.5 text-caption">Tap to upload from camera or files</span>
        <input
          type="file"
          aria-label="Upload receipt file"
          accept="image/*,.pdf,application/pdf"
          className="sr-only"
          onChange={(e) => void onFile(e)}
          disabled={disabled || busy}
        />
      </label>
      <TextField
        label="Receipt URL (optional — paste if not uploading)"
        value={attachmentUrl}
        onChange={(e) => onAttachmentUrlChange(e.target.value)}
        disabled={disabled}
      />
      {err ? <p className="text-caption text-debit">{err}</p> : null}
      {busy ? <p className="text-caption">Uploading…</p> : null}
    </div>
  );
}
