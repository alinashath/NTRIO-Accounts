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
    <div className="space-y-2">
      <span className="block text-sm font-medium text-slate-700">Receipt (optional)</span>
      <input
        type="file"
        aria-label="Upload receipt file"
        accept="image/*,.pdf,application/pdf"
        className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-100 file:px-3 file:py-2 file:text-sm file:font-medium file:text-slate-800"
        onChange={(e) => void onFile(e)}
        disabled={disabled || busy}
      />
      <TextField
        label="Receipt URL (optional — paste if not uploading)"
        value={attachmentUrl}
        onChange={(e) => onAttachmentUrlChange(e.target.value)}
        disabled={disabled}
      />
      {err ? <p className="text-xs text-red-600">{err}</p> : null}
      {busy ? <p className="text-xs text-slate-500">Uploading…</p> : null}
    </div>
  );
}
