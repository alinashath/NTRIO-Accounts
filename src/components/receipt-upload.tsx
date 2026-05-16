"use client";

import { Camera } from "lucide-react";
import { useRef } from "react";

interface ReceiptUploadProps {
  label?: string;
  file: File | null;
  onChange: (file: File | null) => void;
}

export function ReceiptUpload({
  label = "Receipt photo (optional)",
  file,
  onChange,
}: ReceiptUploadProps) {
  const inputRef = useRef<HTMLInputElement>(null);

  return (
    <div className="block">
      <span className="mb-1.5 block text-sm font-medium text-slate-700">
        {label}
      </span>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => onChange(e.target.files?.[0] ?? null)}
      />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-slate-50 px-4 py-3 text-sm text-muted transition hover:border-brand-300 hover:bg-brand-50/50"
      >
        <Camera className="h-5 w-5" />
        {file ? file.name : "Tap to add photo"}
      </button>
    </div>
  );
}
