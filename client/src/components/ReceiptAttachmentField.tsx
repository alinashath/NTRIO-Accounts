import { useEffect, useRef, useState } from "react";
import { TextField } from "@/components/ui";
import { uploadReceiptFile } from "@/lib/receiptUpload";

/** Swallow the click that mobile browsers fire after the native file picker closes. */
function swallowFollowUpPointer() {
  const stop = (e: Event) => {
    e.preventDefault();
    e.stopPropagation();
  };
  const types = ["click", "pointerdown", "pointerup"] as const;
  for (const type of types) window.addEventListener(type, stop, true);
  window.setTimeout(() => {
    for (const type of types) window.removeEventListener(type, stop, true);
  }, 500);
}

export function ReceiptAttachmentField({
  attachmentUrl,
  onAttachmentUrlChange,
  userId,
  disabled,
  label = "Receipt (optional)",
  urlLabel = "Receipt URL (optional — paste if not uploading)",
}: {
  attachmentUrl: string;
  onAttachmentUrlChange: (url: string) => void;
  userId: string;
  disabled?: boolean;
  label?: string;
  urlLabel?: string;
}) {
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const picking = useRef(false);

  useEffect(() => {
    const onFocus = () => {
      if (!picking.current) return;
      picking.current = false;
      swallowFollowUpPointer();
    };
    window.addEventListener("focus", onFocus);
    return () => window.removeEventListener("focus", onFocus);
  }, []);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    const onCancel = () => {
      picking.current = false;
      swallowFollowUpPointer();
    };
    el.addEventListener("cancel", onCancel);
    return () => el.removeEventListener("cancel", onCancel);
  }, []);

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
      <span className="block text-sm font-medium text-ink">{label}</span>
      <div className="relative">
        <div className="pointer-events-none flex min-h-11 w-full flex-col justify-center rounded-sm border border-dashed border-[var(--control-border)] bg-neutral-bg/50 px-3 py-3">
          <span className="text-sm font-medium text-ink">{busy ? "Uploading…" : "Choose photo or PDF"}</span>
          <span className="mt-0.5 text-caption">Tap to upload from camera or files</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          aria-label={label}
          accept="image/*,.pdf,application/pdf"
          className="absolute inset-0 z-10 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
          onClick={() => {
            picking.current = true;
          }}
          onChange={(e) => {
            swallowFollowUpPointer();
            void onFile(e);
          }}
          disabled={disabled || busy}
        />
      </div>
      <TextField
        label={urlLabel}
        value={attachmentUrl}
        onChange={(e) => onAttachmentUrlChange(e.target.value)}
        disabled={disabled}
      />
      {err ? <p className="text-caption text-debit">{err}</p> : null}
      {busy ? <p className="text-caption">Uploading…</p> : null}
    </div>
  );
}
